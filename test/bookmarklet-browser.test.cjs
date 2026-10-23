const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const publicOrigin='https://lume-public.test';
const activityUrl='https://saladofuturo.educacao.sp.gov.br/lume-bookmarklet-test';
let browser;
before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();});

async function setup({scriptDelay=0,missingScript=false}={}) {
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
      return route.fulfill({headers:{'Access-Control-Allow-Origin':new URL(activityUrl).origin},json:{indices:[1],explanation:'Dois mais dois são quatro.',confidence:'high'}});
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
  await context.route(activityUrl,route=>route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors *.educacao.sp.gov.br *.ip.tv; upgrade-insecure-requests"},body:'<!doctype html><html lang="pt-BR"><body><h1>Atividade de teste</h1><fieldset><legend>Quanto é dois mais dois?</legend><label><input type="radio" name="q" value="3">Três</label><label><input type="radio" name="q" value="4">Quatro</label></fieldset></body></html>'}));
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
