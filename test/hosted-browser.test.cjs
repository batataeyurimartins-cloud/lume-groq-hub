const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const endpoint='https://lume-host.local/api/solve';
const token='fake_hosted_access_token_for_tests_only';
let browser;
before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();});

async function setup({answerFor}={}) {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const requests=[];
  let directGroqCalls=0;
  await page.addInitScript(({endpoint,token})=>{window.__LUME_HOSTED_CONFIG__={endpoint,token};},{endpoint,token});
  await page.route('http://lume-test.local/**',route=>{
    const script=route.request().url().endsWith('hub-groq.js');
    return route.fulfill({contentType:script?'application/javascript':'text/html',body:readFileSync(path.join(root,'dist',script?'hub-groq.js':'demo.html'),'utf8')});
  });
  await page.route('https://api.groq.com/**',route=>{directGroqCalls++;return route.abort('blockedbyclient');});
  await page.route(endpoint,async route=>{
    if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'http://lume-test.local','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization,content-type'}});
    const payload=route.request().postDataJSON();
    requests.push({payload,authorization:route.request().headers().authorization});
    const fallback={indices:payload.question.multiple?[0,2]:[1],explanation:'Resposta de teste validada.',confidence:'high'};
    const answer=answerFor?await answerFor(payload.question,requests.length,fallback):fallback;
    try {await route.fulfill({headers:{'Access-Control-Allow-Origin':'http://lume-test.local'},json:answer});}
    catch { /* A canceled request may no longer accept a response. */ }
  });
  await page.goto('http://lume-test.local/demo.html');
  await page.getByRole('button',{name:'Responder tarefa',exact:true}).click();
  return {page,requests,directCalls:()=>directGroqCalls};
}

test('hosted task button uses server bearer transport, marks both question types, and consumes config',async()=>{
  const {page,requests,directCalls}=await setup();
  try {
    await page.waitForFunction(()=>document.querySelector('input[name="q1"][value="56"]').checked&&document.querySelector('input[name="q2"][value="7"]').checked);
    await page.waitForFunction(()=>document.querySelector('#lume-groq-hub').shadowRoot.querySelector('.toasts').textContent.includes('Respostas: 2'));
    assert.equal(requests.length,2);
    assert.equal(directCalls(),0,'The hosted hub must never call Groq from the page');
    for(const {payload,authorization} of requests) {
      assert.equal(authorization,`Bearer ${token}`);
      assert.deepEqual(Object.keys(payload).sort(),['model','question']);
      assert.deepEqual(Object.keys(payload.question).sort(),['multiple','options','prompt']);
      assert.ok(payload.question.options.every(option=>Object.keys(option).length===1&&typeof option.text==='string'));
      assert.ok(Buffer.byteLength(JSON.stringify(payload))<48*1024);
    }
    assert.match(requests[0].payload.question.prompt,/7 pacotes/);
    assert.equal(requests[1].payload.question.multiple,true);
    assert.deepEqual(await page.locator('input[name="q2"]:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['2','7']);
    assert.equal(await page.evaluate(()=>Object.hasOwn(window,'__LUME_HOSTED_CONFIG__')),false);
    assert.equal(await page.locator('#lume-api-key').inputValue(),'');
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    await page.getByRole('button',{name:'Tarefa concluída',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Tarefa concluída',exact:true}).isDisabled(),true);
  } finally {await page.close();}
});

test('hosted bundle rejects invalid answer indices and cancellation prevents late selections',async()=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const {page,requests,directCalls}=await setup({answerFor:async(question,attempt,fallback)=>{
    if(attempt===1)return{...fallback,indices:[999]};
    await pending;
    return fallback;
  }});
  try {
    await page.waitForFunction(()=>document.querySelector('#lume-groq-hub').shadowRoot.querySelector('.toasts').textContent.includes('resposta válida'));
    assert.equal(await page.locator('input[name="q1"]:checked').count(),0);
    // Invalid provider data pauses the hub. Explicitly restart the failed
    // question, then hold that response so pause can reject its late result.
    await page.getByRole('button',{name:'Responder tarefa',exact:true}).click();
    const end=Date.now()+5000;
    while(requests.length<2) {
      if(Date.now()>end)throw new Error('The second hosted request did not start');
      await page.waitForTimeout(10);
    }
    await page.getByRole('button',{name:'Pausar tarefa',exact:true}).click();
    release();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('fieldset input:checked').count(),0);
    assert.equal(directCalls(),0);
    assert.equal(requests.length,2);
  } finally {release();await page.close();}
});
