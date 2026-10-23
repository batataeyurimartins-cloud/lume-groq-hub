const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const {tmpdir}=require('node:os');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const http=require('node:http');
const https=require('node:https');
const {chromium}=require('playwright');

const root=path.join(__dirname,'..');
const telemetryHeaders={
  'request-id':'|0123456789abcdef0123456789abcdef.0123456789abcdef.',
  'request-context':'appId=cid-v1:local-browser-test',
  traceparent:'00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
  tracestate:'localtest=one',
  baggage:'localtest=one',
};
const question={prompt:'Quanto é dois mais dois?',multiple:false,options:[{text:'Três'},{text:'Quatro'}]};
const activityHtml='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><fieldset><legend>Quanto é dois mais dois?</legend><label><input type="radio" name="q" value="3">Três</label><label><input type="radio" name="q" value="4">Quatro</label></fieldset></body></html>';
let browser,sourceServer,otherOriginServer,apiServer,certDirectory;
let sourceOrigin,otherOrigin,endpoint;
let network=[],providerCalls=[];

const listen=server=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>resolve(server.address().port));
});
const close=server=>new Promise(resolve=>{
  if(!server)return resolve();
  server.close(()=>resolve());
  server.closeAllConnections?.();
});
const serveActivity=(req,res)=>{
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(activityHtml);
};

before(async()=>{
  // This certificate exists only inside an isolated localhost browser test.
  // No real service certificate or production TLS setting is changed.
  certDirectory=mkdtempSync(path.join(tmpdir(),'lume-cors-test-'));
  const keyFile=path.join(certDirectory,'localhost-key.pem');
  const certFile=path.join(certDirectory,'localhost-cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',keyFile,'-out',certFile],{stdio:'ignore'});
  sourceServer=http.createServer(serveActivity);
  otherOriginServer=http.createServer(serveActivity);
  sourceOrigin=`http://127.0.0.1:${await listen(sourceServer)}`;
  otherOrigin=`http://127.0.0.1:${await listen(otherOriginServer)}`;
  const {createSolveHandler}=await import(pathToFileURL(path.join(root,'api/solve.js')).href);
  const handler=createSolveHandler({
    env:{PUBLIC_HUB:'true',GROQ_API_KEY:'dummy-key-only-for-local-tests',ALLOWED_ORIGINS:sourceOrigin},
    client:{solve:async input=>{
      providerCalls.push({question:input.question,model:input.model});
      return {indices:[1],explanation:'Dois mais dois são quatro.',confidence:'high'};
    }},
  });
  apiServer=https.createServer({key:readFileSync(keyFile),cert:readFileSync(certFile)},(req,res)=>{
    const record={method:req.method,origin:req.headers.origin,requestedHeaders:req.headers['access-control-request-headers'],requestHeaders:req.headers};
    network.push(record);
    res.once('finish',()=>{
      record.status=res.statusCode;
      record.allowOrigin=res.getHeader('Access-Control-Allow-Origin');
      record.allowHeaders=res.getHeader('Access-Control-Allow-Headers');
    });
    handler(req,res).catch(()=>{res.statusCode=500;res.end('Unexpected local test handler failure');});
  });
  endpoint=`https://127.0.0.1:${await listen(apiServer)}/api/solve`;
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
});
after(async()=>{
  await browser?.close();
  await Promise.all([close(apiServer),close(sourceServer),close(otherOriginServer)]);
  if(certDirectory)rmSync(certDirectory,{recursive:true,force:true});
});

async function pageAt(origin=sourceOrigin) {
  // Trust only this test context's temporary localhost certificate. All HTTP
  // requests below are genuine browser requests; no Playwright routing is used.
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  context.setDefaultTimeout(10000);
  const page=await context.newPage();
  await page.goto(origin+'/activity');
  return {context,page};
}

test('real browser preflight accepts Sala telemetry and completes API response → native marking',async()=>{
  network=[];providerCalls=[];
  const {context,page}=await pageAt();
  try {
    await page.evaluate(({endpoint,telemetryHeaders})=>{
      const nativeFetch=window.fetch.bind(window);
      window.fetch=(resource,init={})=>{
        const headers=new Headers(init.headers);
        for(const [name,value] of Object.entries(telemetryHeaders))headers.set(name,value);
        return nativeFetch(resource,{...init,headers});
      };
      window.__LUME_HOSTED_CONFIG__={endpoint,public:true};
    },{endpoint,telemetryHeaders});
    await page.addScriptTag({content:readFileSync(path.join(root,'dist/hub-groq.js'),'utf8')});
    await page.waitForFunction(()=>document.querySelector('input[value="4"]').checked&&document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.toasts').textContent.includes('Respostas: 1'));
    assert.deepEqual(network.map(request=>[request.method,request.status]),[['OPTIONS',204],['POST',200]],'The real browser must send a successful preflight before POST');
    const requested=network[0].requestedHeaders.split(',').map(value=>value.trim().toLowerCase());
    const allowed=network[0].allowHeaders.split(',').map(value=>value.trim().toLowerCase());
    for(const name of ['content-type',...Object.keys(telemetryHeaders)]){
      assert.ok(requested.includes(name),`Browser did not preflight ${name}`);
      assert.ok(allowed.includes(name),`API did not allow ${name}`);
    }
    assert.equal(network[0].allowOrigin,sourceOrigin);
    for(const [name,value] of Object.entries(telemetryHeaders))assert.equal(network[1].requestHeaders[name],value);
    assert.equal(providerCalls.length,1);
    assert.deepEqual(providerCalls[0].question,question);
    assert.equal(await page.locator('input[value="4"]').isChecked(),true);
  }finally{await context.close();}
});

async function rejectedFetch(page,extraHeaders={}) {
  return page.evaluate(async({endpoint,question,telemetryHeaders,extraHeaders})=>{
    try{
      await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...telemetryHeaders,...extraHeaders},body:JSON.stringify({question}),credentials:'omit'});
      return false;
    }catch(error){return error instanceof TypeError;}
  },{endpoint,question,telemetryHeaders,extraHeaders});
}

test('real browser blocks an unapproved Origin before POST or provider usage',async()=>{
  network=[];providerCalls=[];
  const {context,page}=await pageAt(otherOrigin);
  try{
    assert.equal(await rejectedFetch(page),true);
    assert.deepEqual(network.map(request=>[request.method,request.status]),[['OPTIONS',403]]);
    assert.equal(network[0].origin,otherOrigin);
    assert.equal(network[0].allowOrigin,undefined);
    assert.equal(providerCalls.length,0);
  }finally{await context.close();}
});

test('real browser blocks unknown request headers without granting arbitrary CORS access',async()=>{
  network=[];providerCalls=[];
  const {context,page}=await pageAt();
  try{
    assert.equal(await rejectedFetch(page,{'x-not-approved':'local-test'}),true);
    assert.deepEqual(network.map(request=>[request.method,request.status]),[['OPTIONS',403]]);
    assert.ok(network[0].requestedHeaders.includes('x-not-approved'));
    assert.ok(!network[0].allowHeaders.toLowerCase().includes('x-not-approved'));
    assert.equal(providerCalls.length,0);
  }finally{await context.close();}
});
