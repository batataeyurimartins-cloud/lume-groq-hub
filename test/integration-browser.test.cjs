const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
let browser;
before(async () => { browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']}); });
after(async () => { await browser?.close(); });

async function waitUntil(predicate, message, timeout=6000) {
  const end = Date.now()+timeout;
  while (!predicate()) {
    if (Date.now()>end) throw new Error(message);
    await new Promise(resolve=>setTimeout(resolve,10));
  }
}

async function setup({answerFor} = {}) {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const requests = [];
  await page.route('http://lume-test.local/**', route => {
    const script = route.request().url().endsWith('hub-groq.js');
    return route.fulfill({contentType:script ? 'application/javascript' : 'text/html',body:readFileSync(path.join(root, 'dist', script ? 'hub-groq.js' : 'demo.html'), 'utf8')});
  });
  await page.route('https://api.groq.com/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type'}});
    const body = route.request().postDataJSON();
    const question = JSON.parse(body.messages[1].content);
    requests.push(question);
    const fallback = {indices:question.multiple ? [0,2] : [1], explanation:question.multiple ? '2 e 7 são primos.' : 'A alternativa corresponde ao enunciado.', confidence:'high'};
    const answer = answerFor ? await answerFor(question,requests.length,fallback) : fallback;
    try { await route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]}}); } catch { /* Requests intentionally canceled by pause or SPA navigation. */ }
  });
  await page.goto('http://lume-test.local/');
  await page.locator('#lume-groq-hub').evaluate(host=>{
    window.__lumeToastHistory=[];
    const record=()=>{
      const text=host.shadowRoot.querySelector('.toasts')?.textContent || '';
      if (text) window.__lumeToastHistory.push(text);
    };
    new MutationObserver(record).observe(host.shadowRoot,{childList:true,subtree:true,characterData:true});
    record();
  });
  await page.getByRole('button',{name:'Ajustes',exact:true}).click();
  await page.locator('#lume-api-key').fill('gsk_test_not_a_real_key');
  await page.getByRole('button',{name:'Salvar e iniciar',exact:true}).click();
  return {page,requests};
}

async function waitForDemoAnswers(page) {
  await page.waitForFunction(()=>document.querySelector('input[name="q1"][value="56"]').checked && document.querySelector('input[name="q2"][value="7"]').checked);
}

test('automatic bundle: page → Groq JSON → both native question types → cumulative toasts and undo',async()=>{
  const {page,requests}=await setup();
  try {
    await waitForDemoAnswers(page);
    assert.equal(requests.length,2);
    assert.match(requests[0].prompt,/7 pacotes/);
    assert.equal(requests[0].options.length,4);
    assert.equal(requests[0].multiple,false);
    assert.equal(requests[1].multiple,true);
    assert.equal(await page.locator('input[name="q1"]:checked').getAttribute('value'),'56');
    assert.deepEqual(await page.locator('input[name="q2"]:checked').evaluateAll(es=>es.map(e=>e.value)),['2','7']);
    await page.waitForFunction(()=>window.__lumeToastHistory.some(text=>/Respostas:\s*2/.test(text)));
    const history=await page.evaluate(()=>window.__lumeToastHistory.join('\n'));
    for (const stage of ['Questão detectada','Buscando resposta','Resposta detectada','Marcando respostas','Respostas:']) assert.ok(history.includes(stage),`Missing stage ${stage}`);
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    await page.screenshot({path:path.join(root,'preview.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    const panelBounds=await page.locator('#lume-groq-hub').boundingBox();
    assert.ok(panelBounds.x>=0 && panelBounds.x+panelBounds.width<=391,'The compact hub must fit the mobile viewport');
    await page.screenshot({path:path.join(root,'preview-mobile.png'),fullPage:true});
    await page.getByRole('button',{name:'Pausar automático',exact:true}).click();
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('input[name="q2"]:checked').length===0);
    assert.equal(await page.locator('input[name="q1"]:checked').getAttribute('value'),'56');
  } finally {await page.close();}
});

test('automatic watcher solves a newly inserted question and avoids reprocessing completed content',async()=>{
  const {page,requests}=await setup();
  try {
    await waitForDemoAnswers(page);
    await page.locator('.quiz').evaluate(section=>{
      const fieldset=document.createElement('fieldset');
      fieldset.className='question';
      fieldset.setAttribute('data-question-id','demo-3');
      fieldset.innerHTML='<legend>QUESTÃO 03</legend><h2 data-question-text>Qual é a capital do Brasil?</h2><label><input type="radio" name="q3" value="rio">Rio de Janeiro</label><label><input type="radio" name="q3" value="brasilia">Brasília</label>';
      section.append(fieldset);
    });
    await page.waitForFunction(()=>document.querySelector('input[name="q3"][value="brasilia"]').checked);
    assert.equal(requests.length,3);
    assert.match(requests[2].prompt,/capital do Brasil/);
    // Unrelated mutations must not create repeated requests for answered questions.
    await page.locator('footer').evaluate(footer=>footer.append(' · teste de atualização'));
    await page.waitForTimeout(700);
    assert.equal(requests.length,3);
    await page.waitForFunction(()=>window.__lumeToastHistory.some(text=>/Respostas:\s*3/.test(text)));
  } finally {await page.close();}
});

test('automatic mode applies low confidence and abstains on empty indices',async()=>{
  const {page,requests}=await setup({answerFor:(question,attempt,fallback)=> question.multiple
    ? {...fallback,indices:[],confidence:'low',explanation:'Não há informação suficiente.'}
    : {...fallback,confidence:'low'}});
  try {
    await waitUntil(()=>requests.length===2,'The second question was never requested');
    await page.waitForFunction(()=>document.querySelector('input[name="q1"][value="56"]').checked);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('input[name="q2"]:checked').count(),0);
    await page.waitForFunction(()=>window.__lumeToastHistory.some(text=>/Respostas:\s*1/.test(text)));
    await page.waitForTimeout(700);
    assert.equal(requests.length,2,'An abstained question must not create an automatic request loop');
  } finally {await page.close();}
});

test('SPA prompt replacement while Groq is pending never applies the old answer',async()=>{
  let releaseOld;
  const oldResponse=new Promise(resolve=>{releaseOld=resolve;});
  let releaseNew;
  const newResponse=new Promise(resolve=>{releaseNew=resolve;});
  const {page,requests}=await setup({answerFor:async(question,attempt,fallback)=>{
    if (attempt===1) await oldResponse;
    else await newResponse;
    return fallback;
  }});
  try {
    await waitUntil(()=>requests.length===1,'Initial Groq request did not start');
    await page.locator('[data-question-text]').first().evaluate(e=>{e.textContent='A atividade mudou: quanto é 9 + 1?';});
    releaseOld();
    // The new question is allowed to start its own request. Hold it pending so
    // any native click observed here could only have come from the stale answer.
    await page.waitForTimeout(650);
    assert.equal(await page.locator('fieldset input:checked').count(),0);
    await page.getByRole('button',{name:'Pausar automático',exact:true}).click();
    releaseNew();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('fieldset input:checked').count(),0);
    assert.equal(requests.filter(q=>q.prompt.includes('7 pacotes')).length,1);
  } finally {releaseOld();releaseNew();await page.close();}
});
