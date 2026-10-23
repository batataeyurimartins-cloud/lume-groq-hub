import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createSolveHandler } from '../api/solve.js';
import { createGroqClient } from '../src/groq-client.js';

const origin = 'https://saladofuturo.educacao.sp.gov.br';
const env = { GROQ_API_KEY: 'gsk_dummy_test_only', HUB_ACCESS_TOKEN: 'dummy_access_token_for_tests_only' };
const question = { prompt: 'Quanto é 2 + 2?', multiple: false, options: [{text:'3'}, {text:'4'}] };
const answer = { indices:[1], explanation:'2 + 2 = 4.', confidence:'high' };
const defaultClient = { solve: async () => answer };

function makeRequest({method='POST', headers={}, body={question}, stream}={}) {
  const req = stream === undefined ? new EventEmitter() : Readable.from(stream);
  req.method = method;
  req.headers = {'content-type':'application/json', authorization:`Bearer ${env.HUB_ACCESS_TOKEN}`, origin, ...headers};
  if (stream === undefined) req.body = body;
  return req;
}

function makeResponse() {
  const res = new EventEmitter();
  res.headers = {};
  res.setHeader = (name,value) => { res.headers[name.toLowerCase()] = value; };
  res.end = text => { res.text=text || ''; res.writableEnded=true; res.body=text ? JSON.parse(text) : null; };
  return res;
}

async function invoke({handler=createSolveHandler({env,client:defaultClient}),...options}={}) {
  const req = makeRequest(options);
  const res = makeResponse();
  await handler(req,res);
  return {req,res};
}

test('authenticated allowed-origin POST returns validated answer and restrictive CORS',async()=>{
  let received;
  const handler=createSolveHandler({env,client:{solve:async input=>{received=input;return answer;}}});
  const {res}=await invoke({handler});
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,answer);
  assert.equal(received.apiKey,env.GROQ_API_KEY);
  assert.equal(received.model,'llama-3.3-70b-versatile');
  assert.deepEqual(received.question,question);
  assert.ok(received.signal instanceof AbortSignal);
  assert.equal(res.headers['access-control-allow-origin'],origin);
  assert.equal(res.headers['cache-control'],'no-store');
  assert.equal(res.headers.vary,'Origin');
  assert.ok(!res.text.includes(env.GROQ_API_KEY));
  assert.ok(!res.text.includes(env.HUB_ACCESS_TOKEN));
});

test('bearer token is mandatory and checked before body parsing or provider usage',async()=>{
  let calls=0;
  const handler=createSolveHandler({env,client:{solve:async()=>{calls++;return answer;}}});
  for (const authorization of ['', 'Basic test', 'Bearer incorrect', `Bearer ${env.HUB_ACCESS_TOKEN}suffix`]) {
    const {res}=await invoke({handler,headers:{authorization},body:'malformed JSON'});
    assert.equal(res.statusCode,401);
    assert.equal(res.body.error.code,'UNAUTHORIZED');
  }
  assert.equal(calls,0);
});

test('denied Origin is rejected before credentials and is never echoed into CORS',async()=>{
  const handler=createSolveHandler({env:{},client:defaultClient});
  const {res}=await invoke({handler,headers:{origin:'https://evil.example'}});
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error.code,'ORIGIN');
  assert.equal(res.headers['access-control-allow-origin'],undefined);
});

test('preflight succeeds only for allowed origins/methods/headers and needs no bearer',async()=>{
  const {res}=await invoke({method:'OPTIONS',headers:{authorization:'','access-control-request-method':'POST','access-control-request-headers':'Authorization, Content-Type'}});
  assert.equal(res.statusCode,204);
  assert.equal(res.text,'');
  assert.equal(res.headers['access-control-max-age'],'600');
  for (const headers of [{origin:''},{origin:'null'},{origin:'https://evil.example'},{'access-control-request-method':'DELETE'},{'access-control-request-headers':'X-Unsafe'}]) {
    const result=await invoke({method:'OPTIONS',headers});
    assert.equal(result.res.statusCode,403);
  }
});

test('no-Origin CLI requests require the bearer; spoofed Host grants no origin',async()=>{
  const {res}=await invoke({headers:{origin:'',host:'evil.example'}});
  assert.equal(res.statusCode,200);
  assert.equal(res.headers['access-control-allow-origin'],undefined);
  const denied=await invoke({headers:{origin:'https://evil.example',host:'evil.example'}});
  assert.equal(denied.res.statusCode,403);
  const unauthorized=await invoke({headers:{origin:'',authorization:''}});
  assert.equal(unauthorized.res.statusCode,401);
});

test('trusted Vercel hosts and explicitly configured exact origins are allowed without wildcard matching',async()=>{
  const handler=createSolveHandler({env:{...env,VERCEL_URL:'lume-build.vercel.app',VERCEL_PROJECT_PRODUCTION_URL:'lume.example.com',ALLOWED_ORIGINS:'https://allowed.example, *'},client:defaultClient});
  for (const value of ['https://lume-build.vercel.app','https://lume.example.com','https://allowed.example']) {
    const {res}=await invoke({handler,headers:{origin:value}});
    assert.equal(res.statusCode,200);
    assert.equal(res.headers['access-control-allow-origin'],value);
  }
  for (const value of [origin,'https://sub.allowed.example','https://allowed.example.evil.com']) {
    const {res}=await invoke({handler,headers:{origin:value}});
    assert.equal(res.statusCode,403);
  }
});

test('missing server secrets and invalid configured model fail with sanitized configuration errors',async()=>{
  for (const overrides of [{GROQ_API_KEY:''},{HUB_ACCESS_TOKEN:''},{GROQ_MODEL:'arbitrary/provider'}]) {
    const handler=createSolveHandler({env:{...env,...overrides},client:defaultClient});
    const {res}=await invoke({handler});
    assert.equal(res.statusCode,503);
    assert.equal(res.body.error.code,'CONFIG');
    assert.ok(!res.text.includes(env.GROQ_API_KEY));
  }
});

test('only POST JSON is accepted and question/model payloads are validated',async()=>{
  const get=await invoke({method:'GET'});
  assert.equal(get.res.statusCode,405);
  assert.equal(get.res.headers.allow,'POST, OPTIONS');
  const text=await invoke({headers:{'content-type':'text/plain'}});
  assert.equal(text.res.statusCode,415);
  for (const body of [null,[],{},'{bad', {question:{...question,multiple:'false'}},{question:{...question,prompt:''}}, {question:{...question,options:[{text:'A'}]}},{question:{...question,options:[{text:''},{text:'B'}]}},{question,model:'gpt-anything'}]) {
    const {res}=await invoke({body});
    assert.equal(res.statusCode,400);
    assert.ok(['INPUT','MODEL'].includes(res.body.error.code));
  }
  let model;
  const handler=createSolveHandler({env,client:{solve:async input=>{model=input.model;return answer;}}});
  const {res}=await invoke({handler,body:{question,model:'llama-3.1-8b-instant'}});
  assert.equal(res.statusCode,200);
  assert.equal(model,'llama-3.1-8b-instant');
});

test('raw request body is byte-limited even when chunked or using multibyte text',async()=>{
  const valid=await invoke({stream:[Buffer.from(JSON.stringify({question}))]});
  assert.equal(valid.res.statusCode,200);
  const tooLarge=await invoke({stream:[Buffer.from(' '.repeat(25000)),Buffer.from(' '.repeat(25000))]});
  assert.equal(tooLarge.res.statusCode,413);
  const unicode=await invoke({body:JSON.stringify({question:{...question,prompt:'🟢'.repeat(13000)}})});
  assert.equal(unicode.res.statusCode,413);
  const declared=await invoke({headers:{'content-length':'60000'}});
  assert.equal(declared.res.statusCode,413);
});

test('server reuses the real Groq client without exposing provider credentials',async()=>{
  let upstream;
  const client=createGroqClient({fetchImpl:async(url,options)=>{
    upstream={url,options};
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}]}));
  }});
  const handler=createSolveHandler({env,client});
  const {res}=await invoke({handler});
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,answer);
  assert.equal(upstream.url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(upstream.options.headers.Authorization,`Bearer ${env.GROQ_API_KEY}`);
  assert.ok(!res.text.includes(env.GROQ_API_KEY));
});

test('upstream failures use fixed public messages instead of provider error content',async()=>{
  for (const [code,status] of [['AUTH',401],['RATE_LIMIT',429],['TIMEOUT',504],['NETWORK',502],['FORMAT',502],['INPUT',400],['MODEL',400],['API',502],['unknown',502]]) {
    const handler=createSolveHandler({env,client:{solve:async()=>{throw Object.assign(new Error(`SECRET:${env.GROQ_API_KEY}`),{code,status:400});}}});
    const {res}=await invoke({handler});
    assert.equal(res.statusCode,status,code);
    assert.ok(!res.text.includes('SECRET'));
    assert.ok(!res.text.includes(env.GROQ_API_KEY));
  }
});

test('client disconnect propagates an AbortSignal and listeners are cleaned up',async()=>{
  let start;
  const started=new Promise(resolve=>{start=resolve;});
  const handler=createSolveHandler({env,client:{solve:async({signal})=>{
    start();
    await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancel'),{code:'ABORTED'})),{once:true}));
  }}});
  const req=makeRequest();
  const res=makeResponse();
  const pending=handler(req,res);
  await started;
  req.emit('aborted');
  await pending;
  assert.equal(res.statusCode,408);
  assert.equal(res.body.error.code,'ABORTED');
  assert.equal(req.listenerCount('aborted'),0);
  assert.equal(res.listenerCount('close'),0);
});

test('per-instance limiter allows 60 requests/minute, rejects extras, and resets',async()=>{
  let time=100000;
  let calls=0;
  const handler=createSolveHandler({env,now:()=>time,client:{solve:async()=>{calls++;return answer;}}});
  for(let index=0;index<60;index++) assert.equal((await invoke({handler})).res.statusCode,200);
  const limited=await invoke({handler});
  assert.equal(limited.res.statusCode,429);
  assert.equal(limited.res.headers['retry-after'],'60');
  assert.equal(calls,60);
  time+=60000;
  assert.equal((await invoke({handler})).res.statusCode,200);
  assert.equal(calls,61);
});
