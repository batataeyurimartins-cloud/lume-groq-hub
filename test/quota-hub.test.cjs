const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const hubCode = readFileSync(path.join(__dirname, '../src/hub.js'), 'utf8');
let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function mount(page, { publicAccess = true, endpoint = 'https://batatahub.test/api/lume/solve' } = {}) {
  await page.evaluate(({ code, publicAccess, endpoint }) => {
    if (publicAccess) window.__LUME_HOSTED_CONFIG__ = { endpoint, public: true };
    // The module is intentionally evaluated twice when testing close/reopen.
    (0, eval)(code);
  }, { code: hubCode, publicAccess, endpoint });
}

async function setup({ retryAfter = 75, publicAccess = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.setDefaultTimeout(4000);
  await page.route('https://sala-quota.test/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<main><h2 data-task-title>Tarefa 1: Ciências</h2><fieldset><legend>Questão 01 de 01 · Quanto é 2 + 2?</legend><label><input type="radio" name="q" value="3">3</label><label><input type="radio" name="q" value="4">4</label></fieldset></main>',
  }));
  await page.goto('https://sala-quota.test/atividade/1');
  await page.evaluate(({ retryAfter }) => {
    window.quotaTest = { now: 1700000000000, solves: 0, applies: 0, errors: [{ code: 'RATE_LIMIT', retryAfter }], intervals: new Set(), configuredIntervals: null };
    Date.now = () => window.quotaTest.now;
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    window.setInterval = (...args) => {
      const id = nativeSetInterval(...args);
      window.quotaTest.intervals.add(id);
      return id;
    };
    window.clearInterval = id => { window.quotaTest.intervals.delete(id); nativeClearInterval(id); };
    window.createPageAdapter = () => ({
      scan: () => {
        const element = document.querySelector('fieldset');
        return { questions: [{ id: 'q1', fingerprint: 'q1-v1', prompt: 'Quanto é 2 + 2?', element,
          multiple: false, options: [{ text: '3' }, { text: '4' }] }], warnings: [] };
      },
      isCurrent: question => question.element.isConnected,
      apply: async () => { window.quotaTest.applies++; return { selected: true }; },
    });
    const client = {
      solve: async () => {
        window.quotaTest.solves++;
        const failure = window.quotaTest.errors.shift();
        if (failure) throw Object.assign(new Error('Limite de consultas atingido.'), failure);
        return { indices: [1], explanation: 'Resposta de teste.', confidence: 'high' };
      },
    };
    window.createHostedClient = options => {
      window.quotaTest.configuredIntervals = [options.minIntervalMs, options.visionIntervalMs];
      return client;
    };
    window.createGroqClient = () => client;
  }, { retryAfter });
  await mount(page, { publicAccess });
  if (!publicAccess) {
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.locator('#lume-api-key').fill('test-key-never-persisted');
    await page.getByRole('button', { name: 'Salvar e iniciar', exact: true }).click();
  } else await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
  await page.waitForFunction(() => window.quotaTest.solves === 1 && document.querySelector('#lume-groq-hub').shadowRoot.querySelector('.toggle').disabled);
  return page;
}

async function assertQueries(page, count) {
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => window.quotaTest.solves), count);
}

test('Retry-After blocks restart, settings, navigation and close/reopen; expiry needs a new click', async () => {
  const page = await setup({ retryAfter: 75 });
  try {
    assert.equal(await page.getByRole('button', { name: 'Aguarde 75 s', exact: true }).isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.quotaTest.configuredIntervals), [6000, 20000]);
    // Even a programmatic click cannot bypass the cooldown guard.
    await page.evaluate(() => document.querySelector('#lume-groq-hub').shadowRoot.querySelector('.toggle').dispatchEvent(new MouseEvent('click')));
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar e iniciar', exact: true }).click();
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.evaluate(() => {
      history.pushState({}, '', '/atividade/2');
      document.querySelector('h2').textContent = 'Tarefa 2: Física';
      document.querySelector('fieldset').replaceWith(document.querySelector('fieldset').cloneNode(true));
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await assertQueries(page, 1);
    assert.equal(await page.getByRole('button', { name: 'Aguarde 75 s', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    assert.equal(await page.evaluate(() => window.quotaTest.intervals.size), 0, 'Closing removes both route and countdown intervals');
    await mount(page, { endpoint: 'https://legacy-lume.test/api/solve' });
    assert.equal(await page.getByRole('button', { name: 'Aguarde 75 s', exact: true }).isDisabled(), true, 'Public aliases share the same account quota');
    await page.evaluate(() => { window.quotaTest.now += 30000; });
    await page.getByRole('button', { name: 'Aguarde 45 s', exact: true }).waitFor();
    await page.evaluate(() => { window.quotaTest.now += 45000; });
    const start = page.getByRole('button', { name: 'Responder tarefa', exact: true });
    await start.waitFor();
    assert.equal(await start.isEnabled(), true);
    await assertQueries(page, 1);
    await start.click();
    await page.waitForFunction(() => window.quotaTest.applies === 1);
    await assertQueries(page, 2);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally { await page.close(); }
});

test('missing Retry-After defaults to one minute and a later limit starts a new wait', async () => {
  const page = await setup({ retryAfter: null });
  try {
    await page.getByRole('button', { name: 'Aguarde 60 s', exact: true }).waitFor();
    await page.evaluate(() => { window.quotaTest.now += 60000; });
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).waitFor();
    await page.evaluate(() => window.quotaTest.errors.push({ code: 'RATE_LIMIT', retryAfter: 120 }));
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await page.getByRole('button', { name: 'Aguarde 120 s', exact: true }).waitFor();
    await assertQueries(page, 2);
    const deadlines = await page.evaluate(() => [...window[Symbol.for('batatahub.lume.cooldowns')]]);
    assert.deepEqual(deadlines, [['hosted:public', 1700000180000]]);
  } finally { await page.close(); }
});

test('direct mode preserves only model-scoped deadlines across reopen and never stores the API key', async () => {
  const page = await setup({ retryAfter: 20, publicAccess: false });
  try {
    await page.getByRole('button', { name: 'Aguarde 20 s', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await mount(page, { publicAccess: false });
    assert.equal(await page.getByRole('button', { name: 'Aguarde 20 s', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('#lume-api-key').inputValue(), '');
    assert.equal(await page.evaluate(() => JSON.stringify([...window[Symbol.for('batatahub.lume.cooldowns')]]).includes('test-key')), false);
    assert.deepEqual(await page.evaluate(() => [...window[Symbol.for('batatahub.lume.cooldowns')]].map(([key]) => key)), ['direct:openai/gpt-oss-120b']);
    await assertQueries(page, 1);
  } finally { await page.close(); }
});
