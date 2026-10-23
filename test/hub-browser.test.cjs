const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { chromium } = require('playwright');

let browser;
const hubCode = readFileSync(require('node:path').join(__dirname, '../src/hub.js'), 'utf8');
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function setup(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.setDefaultTimeout(4000);
  await page.route('http://hub-test.local/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<main><fieldset data-id="q1"><legend>Quanto é 2 + 2?</legend><label><input type="radio" name="q1" value="3">3</label><label><input type="radio" name="q1" value="4">4</label></fieldset></main>',
  }));
  await page.goto('http://hub-test.local/');
  await page.evaluate(options => {
    window.uiTest = {
      confidence: 'high', indices: [1], delay: 60, current: true,
      applySelected: true, applyDelay: 20, solveFailures: 0,
      applies: 0, solves: 0, completed: 0, aborted: 0,
      storageWrites: 0, sharedFingerprint: false, toastEvents: [], confirmedIds: [], scanWarnings: [], ...options,
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) {
      window.uiTest.storageWrites++;
      return originalSetItem.apply(this, args);
    };
    window.createPageAdapter = () => ({
      scan: () => ({
        questions: window.uiTest.current ? [...document.querySelectorAll('fieldset[data-id]')].map(element => ({
          id: element.dataset.id,
          fingerprint: window.uiTest.sharedFingerprint ? 'same-question-content' : `${element.dataset.id}-v1`,
          prompt: element.querySelector('legend').textContent,
          multiple: false,
          element,
          options: [...element.querySelectorAll('input')].map((option, index) => ({ index, text: option.value, element: option, type: 'radio' })),
        })) : [],
        warnings: window.uiTest.scanWarnings,
      }),
      isCurrent: question => window.uiTest.current && question.element.isConnected,
      apply: async (question, indices) => {
        window.uiTest.applies++;
        if (!window.uiTest.applySelected) return { selected: false, message: 'O site não confirmou a marcação.' };
        const previous = question.options.map(option => option.element.checked);
        question.options[indices[0]].element.click();
        await new Promise(resolve => setTimeout(resolve, window.uiTest.applyDelay));
        window.uiTest.confirmedIds.push(question.id);
        return {
          selected: true,
          message: 'Marcada.',
          undo: async () => {
            question.options.forEach((option, index) => { option.element.checked = previous[index]; });
            return { restored: true, message: 'Desfeito.' };
          },
        };
      },
    });
    window.createGroqClient = () => ({
      solve: ({ signal }) => {
        window.uiTest.solves++;
        return new Promise((resolve, reject) => {
          let settled = false;
          const abort = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            window.uiTest.aborted++;
            reject(Object.assign(new Error('Cancelado'), { code: 'ABORTED' }));
          };
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            signal.removeEventListener('abort', abort);
            window.uiTest.completed++;
            if (window.uiTest.solveFailures > 0) {
              window.uiTest.solveFailures--;
              reject(Object.assign(new Error('Falha de teste na Groq.'), { code: 'FORMAT' }));
            } else resolve({ indices: window.uiTest.indices, explanation: '2 + 2 = 4.', confidence: window.uiTest.confidence });
          }, window.uiTest.delay);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
      },
    });
    window.uiTest.addQuestion = id => {
      const fieldset = document.createElement('fieldset');
      fieldset.dataset.id = id;
      const legend = document.createElement('legend');
      legend.textContent = 'Quanto é 2 + 2?';
      fieldset.append(legend);
      for (const value of ['3', '4']) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = id;
        input.value = value;
        label.append(input, value);
        fieldset.append(label);
      }
      document.querySelector('main').append(fieldset);
    };
  }, options);
  await page.evaluate(`(() => { ${hubCode}\n })()`);
  await page.evaluate(() => {
    const shadow = document.querySelector('#lume-groq-hub').shadowRoot;
    const record = node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.closest('.toasts')) window.uiTest.toastEvents.push(node.textContent.trim());
    };
    new MutationObserver(records => records.forEach(recordMutation => recordMutation.addedNodes.forEach(record)))
      .observe(shadow, { childList: true, subtree: true });
  });
  return page;
}

async function start(page) {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.locator('#lume-api-key').fill('gsk_ui_test_only');
  await page.getByRole('button', { name: 'Salvar e iniciar', exact: true }).click();
}

async function waitForAnswer(page, id = 'q1') {
  await page.waitForFunction(questionId => document.querySelector(`fieldset[data-id="${questionId}"] input[value="4"]`).checked, id);
  await page.waitForFunction(questionId => window.uiTest.confirmedIds.includes(questionId), id);
}

async function metric(page, name) {
  return page.evaluate(name => window.uiTest[name], name);
}

test('compact hub: configuration starts automatically, stage toasts, confirmed counter, undo and no key storage', async () => {
  const page = await setup();
  try {
    assert.equal(await page.locator('#lume-groq-hub .count, #lume-groq-hub .question-select, #lume-groq-hub .prompt, #lume-groq-hub .options').count(), 0);
    await start(page);
    await waitForAnswer(page);
    await page.getByText('Respostas: 1', { exact: true }).first().waitFor();
    assert.equal(await metric(page, 'storageWrites'), 0);
    const stages = (await metric(page, 'toastEvents')).join('\n');
    for (const stage of ['Questão detectada', 'Buscando resposta', 'Resposta detectada', 'Marcando respostas', 'Respostas: 1']) {
      assert.ok(stages.includes(stage), `Missing notification stage: ${stage}`);
    }
    assert.ok(await page.locator('#lume-groq-hub .toasts > *').count() <= 3);
    const bounds = await page.locator('#lume-groq-hub .panel').boundingBox();
    assert.ok(bounds.width <= 300 && bounds.height <= 260, `Panel not compact: ${JSON.stringify(bounds)}`);
    await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
    assert.equal(await page.locator('input[value="4"]').isChecked(), false);
    await page.getByText('Respostas: 0', { exact: true }).first().waitFor();
    assert.equal(await metric(page, 'applies'), 1);
  } finally { await page.close(); }
});

test('automatic watcher: marks new DOM questions once, including identical content with distinct IDs', async () => {
  const page = await setup({ sharedFingerprint: true });
  try {
    await start(page);
    await waitForAnswer(page);
    await page.evaluate(() => window.uiTest.addQuestion('q2'));
    await waitForAnswer(page, 'q2');
    await page.getByText('Respostas: 2', { exact: true }).first().waitFor();
    assert.equal(await metric(page, 'solves'), 2);
    assert.equal(await metric(page, 'applies'), 2);
    await page.evaluate(() => {
      document.querySelector('main').append(document.createElement('p'));
      document.querySelector('fieldset').classList.add('unrelated-mutation');
    });
    await page.waitForTimeout(450);
    assert.equal(await metric(page, 'solves'), 2, 'Page mutations must not repeat completed questions');
    await page.getByRole('button', { name: 'Pausar automático', exact: true }).click();
    await page.getByRole('button', { name: 'Iniciar automático', exact: true }).click();
    await page.waitForTimeout(350);
    assert.equal(await metric(page, 'solves'), 2, 'Explicit restart must still skip completed questions');
  } finally { await page.close(); }
});

test('automatic mode marks low-confidence answers without an extra manual action', async () => {
  const page = await setup({ confidence: 'low' });
  try {
    await start(page);
    await waitForAnswer(page);
    await page.getByText('Respostas: 1', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Marcar sugestão', exact: true }).count(), 0);
    assert.equal(await metric(page, 'applies'), 1);
  } finally { await page.close(); }
});

test('empty scans explain unreadable alternatives once, then distinguish completed questions and scan warnings', async () => {
  const page = await setup({ current: false });
  try {
    await start(page);
    await page.getByText('Nenhuma alternativa reconhecida', { exact: true }).waitFor();
    assert.equal(await metric(page, 'solves'), 0);
    const warning = 'Não consegui reconhecer as alternativas desta página.';
    assert.equal((await metric(page, 'toastEvents')).filter(message => message.includes(warning)).length, 1);
    await page.evaluate(() => document.querySelector('main').append(document.createElement('p')));
    await page.waitForTimeout(350);
    assert.equal((await metric(page, 'toastEvents')).filter(message => message.includes(warning)).length, 1);
    await page.evaluate(() => {
      window.uiTest.current = true;
      document.querySelector('main').append(document.createElement('p'));
    });
    await waitForAnswer(page);
    await page.getByText('Concluído · aguardando próxima questão', { exact: true }).waitFor();
    assert.equal(await metric(page, 'solves'), 1);
  } finally { await page.close(); }

  const warnedPage = await setup({ current: false, scanWarnings: ['Um grupo sem enunciado legível foi ignorado.'] });
  try {
    await start(warnedPage);
    await warnedPage.getByText('Leitura precisa de ajuste', { exact: true }).waitFor();
    assert.equal(await metric(warnedPage, 'solves'), 0);
  } finally { await warnedPage.close(); }
});

test('abstention and unconfirmed selection never increment the response counter', async () => {
  for (const options of [{ indices: [] }, { applySelected: false }]) {
    const page = await setup(options);
    try {
      await start(page);
      await page.waitForFunction(() => window.uiTest.completed === 1);
      await page.waitForTimeout(300);
      assert.equal(await page.locator('input[value="4"]').isChecked(), false);
      assert.equal(await metric(page, 'solves'), 1);
      assert.equal(await page.getByText('Respostas: 1', { exact: true }).count(), 0);
      assert.ok(!(await metric(page, 'toastEvents')).some(message => /Respostas:\s*[1-9]/.test(message)));
      await page.evaluate(() => document.querySelector('main').append(document.createElement('p')));
      await page.waitForTimeout(350);
      assert.equal(await metric(page, 'solves'), 1, 'Failed or abstained answers must not loop on mutations');
    } finally { await page.close(); }
  }
});

test('a page change while the AI is responding prevents stale marking', async () => {
  const page = await setup({ delay: 180 });
  try {
    await start(page);
    await page.waitForFunction(() => window.uiTest.solves === 1);
    await page.evaluate(() => { window.uiTest.current = false; });
    await page.waitForFunction(() => window.uiTest.completed === 1);
    await page.waitForTimeout(150);
    assert.equal(await metric(page, 'applies'), 0);
    assert.equal(await page.locator('input[value="4"]').isChecked(), false);
    assert.ok(!(await metric(page, 'toastEvents')).some(message => /Respostas:\s*[1-9]/.test(message)));
  } finally { await page.close(); }
});

test('pause aborts a pending request, resume retries it, and close aborts and removes the hub', async () => {
  const page = await setup({ delay: 5000 });
  try {
    await start(page);
    await page.waitForFunction(() => window.uiTest.solves === 1);
    await page.getByRole('button', { name: 'Pausar automático', exact: true }).click();
    await page.waitForFunction(() => window.uiTest.aborted === 1);
    assert.equal(await metric(page, 'applies'), 0);
    await page.getByRole('button', { name: 'Iniciar automático', exact: true }).click();
    await page.waitForFunction(() => window.uiTest.solves === 2);
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    assert.equal(await metric(page, 'aborted'), 2);
    assert.equal(await metric(page, 'applies'), 0);
    assert.equal(await page.locator('#lume-groq-hub').count(), 0);
    assert.equal(await page.evaluate(() => window.__LUME_GROQ_HUB__), undefined);
    await page.evaluate(() => window.uiTest.addQuestion('q2'));
    await page.waitForTimeout(350);
    assert.equal(await metric(page, 'solves'), 2, 'Close must disconnect the page observer');
  } finally { await page.close(); }
});

test('errors do not repeat forever; an explicit restart can retry a failed question', async () => {
  const page = await setup({ solveFailures: 1 });
  try {
    await start(page);
    await page.waitForFunction(() => window.uiTest.completed === 1);
    await page.getByText('Erro na consulta · veja o aviso', { exact: true }).waitFor();
    await page.evaluate(() => document.querySelector('main').append(document.createElement('p')));
    await page.waitForTimeout(400);
    assert.equal(await metric(page, 'solves'), 1);
    assert.equal(await metric(page, 'applies'), 0);
    const stop = page.getByRole('button', { name: 'Pausar automático', exact: true });
    if (await stop.isVisible()) await stop.click();
    await page.getByRole('button', { name: 'Iniciar automático', exact: true }).click();
    await waitForAnswer(page);
    assert.equal(await metric(page, 'solves'), 2);
    assert.equal(await metric(page, 'applies'), 1);
  } finally { await page.close(); }
});

test('duplicate injection, minimize, keyboard toggle and mobile layout preserve the tiny panel', async () => {
  const page = await setup();
  try {
    await page.evaluate(`(() => { ${hubCode}\n })()`);
    assert.equal(await page.locator('#lume-groq-hub').count(), 1);
    await page.getByRole('button', { name: 'Minimizar', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir painel Lume', exact: true }).click();
    await page.keyboard.press('Alt+Shift+G');
    assert.equal(await page.getByRole('button', { name: 'Abrir painel Lume', exact: true }).isVisible(), true);
    await page.keyboard.press('Alt+Shift+G');
    await page.setViewportSize({ width: 360, height: 700 });
    const bounds = await page.locator('#lume-groq-hub .panel').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 361 && bounds.width <= 300);
  } finally { await page.close(); }
});
