const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const publicOrigin='https://lume-public.test';
const activityUrl='https://saladofuturo.educacao.sp.gov.br/lume-bookmarklet-test';
const simpleActivity='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><h1>Atividade de teste</h1><fieldset><legend>Quanto é dois mais dois?</legend><label><input type="radio" name="q" value="3">Três</label><label><input type="radio" name="q" value="4">Quatro</label></fieldset></body></html>';

function salaActivity() {
  const radioOption=(text,index)=>`<div class="MuiBox-root optionBox"><div class="MuiBox-root row"><label class="MuiFormControlLabel-root"><span class="MuiButtonBase-root MuiRadio-root"><input type="radio" value="${index}" class="MuiSwitchBase-input"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"></circle></svg></span></label><div class="MuiBox-root statement"><div class="ql-editor"><p>${text}</p></div></div></div></div>`;
  const checkboxOption=(text,index)=>`<div class="MuiBox-root optionBox"><div class="MuiBox-root row"><span class="MuiButtonBase-root MuiCheckbox-root"><input type="checkbox" value="${index}" class="MuiSwitchBase-input"><svg aria-hidden="true" width="16" height="16"><rect x="2" y="2" width="12" height="12"></rect></svg></span><div class="MuiBox-root statement"><div class="ql-editor"><p>${text}</p></div></div></div></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><main>
    <section id="sala-single-card" class="MuiPaper-root MuiBox-root"><div class="MuiBox-root"><h2>Questão 01 de 02</h2><div class="ql-editor"><p>Quanto é dois mais dois? Marque uma alternativa.</p></div></div><div class="MuiFormGroup-root" role="radiogroup">${['Dois','Quatro','Seis','Oito'].map(radioOption).join('')}</div></section>
    <section id="sala-multi-card" class="MuiPaper-root MuiBox-root"><div class="MuiBox-root"><h2>Questão 02 de 02</h2><div class="ql-editor"><p>Quais números são primos? Marque todas as alternativas corretas.</p></div></div><div class="MuiBox-root choice-list">${['2','4','7','9'].map(checkboxOption).join('')}</div></section>
  </main></body></html>`;
}
let browser;
before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();});

async function setup({scriptDelay=0,missingScript=false,activityHtml=simpleActivity}={}) {
  const context=await browser.newContext();
  context.setDefaultTimeout(10000);
  const requests=[];
  let bundleRequests=0;
  let directGroqCalls=0;
  await context.route('https://api.groq.com/**',route=>{directGroqCalls++;return route.abort('blockedbyclient');});
  await context.route(`${publicOrigin}/**`,async route=>{
    const resource=new URL(route.request().url()).pathname;
    if(resource==='/api/solve') {
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':new URL(activityUrl).origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'}});
      requests.push({authorization:route.request().headers().authorization,payload:route.request().postDataJSON()});
      const question=requests[requests.length-1].payload.question;
      return route.fulfill({headers:{'Access-Control-Allow-Origin':new URL(activityUrl).origin},json:{indices:question.multiple?[0,2]:[1],explanation:'Resposta simulada para verificar a leitura e a marcação.',confidence:'high'}});
    }
    if(resource==='/bookmarklet.js') {
      bundleRequests++;
      if(scriptDelay)await new Promise(resolve=>setTimeout(resolve,scriptDelay));
      if(missingScript)return route.fulfill({status:404,body:'Not found'});
    }
    const filename=resource==='/'?'index.html':resource.slice(1);
    if(!['index.html','install.js','style.css','hub-groq.js','bookmarklet.js'].includes(filename))return route.fulfill({status:404,body:'Not found'});
    return route.fulfill({contentType:filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html',body:readFileSync(path.join(root,'dist',filename),'utf8')});
  });
  await context.route(activityUrl,route=>route.fulfill({contentType:'text/html; charset=utf-8',headers:{'Content-Security-Policy':"form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors *.educacao.sp.gov.br *.ip.tv; upgrade-insecure-requests"},body:activityHtml}));
  const installer=await context.newPage();
  await installer.goto(publicOrigin);
  const link=installer.locator('#bookmarklet-link');
  await link.waitFor();
  const href=await link.getAttribute('href');
  assert.ok(href?.startsWith('javascript:'),'The install link must be a real bookmarklet');
  assert.ok(href.length<3000,'The bookmarklet should remain a small loader');
  assert.equal(await installer.locator('#access-token').count(),0,'Public installation must not require access codes');
  assert.equal(await link.getAttribute('draggable'),'true');
  const activity=await context.newPage();
  await activity.goto(activityUrl);
  const invoke=()=>activity.evaluate(value=>{location.href=value;},href);
  return {context,installer,activity,href,invoke,requests,bundleCount:()=>bundleRequests,directCount:()=>directGroqCalls};
}

test('public bookmarklet loads the hosted hub, marks an answer, and leaves the activity open',async()=>{
  const fixture=await setup();
  const {activity,requests,invoke}=fixture;
  try {
    await invoke();
    await activity.waitForFunction(()=>document.querySelector('input[value="4"]').checked&&document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.toasts').textContent.includes('Respostas: 1'));
    assert.equal(activity.url(),activityUrl);
    assert.equal(fixture.bundleCount(),1);
    assert.equal(fixture.directCount(),0);
    assert.equal(requests.length,1);
    assert.equal(requests[0].authorization,undefined,'Public transport must send no bearer credential');
    assert.deepEqual(Object.keys(requests[0].payload).sort(),['model','question']);
    assert.ok(!JSON.stringify(requests[0].payload).includes('gsk_'));
    assert.equal(await activity.evaluate(()=>Object.hasOwn(window,'__LUME_HOSTED_CONFIG__')),false);
    await invoke();
    await activity.waitForTimeout(150);
    assert.equal(await activity.locator('#lume-groq-hub').count(),1);
    assert.equal(fixture.bundleCount(),1,'A second bookmark click should focus the existing hub');
    assert.equal(requests.length,1);
  } finally {await fixture.context.close();}
});

test('repeated bookmark clicks while loading share one pending bundle',async()=>{
  const fixture=await setup({scriptDelay:350});
  try {
    await fixture.invoke();
    await fixture.invoke();
    await fixture.activity.waitForFunction(()=>document.querySelector('input[value="4"]').checked);
    assert.equal(fixture.bundleCount(),1);
    assert.equal(fixture.requests.length,1);
    assert.equal(await fixture.activity.locator('#lume-groq-hub').count(),1);
  } finally {await fixture.context.close();}
});

test('a blocked or missing bookmarklet bundle gives an actionable alert and permits retry',async()=>{
  const fixture=await setup({missingScript:true});
  try {
    const dialogPromise=fixture.activity.waitForEvent('dialog');
    await fixture.invoke();
    const dialog=await dialogPromise;
    assert.match(dialog.message(),/Lume|favorit|instalador|bloque|carregar/i);
    await dialog.accept();
    await fixture.activity.waitForFunction(()=>!document.querySelector('#lume-bookmarklet-loader'));
    assert.equal(await fixture.activity.locator('#lume-groq-hub').count(),0);
    assert.equal(fixture.requests.length,0);
    assert.equal(fixture.activity.url(),activityUrl);
  } finally {await fixture.context.close();}
});

test('bookmarklet reads Sala MUI sibling statements and unnamed checkbox groups before selecting both question types',async()=>{
  const fixture=await setup({activityHtml:salaActivity()});
  const {activity,requests}=fixture;
  try {
    await fixture.invoke();
    await activity.waitForFunction(()=>document.querySelector('#sala-single-card input[value="1"]').checked && document.querySelector('#sala-multi-card input[value="2"]').checked && document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.toasts').textContent.includes('Respostas: 2'));
    assert.equal(requests.length,2,'Adjacent Sala cards must remain two separate questions');
    const single=requests.find(request=>!request.payload.question.multiple)?.payload.question;
    const multiple=requests.find(request=>request.payload.question.multiple)?.payload.question;
    assert.ok(single,'A radiogroup with an icon-only label must be detected');
    assert.ok(multiple,'Unnamed checkboxes outside a fieldset must form their own group');
    assert.match(single.prompt,/Quanto é dois mais dois/);
    assert.ok(!single.prompt.includes('números são primos'));
    assert.match(multiple.prompt,/Quais números são primos/);
    assert.ok(!multiple.prompt.includes('dois mais dois'));
    assert.deepEqual(single.options.map(option=>option.text),['Dois','Quatro','Seis','Oito']);
    assert.deepEqual(multiple.options.map(option=>option.text),['2','4','7','9']);
    assert.deepEqual(await activity.locator('#sala-single-card input:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['1']);
    assert.deepEqual(await activity.locator('#sala-multi-card input:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['0','2']);
    assert.equal(requests.every(request=>request.authorization===undefined),true);
    assert.equal(fixture.directCount(),0);
    assert.equal(fixture.bundleCount(),1);
    assert.equal(activity.url(),activityUrl);
  } finally {await fixture.context.close();}
});
