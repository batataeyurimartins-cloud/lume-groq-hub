const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = readFileSync(path.join(__dirname, '../src/page-adapter.js'), 'utf8')
  .replace('export function createPageAdapter', 'window.createPageAdapter = function createPageAdapter');
let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

const options = [
  'A) O poema defende trabalho, dedicação e aperfeiçoamento da obra.',
  'B) O poeta deve buscar inspiração no barulho das ruas.',
  'C) A beleza artística parece natural e oculta o esforço da criação.',
  'D) O valor da poesia está somente na improvisação.',
];
function muiQuestion({ id, names, prompt = 'Com base na leitura, assinale as alternativas corretas sobre o poema.', checked = [] }) {
  return `<div id="${id}" class="MuiPaper-root MuiPaper-elevation3">
    <h6 class="MuiTypography-root">Questão ${id === 'first' ? '01' : '02'} de 02</h6>
    <div class="main"><p>${prompt}</p></div>
    <div class="MuiBox-root"><div class="MuiBox-root checkbox-list">${options.map((text, index) => `
      <div class="MuiBox-root option-card"><div class="MuiBox-root option-row">
        <span class="MuiButtonBase-root MuiCheckbox-root"><input type="checkbox" name="${names[index]}" value="${index}" ${checked.includes(index) ? 'checked' : ''}><svg class="MuiSvgIcon-root" aria-hidden="true" width="20" height="20"><path d="M3 3h14v14H3Z"></path></svg></span>
        <div class="MuiBox-root"><div class="ql-editor"><p>${text}</p></div></div>
      </div></div>`).join('')}</div></div>
  </div>`;
}
async function pageWith(html) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><main>${html}</main></body></html>`);
  await page.addScriptTag({ content: source });
  return page;
}

test('MUI multiple-choice options with distinct names form one question and mark all requested alternatives', async () => {
  const page = await pageWith(muiQuestion({ id: 'first', names: ['answer-a', 'answer-b', 'answer-c', 'answer-d'] }));
  try {
    const result = await page.evaluate(async () => {
      const adapter = createPageAdapter();
      const scan = adapter.scan();
      const question = scan.questions[0];
      if (!question) return { count: scan.questions.length, warnings: scan.warnings };
      let changes = 0;
      document.querySelector('#first').addEventListener('change', () => changes++);
      const marked = await adapter.apply(question, [0, 2]);
      const selected = Array.from(document.querySelectorAll('input:checked'), input => input.value);
      const restored = marked.undo ? await marked.undo() : null;
      return {
        count: scan.questions.length, warnings: scan.warnings, multiple: question.multiple,
        options: question.options.map(option => option.text), marked: marked.selected, selected,
        restored: restored?.restored, remaining: document.querySelectorAll('input:checked').length, changes,
      };
    });
    assert.equal(result.count, 1);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.multiple, true);
    assert.deepEqual(result.options, options);
    assert.equal(result.marked, true);
    assert.deepEqual(result.selected, ['0', '2']);
    assert.equal(result.restored, true);
    assert.equal(result.remaining, 0);
    assert.equal(result.changes, 4);
  } finally { await page.close(); }
});

test('reused checkbox names do not merge adjacent MUI question cards or change another answer', async () => {
  const names = ['answer', 'answer', 'answer', 'answer'];
  const page = await pageWith(muiQuestion({ id: 'first', names, prompt: 'Escolha as ideias do primeiro poema.' })
    + muiQuestion({ id: 'second', names, prompt: 'Escolha as ideias do segundo poema.', checked: [1] }));
  try {
    const result = await page.evaluate(async () => {
      const adapter = createPageAdapter();
      const scan = adapter.scan();
      if (scan.questions.length !== 2) return { count: scan.questions.length, optionCounts: scan.questions.map(question => question.options.length) };
      const marked = await adapter.apply(scan.questions[0], [0, 2]);
      return { count: scan.questions.length, optionCounts: scan.questions.map(question => question.options.length),
        prompts: scan.questions.map(question => question.prompt), marked: marked.selected,
        first: Array.from(document.querySelectorAll('#first input:checked'), input => input.value),
        second: Array.from(document.querySelectorAll('#second input:checked'), input => input.value),
      };
    });
    assert.equal(result.count, 2);
    assert.deepEqual(result.optionCounts, [4, 4]);
    assert.ok(result.prompts[0].includes('primeiro poema') && !result.prompts[0].includes('segundo poema'));
    assert.ok(result.prompts[1].includes('segundo poema') && !result.prompts[1].includes('primeiro poema'));
    assert.equal(result.marked, true);
    assert.deepEqual(result.first, ['0', '2']);
    assert.deepEqual(result.second, ['1']);
  } finally { await page.close(); }
});

test('native checkbox names remain isolated by form and disabled required choices cause no partial marking', async () => {
  const nativeForm = id => `<form id="${id}"><p>${id === 'first' ? 'Primeira' : 'Segunda'} seleção.</p>${['2', '4', '7'].map(value => `<label><input type="checkbox" name="numbers" value="${value}">${value}</label>`).join('')}</form>`;
  const page = await pageWith(nativeForm('first') + nativeForm('second'));
  try {
    const result = await page.evaluate(async () => {
      const adapter = createPageAdapter();
      const scan = adapter.scan();
      document.querySelector('#first input[value="7"]').disabled = true;
      const outcome = await adapter.apply(scan.questions[0], [0, 2]);
      return { count: scan.questions.length, marked: outcome.selected, checked: document.querySelectorAll('input:checked').length };
    });
    assert.deepEqual(result, { count: 2, marked: false, checked: 0 });
  } finally { await page.close(); }
});
