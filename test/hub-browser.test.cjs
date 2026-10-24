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
    contentType: 'text/html; charset=utf-8',
    body: '<main><fieldset data-id="q1"><legend>Quanto é 2 + 2?</legend><label><input type="radio" name="q1" value="3">3</label><label><input type="radio" name="q1" value="4">4</label></fieldset></main>',
  }));
  await page.goto('http://hub-test.local' + (options.urlPath || '/'));
  await page.evaluate(options => {
    window.uiTest = {
      confidence: 'high', indices: [1], delay: 60, current: true,
      applySelected: true, applyDelay: 20, solveFailures: 0,
      applies: 0, solves: 0, completed: 0, aborted: 0,
      questionKind: '', response: null, prepareDelay: 0, prepares: 0, prepareAborted: 0, appliedPayloads: [], invalidateOnce: false,
      storageWrites: 0, sharedFingerprint: false, toastEvents: [], confirmedIds: [], scanWarnings: [], taskTotal: 0, taskTitle: '', intervalIds: [], ...options,
    };
    const nativeSetInterval=window.setInterval.bind(window);
    const nativeClearInterval=window.clearInterval.bind(window);
    window.setInterval=(...args)=>{const id=nativeSetInterval(...args);window.uiTest.intervalIds.push(id);return id;};
    window.clearInterval=id=>{window.uiTest.intervalIds=window.uiTest.intervalIds.filter(item=>item!==id);return nativeClearInterval(id);};
    if (window.uiTest.taskTitle) {
      const title = document.createElement('h2');
      title.textContent = window.uiTest.taskTitle;
      document.querySelector('main').prepend(title);
    }
    const addQuestionHeader = (fieldset, number) => {
      if (!window.uiTest.taskTotal) return;
      const heading = document.createElement('h6');
      heading.className = 'MuiTypography-root';
      heading.textContent = `Questão ${String(number).padStart(2,'0')} de ${String(window.uiTest.taskTotal).padStart(2,'0')}`;
      fieldset.prepend(heading);
    };
    addQuestionHeader(document.querySelector('fieldset'), 1);
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) {
      window.uiTest.storageWrites++;
      return originalSetItem.apply(this, args);
    };
    window.createPageAdapter = () => ({
      prepare: async (_, {signal}) => {
        window.uiTest.prepares++;
        await new Promise((resolve,reject) => {
          const abort = () => {
            clearTimeout(timer);
            window.uiTest.prepareAborted++;
            reject(Object.assign(new Error('Leitura cancelada'), {code:'ABORTED'}));
          };
          const timer = setTimeout(() => { signal.removeEventListener('abort',abort); resolve(); }, window.uiTest.prepareDelay);
          signal.addEventListener('abort',abort,{once:true});
          if(signal.aborted)abort();
        });
      },
      scan: () => ({
        questions: window.uiTest.current ? [...document.querySelectorAll('fieldset[data-id]')].map(element => ({
          id: element.dataset.id,
          fingerprint: window.uiTest.sharedFingerprint ? 'same-question-content' : `${element.dataset.id}-v1`,
          prompt: element.querySelector('legend').textContent,
          multiple: false,
          ...(window.uiTest.questionKind ? {kind:window.uiTest.questionKind} : {}),
          element,
          options: [...element.querySelectorAll('input')].map((option, index) => ({ index, text: option.value, element: option, type: 'radio' })),
        })) : [],
        warnings: window.uiTest.scanWarnings,
      }),
      isCurrent: question => {
        if(window.uiTest.invalidateOnce) {window.uiTest.invalidateOnce=false;return false;}
        return window.uiTest.current && question.element.isConnected;
      },
      apply: async (question, indices) => {
        window.uiTest.applies++;
        window.uiTest.appliedPayloads.push(indices);
        if (!window.uiTest.applySelected) return { selected: false, message: 'O site não confirmou a marcação.' };
        const previous = question.options.map(option => option.element.checked);
        if(!question.kind)question.options[indices[0]].element.click();
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
            } else resolve(window.uiTest.response || { indices: window.uiTest.indices, explanation: '2 + 2 = 4.', confidence: window.uiTest.confidence });
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
      addQuestionHeader(fieldset, Number(id.replace(/\D/g,'')) || 1);
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

test('task watcher marks new questions once and pause/resume retains task progress', async () => {
  const page = await setup({ sharedFingerprint: true, taskTotal: 3 });
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
    await page.getByRole('button', { name: 'Pausar tarefa', exact: true }).click();
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await page.waitForTimeout(350);
    assert.equal(await metric(page, 'solves'), 2, 'Explicit restart must still skip completed questions');
  } finally { await page.close(); }
});

test('task run marks low-confidence answers without an extra manual action', async () => {
  const page = await setup({ confidence: 'low' });
  try {
    await start(page);
    await waitForAnswer(page);
    await page.getByText('Respostas: 1', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Marcar sugestão', exact: true }).count(), 0);
    assert.equal(await metric(page, 'applies'), 1);
  } finally { await page.close(); }
});

test('text, blanks and word ordering route their response payload, count once, and retain undo', async () => {
  for(const [kind,response,payload] of [
    ['text',{text:'A distância mede todo o caminho; o deslocamento liga as posições inicial e final.',confidence:'high'},'A distância mede todo o caminho; o deslocamento liga as posições inicial e final.'],
    ['blanks',{selections:[2,0,1],confidence:'high'},[2,0,1]],
    ['order',{order:[2,0,1],confidence:'high'},[2,0,1]],
  ]) {
    const page=await setup({questionKind:kind,response});
    try {
      await start(page);
      await page.waitForFunction(()=>window.uiTest.confirmedIds.length===1);
      await page.getByText('Respostas: 1',{exact:true}).first().waitFor();
      assert.deepEqual(await metric(page,'appliedPayloads'),[payload]);
      assert.ok((await metric(page,'toastEvents')).some(text=>text.includes(kind==='order'?'Ordenando palavras':'Preenchendo respostas')));
      await page.evaluate(()=>document.querySelector('main').append(document.createElement('p')));
      await page.waitForTimeout(400);
      assert.equal(await metric(page,'solves'),1);
      await page.getByRole('button',{name:'Desfazer',exact:true}).click();
      await page.getByText('Respostas: 0',{exact:true}).first().waitFor();
    } finally {await page.close();}
  }
});

test('pausing during lazy-menu preparation cancels reading before any AI query or marking', async () => {
  const page=await setup({prepareDelay:1000});
  try {
    await start(page);
    await page.waitForFunction(()=>window.uiTest.prepares===1);
    await page.getByRole('button',{name:'Pausar tarefa',exact:true}).click();
    await page.waitForFunction(()=>window.uiTest.prepareAborted===1);
    assert.equal(await metric(page,'solves'),0);
    assert.equal(await metric(page,'applies'),0);
    assert.equal((await metric(page,'toastEvents')).some(text=>text.includes('Leitura cancelada')),false);
    await page.evaluate(()=>{window.uiTest.prepareDelay=0;});
    await page.getByRole('button',{name:'Responder tarefa',exact:true}).click();
    await waitForAnswer(page);
    assert.equal(await metric(page,'solves'),1);
  } finally {await page.close();}
});

test('empty text, blank and ordering responses abstain without incrementing the counter, with a text explanation',async()=>{
  for(const [kind,response] of [['text',{text:'',confidence:'low',explanation:'Faltam informações no enunciado para escrever esta resposta.'}],['blanks',{selections:[],confidence:'low'}],['order',{order:[],confidence:'low'}]]) {
    const page=await setup({questionKind:kind,response});
    try {
      await start(page);
      await page.getByText('Sem resposta suficiente. Questão ignorada.',{exact:true}).waitFor();
      if(kind==='text') await page.getByText(response.explanation,{exact:true}).waitFor();
      assert.equal(await metric(page,'applies'),0);
      assert.equal(await metric(page,'solves'),1);
      await page.waitForTimeout(750);
      assert.equal(await page.getByRole('button',{name:'Tarefa concluída',exact:true}).count(),0,'Abstention must leave the task incomplete');
    } finally {await page.close();}
  }
});

test('a pending answer invalidated by a manual field edit is not immediately queried again',async()=>{
  const page=await setup({questionKind:'text',response:{text:'Resposta gerada.',confidence:'high'},delay:500});
  try {
    await start(page);
    await page.waitForFunction(()=>window.uiTest.solves===1);
    await page.evaluate(()=>{window.uiTest.invalidateOnce=true;});
    await page.getByText('A questão mudou. Lendo a página novamente…',{exact:true}).waitFor();
    await page.waitForTimeout(750);
    assert.equal(await page.getByRole('button',{name:'Tarefa concluída',exact:true}).count(),0,'Skipped manual edits must not claim full completion');
    assert.equal(await metric(page,'solves'),1);
    assert.equal(await metric(page,'applies'),0);
  } finally {await page.close();}
});

test('empty scans explain unreadable alternatives once, then distinguish completed questions and scan warnings', async () => {
  const page = await setup({ current: false });
  try {
    await start(page);
    await page.getByText('Nenhuma questão reconhecida', { exact: true }).waitFor();
    assert.equal(await metric(page, 'solves'), 0);
    const warning = 'Não consegui reconhecer os campos de resposta desta página.';
    assert.equal((await metric(page, 'toastEvents')).filter(message => message.includes(warning)).length, 1);
    await page.evaluate(() => document.querySelector('main').append(document.createElement('p')));
    await page.waitForTimeout(350);
    assert.equal((await metric(page, 'toastEvents')).filter(message => message.includes(warning)).length, 1);
    await page.evaluate(() => {
      window.uiTest.current = true;
      document.querySelector('main').append(document.createElement('p'));
    });
    await waitForAnswer(page);
    await page.getByRole('button', { name: 'Tarefa concluída', exact: true }).waitFor();
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
    await page.getByRole('button', { name: 'Pausar tarefa', exact: true }).click();
    await page.waitForFunction(() => window.uiTest.aborted === 1);
    assert.equal(await metric(page, 'applies'), 0);
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await page.waitForFunction(() => window.uiTest.solves === 2);
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    assert.equal(await metric(page, 'aborted'), 2);
    assert.equal(await metric(page, 'applies'), 0);
    assert.equal(await page.locator('#lume-groq-hub').count(), 0);
    assert.equal(await page.evaluate(() => window.__LUME_GROQ_HUB__), undefined);
    assert.deepEqual(await metric(page,'intervalIds'),[],'Close must clear task-route polling');
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
    const stop = page.getByRole('button', { name: 'Pausar tarefa', exact: true });
    if (await stop.isVisible()) await stop.click();
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
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

test('task name appears at the top center and a declared total stops the button only after every question', async () => {
  const title='Tarefa 5: Fontes de energia, transição energética e desenvolvimento sustentável';
  const page=await setup({taskTotal:2,taskTitle:title,urlPath:'/atividade/101'});
  try {
    await start(page);
    await page.locator('#lume-groq-hub .task-name').filter({hasText:title}).waitFor();
    assert.equal(await page.locator('#lume-groq-hub .task-name').textContent(),title);
    const banner=page.locator('#lume-groq-hub .task-banner');
    const bounds=await banner.boundingBox();
    assert.ok(bounds&&Math.abs(bounds.x+bounds.width/2-550)<=2,'The task notification must be centered in the viewport');
    assert.ok(bounds.y>=0&&bounds.y<50,'The task notification must be near the top');
    await waitForAnswer(page);
    await page.waitForTimeout(950);
    assert.equal(await page.getByRole('button',{name:'Pausar tarefa',exact:true}).isEnabled(),true,'One answer out of a declared two cannot complete the task');
    assert.equal(await metric(page,'solves'),1);
    await page.evaluate(()=>window.uiTest.addQuestion('q2'));
    await waitForAnswer(page,'q2');
    const done=page.getByRole('button',{name:'Tarefa concluída',exact:true});
    await done.waitFor();
    assert.equal(await done.isDisabled(),true);
    assert.equal(await page.locator('#lume-groq-hub .status').getAttribute('data-active'),'false');
    assert.ok((await metric(page,'toastEvents')).some(message=>message.includes('Respostas: 2')));
    await page.evaluate(()=>window.uiTest.addQuestion('q3'));
    await page.waitForTimeout(450);
    assert.equal(await metric(page,'solves'),2,'A finished task cannot continue to a later injected question');
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Responder tarefa',exact:true}).isEnabled(),true,'Undo must re-enable the task button');
  } finally {await page.close();}
});

test('a new activity resets the counter and undo, stays idle, then starts at response one', async () => {
  const page=await setup({taskTotal:1,taskTitle:'Tarefa 1: Movimento',urlPath:'/atividade/101?enable_captcha=true'});
  try {
    await start(page);
    await waitForAnswer(page);
    await page.getByRole('button',{name:'Tarefa concluída',exact:true}).waitFor();
    await page.evaluate(()=>{
      history.pushState({},'', '/atividade/202?enable_captcha=true');
      const main=document.querySelector('main');
      main.querySelector('h2').textContent='Tarefa 2: Energia';
      main.querySelector('fieldset').remove();
      window.uiTest.addQuestion('q1');
      window.uiTest.confirmedIds=[];
    });
    const button=page.getByRole('button',{name:'Responder tarefa',exact:true});
    await button.waitFor();
    await page.waitForTimeout(450);
    assert.equal(await metric(page,'solves'),1,'Navigation must not automatically start another task');
    assert.equal(await page.getByRole('button',{name:'Desfazer',exact:true}).isDisabled(),true);
    assert.equal(await page.getByText('Respostas: 1',{exact:true}).count(),0,'Old task response toasts must be cleared');
    assert.equal(await page.getByText('Respostas: 2',{exact:true}).count(),0);
    await button.click();
    await waitForAnswer(page,'q1');
    await page.getByText('Respostas: 1',{exact:true}).first().waitFor();
    await page.getByRole('button',{name:'Tarefa concluída',exact:true}).waitFor();
    assert.equal(await page.locator('#lume-groq-hub .task-name').textContent(),'Tarefa 2: Energia');
    assert.equal(await page.getByText('Respostas: 2',{exact:true}).count(),0,'The next task starts from zero, not the previous count');
    assert.equal(await metric(page,'solves'),2);
  } finally {await page.close();}
});

test('query and hash changes preserve progress within the same activity',async()=>{
  const page=await setup({taskTotal:2,urlPath:'/atividade/303?enable_captcha=true'});
  try {
    await start(page);
    await waitForAnswer(page);
    await page.evaluate(()=>history.pushState({},'', '/atividade/303?enable_captcha=false#questao-2'));
    await page.waitForTimeout(400);
    assert.equal(await page.getByRole('button',{name:'Pausar tarefa',exact:true}).isEnabled(),true);
    await page.evaluate(()=>window.uiTest.addQuestion('q2'));
    await waitForAnswer(page,'q2');
    await page.getByText('Respostas: 2',{exact:true}).first().waitFor();
    assert.equal(await metric(page,'solves'),2);
  } finally {await page.close();}
});

test('a route change without DOM mutations aborts a pending solve and requires a new task click',async()=>{
  const page=await setup({delay:5000,taskTotal:2,urlPath:'/atividade/404'});
  try {
    await start(page);
    await page.waitForFunction(()=>window.uiTest.solves===1);
    await page.evaluate(()=>history.pushState({},'', '/atividade/405'));
    await page.waitForFunction(()=>window.uiTest.aborted===1);
    await page.getByRole('button',{name:'Responder tarefa',exact:true}).waitFor();
    assert.equal(await metric(page,'applies'),0);
    assert.equal(await page.getByText('Respostas: 1',{exact:true}).count(),0);
    await page.waitForTimeout(450);
    assert.equal(await metric(page,'solves'),1);
  } finally {await page.close();}
});

test('a late apply resolution from the previous activity never updates the next task counter or undo',async()=>{
  const page=await setup({applyDelay:900,taskTotal:2,urlPath:'/atividade/501'});
  try {
    await start(page);
    await page.waitForFunction(()=>window.uiTest.applies===1);
    await page.evaluate(()=>history.pushState({},'', '/atividade/502'));
    await page.getByRole('button',{name:'Responder tarefa',exact:true}).waitFor();
    await page.waitForFunction(()=>window.uiTest.confirmedIds.length===1);
    await page.waitForTimeout(200);
    assert.equal(await page.getByText('Respostas: 1',{exact:true}).count(),0,'An old async confirmation cannot count on the next task');
    assert.equal(await page.getByRole('button',{name:'Desfazer',exact:true}).isDisabled(),true);
    assert.equal(await metric(page,'solves'),1);
  } finally {await page.close();}
});

test('a delayed task heading with nested text updates the task banner safely',async()=>{
  const page=await setup({delay:1000,taskTotal:2,urlPath:'/atividade/601'});
  try {
    await start(page);
    await page.waitForFunction(()=>window.uiTest.solves===1);
    await page.evaluate(()=>{
      const heading=document.createElement('h2');
      heading.append('Tarefa ');
      const number=document.createElement('strong');number.textContent='5:';
      heading.append(number,' Fontes de energia, transição energética e desenvolvimento sustentável');
      document.querySelector('main').prepend(heading);
    });
    await page.waitForFunction(()=>document.querySelector('#lume-groq-hub').shadowRoot.querySelector('.task-name').textContent==='Tarefa 5: Fontes de energia, transição energética e desenvolvimento sustentável');
    assert.equal(await metric(page,'solves'),1,'Updating a task title cannot duplicate a pending solve');
  } finally {await page.close();}
});

test('remounting the same numbered question in one activity does not count it twice',async()=>{
  const page=await setup({sharedFingerprint:true,taskTotal:2,urlPath:'/atividade/701'});
  try {
    await start(page);
    await waitForAnswer(page);
    await page.evaluate(()=>{
      document.querySelector('fieldset').remove();
      window.uiTest.addQuestion('remounted1');
    });
    await page.waitForTimeout(450);
    assert.equal(await metric(page,'solves'),1,'DOM identity changes must not duplicate a completed question number');
    assert.equal(await metric(page,'applies'),1);
    await page.evaluate(()=>window.uiTest.addQuestion('q2'));
    await waitForAnswer(page,'q2');
    await page.getByText('Respostas: 2',{exact:true}).first().waitFor();
    await page.getByRole('button',{name:'Tarefa concluída',exact:true}).waitFor();
    assert.equal(await metric(page,'solves'),2);
  } finally {await page.close();}
});

test('starting during SPA navigation waits until the previous task content has been replaced',async()=>{
  const page=await setup({taskTotal:2,taskTitle:'Tarefa 1: Movimento',urlPath:'/atividade/801'});
  try {
    await start(page);
    await waitForAnswer(page);
    await page.evaluate(()=>history.pushState({},'', '/atividade/802'));
    const button=page.getByRole('button',{name:'Responder tarefa',exact:true});
    await button.waitFor();
    await button.click();
    await page.waitForTimeout(550);
    assert.equal(await metric(page,'solves'),1,'The old task DOM cannot be queried under a new activity URL');
    assert.equal(await page.getByText('Respostas: 1',{exact:true}).count(),0);
    await page.evaluate(()=>{
      document.querySelector('main h2').textContent='Tarefa 2: Energia';
      document.querySelector('fieldset').remove();
      window.uiTest.taskTotal=1;
      window.uiTest.addQuestion('q1');
      window.uiTest.confirmedIds=[];
    });
    await waitForAnswer(page);
    await page.getByText('Respostas: 1',{exact:true}).first().waitFor();
    await page.getByRole('button',{name:'Tarefa concluída',exact:true}).waitFor();
    assert.equal(await metric(page,'solves'),2);
  } finally {await page.close();}
});

test('a long centered task notification fits mobile and leaves stage toasts below it',async()=>{
  const title='Tarefa 5: Fontes de energia, transição energética e desenvolvimento sustentável';
  const page=await setup({taskTitle:title,taskTotal:2,delay:1500,urlPath:'/atividade/901'});
  try {
    await page.setViewportSize({width:360,height:700});
    await start(page);
    await page.waitForFunction(()=>window.uiTest.solves===1);
    const banner=await page.locator('#lume-groq-hub .task-banner').boundingBox();
    const toasts=await page.locator('#lume-groq-hub .toasts').boundingBox();
    assert.ok(banner&&banner.x>=0&&banner.x+banner.width<=360,'The full task name must fit the mobile viewport');
    assert.ok(Math.abs(banner.x+banner.width/2-180)<=2,'The task notification remains centered on mobile');
    assert.ok(toasts&&toasts.y>=banner.y+banner.height+7,'Stage notifications must appear below the centered task name');
  } finally {await page.close();}
});
