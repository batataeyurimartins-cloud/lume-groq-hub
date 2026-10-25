const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const project = path.join(__dirname, '..');
const poem = 'Trabalha, e teima, e lima, e sofre, e sua! Mas que na forma se disfarce o emprego do esforço.';
const options = [
  'A) O poema defende trabalho e dedicação.',
  'B) O poeta encontra inspiração no barulho das ruas.',
  'C) A beleza artística parece natural e esconde o esforço.',
  'D) O valor da poesia está apenas em improvisar.',
];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1sAAAAASUVORK5CYII=';

// These are the public Sala INFO and SECTION components' stable MUI structure.
// INFO is not a question: it has a direct subtitle2 containing rich text, and
// optional question media. SECTION has its own numbered header and Collapse.
function info(text, { id = '', extra = '', hidden = false } = {}) {
  return `<div ${id ? `id="${id}"` : ''} class="MuiPaper-root MuiPaper-elevation3 MuiCard-root" ${hidden ? 'hidden' : ''}>
    <h6 class="MuiTypography-root MuiTypography-subtitle2"><div class="MuiBox-root"><div class="ql-editor MuiBox-root"><p>${text}</p></div></div></h6>${extra}
  </div>`;
}
function section(number, text) {
  return `<div class="MuiBox-root"><div class="MuiBox-root"><p class="MuiTypography-root">SEÇÃO ${number}</p><button type="button" aria-label="Recolher seção">−</button></div>
    <div class="MuiBox-root"></div><div class="MuiCollapse-root MuiCollapse-entered"><div class="MuiCollapse-wrapper"><div class="MuiCollapse-wrapperInner">
      <div class="MuiPaper-root MuiPaper-elevation3 MuiCard-root"><div><div><div class="ql-editor MuiBox-root"><p>${text}</p></div></div></div></div>
    </div></div></div></div>`;
}
function multi(id, { number = 1, total = 1, prompt = 'Com base na leitura, assinale as alternativas corretas sobre o poema.' } = {}) {
  return `<div id="${id}" class="MuiPaper-root MuiPaper-elevation3"><h6 class="MuiTypography-root">Questão ${String(number).padStart(2, '0')} de ${String(total).padStart(2, '0')}</h6>
    <div class="main"><p>${prompt}</p></div><div class="MuiBox-root">${options.map((text, index) => `
      <div class="MuiBox-root"><div class="MuiBox-root"><span class="MuiButtonBase-root MuiCheckbox-root"><input type="checkbox" value="${index}"><svg class="MuiSvgIcon-root" aria-hidden="true" width="20" height="20"><rect width="16" height="16"></rect></svg></span>
      <div style="padding:10px"><div class="ql-editor MuiBox-root"><p>${text}</p></div></div></div><hr class="MuiDivider-root"></div>`).join('')}
    </div></div>`;
}

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });
async function pageWith(content, outside = '') {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.setDefaultTimeout(5000);
  await page.setContent(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body>${outside}<main>${content}</main></body></html>`);
  await page.addScriptTag({ content: readFileSync(path.join(project, 'src/page-adapter.js'), 'utf8').replace('export function createPageAdapter', 'window.createPageAdapter = function createPageAdapter') });
  return page;
}

test('preceding Sala reading cards supply the poem while four checkboxes still form one answer and undo together', async () => {
  const page = await pageWith(section('01', 'Seção de leitura sobre criação poética.') + info(poem) + multi('current'));
  try {
    const result = await page.evaluate(async () => {
      const adapter = createPageAdapter();
      const scan = adapter.scan();
      const question = scan.questions[0];
      const prepared = await adapter.prepareQuestion(question);
      const marked = await adapter.apply(question, [0, 2]);
      const selected = [...document.querySelectorAll('#current input:checked')].map(input => input.value);
      const undo = await marked.undo();
      return { count: scan.questions.length, prompt: prepared.prompt, multiple: question.multiple,
        options: question.options.map(option => option.text), selected, marked: marked.selected,
        restored: undo.restored, remaining: document.querySelectorAll('#current input:checked').length };
    });
    assert.equal(result.count, 1);
    assert.ok(result.prompt.includes(poem));
    assert.ok(result.prompt.includes('Seção de leitura sobre criação poética.'));
    assert.ok(result.prompt.includes('Com base na leitura'));
    assert.equal(result.multiple, true);
    assert.deepEqual(result.options, options);
    assert.deepEqual(result.selected, ['0', '2']);
    assert.equal(result.marked, true);
    assert.equal(result.restored, true);
    assert.equal(result.remaining, 0);
  } finally { await page.close(); }
});

test('one reference serves later questions without copying preceding answers or private page content', async () => {
  const outside = `<aside>${info('PRIVATE_ACCOUNT_CONTEXT_NOT_FOR_MODEL')}</aside>`;
  const page = await pageWith(info(poem) + multi('previous', { number: 1, total: 2, prompt: 'UNRELATED_PREVIOUS_QUESTION_PROMPT' })
    + multi('current', { number: 2, total: 2 }), outside);
  try {
    const result = await page.evaluate(() => {
      const adapter = createPageAdapter();
      const questions = adapter.scan().questions;
      return { count: questions.length, prompt: questions.find(question => question.element.id === 'current').prompt };
    });
    assert.equal(result.count, 2);
    assert.ok(result.prompt.includes(poem));
    assert.ok(!result.prompt.includes('UNRELATED_PREVIOUS_QUESTION_PROMPT'));
    assert.ok(!result.prompt.includes('PRIVATE_ACCOUNT_CONTEXT_NOT_FOR_MODEL'));
    for (const text of options) assert.ok(!result.prompt.includes(text), 'Other question answers must not become reference text');
  } finally { await page.close(); }
  const isolated = await pageWith(multi('current'), outside);
  try {
    const prompt = await isolated.evaluate(() => createPageAdapter().scan().questions[0].prompt);
    assert.ok(!prompt.includes('PRIVATE_ACCOUNT_CONTEXT_NOT_FOR_MODEL'), 'Looking for support must stop at the activity main boundary');
  } finally { await isolated.close(); }
});

test('a nearer INFO replaces the older text and a SECTION boundary never borrows an earlier poem', async () => {
  const page = await pageWith(section('01', 'OLD_SECTION_CONTEXT') + info('OLD_POEM_CONTEXT') + multi('first', { number: 1, total: 3 })
    + info('NEW_POEM_CONTEXT', { id: 'new-info' }) + multi('second', { number: 2, total: 3 })
    + section('02', 'NEW_SECTION_CONTEXT') + multi('third', { number: 3, total: 3 }));
  try {
    const prompts = await page.evaluate(() => createPageAdapter().scan().questions.map(question => ({ id: question.element.id, prompt: question.prompt })));
    const second = prompts.find(question => question.id === 'second').prompt;
    const third = prompts.find(question => question.id === 'third').prompt;
    assert.ok(second.includes('NEW_POEM_CONTEXT'));
    assert.ok(!second.includes('OLD_POEM_CONTEXT'));
    assert.ok(third.includes('NEW_SECTION_CONTEXT'));
    assert.ok(!third.includes('OLD_POEM_CONTEXT') && !third.includes('NEW_POEM_CONTEXT'));
    assert.ok(!third.includes('OLD_SECTION_CONTEXT'));
  } finally { await page.close(); }
});

test('changing reference text invalidates pending choice and text answers before any marking', async () => {
  for (const kind of ['choice', 'text']) {
    const answer = kind === 'choice' ? multi('current') : '<div class="MuiPaper-root MuiPaper-elevation3"><p>Com base no poema, explique o fazer poético.</p><textarea placeholder="Responder"></textarea></div>';
    const page = await pageWith(info(poem, { id: 'reference' }) + answer);
    try {
      const result = await page.evaluate(async kind => {
        const adapter = createPageAdapter();
        const question = adapter.scan().questions[0];
        const included = question.prompt.includes('Trabalha, e teima');
        document.querySelector('#reference .ql-editor p').textContent = 'Um texto diferente substituiu o poema.';
        const current = adapter.isCurrent(question);
        const outcome = await adapter.apply(question, kind === 'choice' ? [0, 2] : 'Uma resposta escrita para o poema anterior.');
        return { included, current, marked: outcome.selected, checked: document.querySelectorAll('input:checked').length, text: document.querySelector('textarea')?.value || '' };
      }, kind);
      assert.equal(result.included, true);
      assert.equal(result.current, false);
      assert.equal(result.marked, false);
      assert.equal(result.checked, 0);
      assert.equal(result.text, '');
    } finally { await page.close(); }
  }
});

test('reference images reach preparation and stale or unsupported reference visuals cannot be ignored', async () => {
  const page = await pageWith(info('Observe também o gráfico de apoio.', { id: 'reference', extra: `<img alt="Gráfico do texto-base" src="${png}" width="60" height="40">` }) + multi('current'));
  try {
    await page.locator('#reference img').evaluate(image => image.decode());
    const result = await page.evaluate(async () => {
      const adapter = createPageAdapter();
      const question = adapter.scan().questions[0];
      const prepared = await adapter.prepareQuestion(question);
      document.querySelector('#reference img').alt = 'Um gráfico de apoio diferente';
      return { images: prepared.images.map(image => ({ url: image.url.slice(0, 22), label: image.label })), current: adapter.isCurrent(question), marked: (await adapter.apply(question, [0, 2])).selected };
    });
    assert.equal(result.images.length, 1);
    assert.ok(result.images[0].url.startsWith('data:image/'));
    assert.match(result.images[0].label, /apoio|base/i);
    assert.equal(result.current, false);
    assert.equal(result.marked, false);
  } finally { await page.close(); }
  const unsupported = await pageWith(info('Observe o gráfico de apoio.', { extra: '<canvas width="300" height="160"></canvas>' }) + multi('current'));
  try {
    const result = await unsupported.evaluate(async () => {
      const adapter = createPageAdapter();
      try { await adapter.prepareQuestion(adapter.scan().questions[0]); return { blocked: false }; }
      catch (error) { return { blocked: error.code === 'IMAGE', checked: document.querySelectorAll('input:checked').length }; }
    });
    assert.deepEqual(result, { blocked: true, checked: 0 });
  } finally { await unsupported.close(); }
});

test('MUI menus may hide the app or sibling reading cards without losing their reference during filling and undo', async () => {
  for (const hiding of ['app', 'cards']) {
    const blank = index => `<span style="display:inline-block"><div class="MuiInputBase-root"><div id="${index}-" class="MuiSelect-select" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="reference-menu-${index}" tabindex="0" data-index="${index}">&#8203;</div><input class="MuiSelect-nativeInput" aria-hidden="true" tabindex="-1" value=""></div></span>`;
    const hiddenReference = info('PREEXISTING_HIDDEN_READING_NOT_FOR_MODEL', { id: 'hidden-reading' }).replace('class="MuiPaper-root', 'aria-hidden="true" class="MuiPaper-root');
    const page = await pageWith(`<div id="reference-app">${info(poem, { id: 'reading', extra: `<img alt="Imagem de apoio do poema" src="${png}" width="60" height="40">` })}${hiddenReference}<div id="reference-blanks" class="MuiPaper-root MuiPaper-elevation3"><p>Complete a síntese do texto.</p><div class="MuiPaper-root">A criação exige ${blank(0)} e a arte parece ${blank(1)}.</div></div></div>`);
    try {
      await page.locator('#reading img').evaluate(image => image.decode());
      await page.evaluate(hiding => {
        const controls = [...document.querySelectorAll('[role="combobox"]')];
        const state = window.__referenceFields = { values: ['', ''], opens: 0, commits: 0, clears: 0 };
        const words = ['trabalho', 'natural', 'ruído'];
        let portal, opened, hiddenByMenu = [];
        function close() {
          if (!portal) return;
          const oldPortal = portal;
          const oldHidden = hiddenByMenu;
          opened.setAttribute('aria-expanded', 'false');
          portal = null; opened = null; hiddenByMenu = [];
          setTimeout(() => { oldPortal.remove(); oldHidden.forEach(element => element.removeAttribute('aria-hidden')); }, 60);
        }
        function set(index, value) {
          state.values[index] = value;
          const control = controls[index];
          control.id = `${index}-${value}`;
          control.textContent = value || '\u200b';
          control.nextElementSibling.value = value;
          const wrapper = control.closest('.MuiInputBase-root').parentElement;
          wrapper.querySelector('button')?.remove();
          if (value) {
            const clear = document.createElement('button');
            clear.className = 'MuiIconButton-root';
            clear.innerHTML = '<svg aria-hidden="true"></svg>';
            clear.addEventListener('click', () => { state.clears++; set(index, ''); });
            wrapper.append(clear);
          }
        }
        function open(control) {
          state.opens++;
          opened = control;
          control.setAttribute('aria-expanded', 'true');
          const targets = hiding === 'app' ? [document.querySelector('#reference-app')] : [document.querySelector('#reading'), document.querySelector('#reference-blanks')];
          hiddenByMenu = targets.filter(element => element.getAttribute('aria-hidden') !== 'true');
          targets.forEach(element => element.setAttribute('aria-hidden', 'true'));
          portal = document.createElement('div'); portal.className = 'MuiMenu-root';
          const list = document.createElement('ul'); list.id = control.getAttribute('aria-controls'); list.setAttribute('role', 'listbox');
          const index = Number(control.dataset.index);
          for (const word of words.filter(word => !state.values.some((value, other) => other !== index && value === word))) {
            const option = document.createElement('li'); option.setAttribute('role', 'option'); option.setAttribute('data-value', word); option.textContent = word;
            option.addEventListener('click', () => { state.commits++; set(index, word); close(); });
            list.append(option);
          }
          portal.append(list); document.body.append(portal);
        }
        controls.forEach(control => control.addEventListener('mousedown', event => { if (event.button === 0) open(control); }));
        document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
      }, hiding);
      const result = await page.evaluate(async () => {
        const adapter = createPageAdapter();
        await adapter.prepare();
        const question = adapter.scan().questions.find(question => question.kind === 'blanks');
        const prompt = question.prompt;
        const outcome = await adapter.apply(question, [0, 1]);
        const filled = [...window.__referenceFields.values];
        const current = adapter.isCurrent(question);
        const undo = outcome.undo ? await outcome.undo() : null;
        return { prompt, selected: outcome.selected, message: outcome.message, filled, current, restored: undo?.restored,
          state: window.__referenceFields, privateRemainsHidden: document.querySelector('#hidden-reading').getAttribute('aria-hidden') === 'true', menus: document.querySelectorAll('[role="listbox"]').length };
      });
      assert.ok(result.prompt.includes(poem));
      assert.ok(!result.prompt.includes('PREEXISTING_HIDDEN_READING_NOT_FOR_MODEL'));
      assert.equal(result.selected, true, `${hiding}: ${result.message}`);
      assert.deepEqual(result.filled, ['trabalho', 'natural']);
      assert.equal(result.current, true);
      assert.equal(result.restored, true);
      assert.deepEqual(result.state.values, ['', '']);
      assert.equal(result.state.commits, 2);
      assert.equal(result.state.clears, 2);
      assert.equal(result.privateRemainsHidden, true);
      assert.equal(result.menus, 0);
    } finally { await page.close(); }
  }
});

test('the complete hub sends the reference before solving and counts a multi-selection once', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.setDefaultTimeout(7000);
  try {
    await page.setContent(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><h2>Tarefa 1: Leitura do poema</h2><main>${info(poem)}${multi('current')}</main></body></html>`);
    await page.evaluate(() => {
      window.__referenceRequests = [];
      window.__referenceHistory = [];
      window.__referenceSubmitCount = 0;
      document.addEventListener('submit', event => { window.__referenceSubmitCount++; event.preventDefault(); });
      window.fetch = async (_, init) => {
        const payload = JSON.parse(init.body);
        window.__referenceRequests.push(payload);
        const hasPoem = payload.question.prompt.includes('Trabalha, e teima, e lima');
        return new Response(JSON.stringify({ indices: hasPoem ? [0, 2] : [], confidence: hasPoem ? 'high' : 'low', explanation: hasPoem ? 'O texto relaciona o trabalho à aparência natural da arte.' : 'O texto-base não foi fornecido.' }), { headers: { 'Content-Type': 'application/json' } });
      };
      window.__LUME_HOSTED_CONFIG__ = { endpoint: 'https://reference.example.com/api/lume/solve', public: true };
    });
    await page.addScriptTag({ content: readFileSync(path.join(project, 'dist/hub.js'), 'utf8') });
    await page.locator('#lume-groq-hub').evaluate(host => {
      new MutationObserver(() => window.__referenceHistory.push(host.shadowRoot.querySelector('.toasts').textContent)).observe(host.shadowRoot, { childList: true, subtree: true, characterData: true });
    });
    assert.equal(await page.evaluate(() => window.__referenceRequests.length), 0);
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#current input:checked').length === 2);
    const complete = page.getByRole('button', { name: 'Tarefa concluída', exact: true });
    await complete.waitFor();
    assert.equal(await complete.isDisabled(), true);
    const result = await page.evaluate(() => ({ requests: window.__referenceRequests, selected: [...document.querySelectorAll('#current input:checked')].map(input => input.value), counted: window.__referenceHistory.some(text => text.includes('Respostas: 1')), submits: window.__referenceSubmitCount }));
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].question.multiple, true);
    assert.ok(result.requests[0].question.prompt.includes(poem));
    assert.deepEqual(result.requests[0].question.options.map(option => option.text), options);
    assert.deepEqual(result.selected, ['0', '2']);
    assert.equal(result.counted, true);
    assert.equal(result.submits, 0);
  } finally { await page.close(); }
});
