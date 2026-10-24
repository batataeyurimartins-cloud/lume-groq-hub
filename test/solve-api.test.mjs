import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createSolveHandler, createRequestLimiter } from '../api/solve.js';
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
  assert.equal(received.model,'openai/gpt-oss-120b');
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

test('Sala telemetry headers pass preflight without using Groq or bypassing origin and header checks',async()=>{
  let calls=0;
  const handler=createSolveHandler({env:{...env,PUBLIC_HUB:'true'},client:{solve:async()=>{calls++;return answer;}}});
  const tracing='content-type, request-id, request-context, traceparent, tracestate, baggage';
  const {res}=await invoke({handler,method:'OPTIONS',headers:{authorization:'','access-control-request-method':'POST','access-control-request-headers':tracing}});
  assert.equal(res.statusCode,204);
  const allowed=res.headers['access-control-allow-headers'].toLowerCase().split(',').map(name=>name.trim());
  for(const name of tracing.split(', ')) assert.ok(allowed.includes(name));
  assert.equal(res.headers['access-control-allow-origin'],origin);
  for(const headers of [{origin:'https://evil.example','access-control-request-headers':tracing},{'access-control-request-headers':`${tracing}, x-unsafe`}]) {
    assert.equal((await invoke({handler,method:'OPTIONS',headers})).res.statusCode,403);
  }
  assert.equal(calls,0);
});

test('Groq rate limits preserve a bounded Retry-After visible across origins',async()=>{
  for(const [delay,expected] of [[75,'75'],[999999,'86400'],['secret',undefined],[-1,undefined]]) {
    const handler=createSolveHandler({env,client:{solve:async()=>{throw Object.assign(new Error('provider-private'),{code:'RATE_LIMIT',retryAfter:delay});}}});
    const {res}=await invoke({handler});
    assert.equal(res.statusCode,429);
    assert.equal(res.headers['retry-after'],expected);
    assert.equal(res.headers['access-control-expose-headers'],'Retry-After');
    assert.equal(res.headers['access-control-allow-origin'],origin);
    assert.ok(!res.text.includes('provider-private'));
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
  const {res}=await invoke({handler,body:{question,model:'openai/gpt-oss-20b'}});
  assert.equal(res.statusCode,200);
  assert.equal(model,'openai/gpt-oss-20b');
});

test('blank questions forward only their labeled options and return only selections for that kind',async()=>{
  let received;
  const clean={kind:'blanks',prompt:'Complete a velocidade e a aceleração.',fields:[
    {label:'Variação da velocidade',options:[{text:'4'},{text:'8'}]},
    {label:'Aceleração',options:[{text:'2'},{text:'6'}]},
  ]};
  const dirty={...clean,element:{private:'page data'},options:[{text:'not applicable'}],fields:clean.fields.map(field=>({
    ...field,value:'private DOM value',element:{private:'element'},options:field.options.map(option=>({...option,value:'private option value',element:{private:'option element'}})),
  }))};
  const handler=createSolveHandler({env,client:{solve:async input=>{
    received=input;
    return {selections:[1,0],explanation:'Valores calculados.',confidence:'high',indices:[0],text:'not applicable',providerPrivate:env.GROQ_API_KEY};
  }}});
  const {res}=await invoke({handler,body:{question:dirty,apiKey:'must-not-be-used'}});
  assert.equal(res.statusCode,200);
  assert.deepEqual(received.question,clean);
  assert.equal(received.apiKey,env.GROQ_API_KEY);
  assert.deepEqual(res.body,{selections:[1,0],explanation:'Valores calculados.',confidence:'high'});
  assert.ok(!res.text.includes(env.GROQ_API_KEY));
});

test('a remaining blank may have one option while choice questions still require two',async()=>{
  const remaining={kind:'blanks',prompt:'Complete o campo restante.',fields:[{label:'Variação da velocidade',options:[{text:'8'}]}]};
  let received;
  const handler=createSolveHandler({env,client:{solve:async input=>{
    received=input.question;
    return {selections:[0],explanation:'É a opção restante.',confidence:'high'};
  }}});
  const {res}=await invoke({handler,body:{question:remaining}});
  assert.equal(res.statusCode,200);
  assert.deepEqual(received,remaining);
  assert.deepEqual(res.body.selections,[0]);
  const empty=await invoke({handler,body:{question:{...remaining,fields:[{...remaining.fields[0],options:[]}]}}});
  assert.equal(empty.res.statusCode,400);
  const choice=await invoke({handler,body:{question:{...question,options:[{text:'8'}]}}});
  assert.equal(choice.res.statusCode,400);
});

test('word-bank order questions preserve repeated blocks and project only their ordered indices',async()=>{
  const clean={kind:'order',prompt:'Organize os blocos para formar uma frase.',options:[{text:'o'},{text:'gato'},{text:'viu'},{text:'o'},{text:'rato'}]};
  const dirty={...clean,element:{private:'DOM'},values:['private'],fields:[{private:'field'}],options:clean.options.map((option,index)=>({...option,value:`private-${index}`,element:{private:'element'},id:index}))};
  const output={order:[0,1,2,3,4],explanation:'A frase foi organizada.',confidence:'high'};
  let received;
  const handler=createSolveHandler({env,client:{solve:async input=>{
    received=input.question;
    return {...output,indices:[0],selections:[1],text:'not applicable',providerPrivate:env.GROQ_API_KEY};
  }}});
  const {res}=await invoke({handler,body:{question:dirty}});
  assert.equal(res.statusCode,200);
  assert.deepEqual(received,clean);
  assert.equal(received.options.length,5,'Identical block texts must retain their separate positions');
  assert.deepEqual(res.body,output);
  assert.ok(!res.text.includes(env.GROQ_API_KEY));
});

test('word-bank order limits allow sixty blocks and reject invalid sizes or text before provider usage',async()=>{
  const base={kind:'order',prompt:'Organize estes blocos.',options:[{text:'A'},{text:'B'}]};
  const sixty={...base,options:Array.from({length:60},(_,index)=>({text:`Bloco ${index}`}))};
  let calls=0;
  const handler=createSolveHandler({env,client:{solve:async input=>{
    calls++;
    return {order:input.question.options.map((_,index)=>index),explanation:'Blocos organizados.',confidence:'high'};
  }}});
  const allowed=await invoke({handler,body:{question:sixty}});
  assert.equal(allowed.res.statusCode,200);
  assert.deepEqual(allowed.res.body.order,Array.from({length:60},(_,index)=>index));
  const maxText=await invoke({handler,body:{question:{...base,options:[{text:'x'.repeat(1000)},{text:'B'}]}}});
  assert.equal(maxText.res.statusCode,200);
  const invalid=[
    {...base,options:[]}, {...base,options:[{text:'A'}]},
    {...base,options:Array(61).fill({text:'A'})},
    {...base,options:[{text:''},{text:'B'}]}, {...base,options:[{text:'   '},{text:'B'}]},
    {...base,options:[{text:'x'.repeat(1001)},{text:'B'}]},
    {...base,options:[{text:1},{text:'B'}]}, {...base,options:[null,{text:'B'}]},
    {...base,options:Array(33).fill({text:'x'.repeat(1000)})},
  ];
  for(const candidate of invalid) {
    const {res}=await invoke({handler,body:{question:candidate}});
    assert.equal(res.statusCode,400);
    assert.equal(res.body.error.code,'INPUT');
  }
  assert.equal(calls,2);
});

test('word-bank order answers require a full permutation or abstention',async()=>{
  const candidate={kind:'order',prompt:'Organize os blocos.',options:[{text:'A'},{text:'B'},{text:'A'}]};
  const common={explanation:'Justificativa.',confidence:'high'};
  const cases=[
    [{order:[]},200], [{order:[2,0,1]},200],
    [{order:[0,1]},502], [{order:[0,0,2]},502], [{order:[0,1,3]},502],
    [{order:[-1,0,1]},502], [{order:[0,1,'2']},502], [{order:[0,1,1.5]},502],
    [{order:[0,1,2,3]},502], [{order:'0,1,2'},502], [{order:null},502],
    [{indices:[0,1,2]},502], [{selections:[0,1,2]},502], [{text:'A B A'},502],
  ];
  for(const [fields,status] of cases) {
    const output={...fields,...common};
    const handler=createSolveHandler({env,client:{solve:async()=>({...output,providerPrivate:'not forwarded'})}});
    const {res}=await invoke({handler,body:{question:candidate}});
    assert.equal(res.statusCode,status);
    assert.ok(!res.text.includes('not forwarded'));
    if(status===200)assert.deepEqual(res.body,output);
    else assert.equal(res.body.error.code,'FORMAT');
  }
});

test('text questions support defaults and explicit character limits without forwarding DOM content',async()=>{
  for(const [input,expected] of [
    [{kind:'text',prompt:'Explique distância e deslocamento.',element:{private:'DOM'},options:[{text:'ignored'}]}, {kind:'text',prompt:'Explique distância e deslocamento.',maxLength:3000,minLength:0}],
    [{kind:'text',prompt:'Explique o movimento.',maxLength:80,minLength:8,currentValue:'private answer'}, {kind:'text',prompt:'Explique o movimento.',maxLength:80,minLength:8}],
  ]) {
    let received;
    const handler=createSolveHandler({env,client:{solve:async value=>{received=value;return {text:'A distância mede o caminho percorrido.',explanation:'Definição de distância.',confidence:'high',indices:[0],selections:[1],private:'not forwarded'};}}});
    const {res}=await invoke({handler,body:{question:input}});
    assert.equal(res.statusCode,200);
    assert.deepEqual(received.question,expected);
    assert.deepEqual(res.body,{text:'A distância mede o caminho percorrido.',explanation:'Definição de distância.',confidence:'high'});
  }
});

test('explicit choice kind is normalized to the existing choice contract',async()=>{
  let received;
  const handler=createSolveHandler({env,client:{solve:async input=>{received=input.question;return answer;}}});
  const {res}=await invoke({handler,body:{question:{...question,kind:'choice'}}});
  assert.equal(res.statusCode,200);
  assert.deepEqual(received,question);
  assert.deepEqual(res.body,answer);
});

test('unsupported kinds and invalid blank or text limits fail before provider usage',async()=>{
  const validField={label:'Campo',options:[{text:'A'},{text:'B'}]};
  const blanks={kind:'blanks',prompt:'Preencha as lacunas.',fields:[validField]};
  const text={kind:'text',prompt:'Explique o resultado.'};
  const invalid=[
    {...text,kind:'essay'}, {...text,kind:null},
    {...blanks,fields:[]}, {...blanks,fields:Array(21).fill(validField)}, {...blanks,fields:[null]},
    {...blanks,fields:[{...validField,label:5}]}, {...blanks,fields:[{...validField,label:'x'.repeat(1001)}]},
    {...blanks,fields:[{...validField,options:[]}]},
    {...blanks,fields:[{...validField,options:Array(31).fill({text:'A'})}]},
    {...blanks,fields:[{...validField,options:[{text:'A'},{text:''}]}]},
    {...blanks,fields:[{...validField,options:[{text:'A'},{text:'x'.repeat(4001)}]}]},
    {...text,maxLength:0}, {...text,maxLength:8001}, {...text,maxLength:1.5}, {...text,maxLength:'100'},
    {...text,minLength:-1}, {...text,minLength:3001}, {...text,maxLength:10,minLength:11}, {...text,minLength:'1'},
    {...blanks,fields:Array(5).fill({label:'Campo',options:[{text:'a'.repeat(3500)},{text:'b'.repeat(3500)}]})},
  ];
  let calls=0;
  const handler=createSolveHandler({env,client:{solve:async()=>{calls++;return {selections:[0],explanation:'A opção foi escolhida.',confidence:'high'};}}});
  for(const candidate of invalid) {
    // Separate budgets keep the validation cases independent of the 20/min limiter.
    const fresh=createSolveHandler({env,client:{solve:async()=>{calls++;return answer;}}});
    const {res}=await invoke({handler:fresh,body:{question:candidate}});
    assert.equal(res.statusCode,400);
    assert.equal(res.body.error.code,'INPUT');
  }
  assert.equal(calls,0);
  const emptyLabel=await invoke({handler,body:{question:{...blanks,fields:[{...validField,label:''}]}}});
  assert.equal(emptyLabel.res.statusCode,200,'A blank label may be empty when its context is included in the prompt');
  assert.equal(calls,1);
});

test('answers are validated and projected by question kind, including abstention',async()=>{
  const blanks={kind:'blanks',prompt:'Complete dois campos.',fields:[{label:'Um',options:[{text:'A'},{text:'B'}]},{label:'Dois',options:[{text:'C'},{text:'D'}]}]};
  const text={kind:'text',prompt:'Explique em poucas palavras.',minLength:5,maxLength:30};
  const common={explanation:'Justificativa pública.',confidence:'high'};
  const cases=[
    [blanks,{selections:[],...common},200], [blanks,{selections:[1,0],...common},200],
    [blanks,{selections:[1],...common},502], [blanks,{selections:[1,2],...common},502],
    [blanks,{selections:[1,'0'],...common},502], [blanks,{indices:[1,0],...common},502],
    [text,{text:'',...common},200], [text,{text:'Uma explicação válida.',...common},200],
    [text,{text:'a',...common},502], [text,{text:'   ',...common},200],
    [text,{text:'       Uma explicação válida.       ',...common},200],
    [text,{text:'x'.repeat(31),...common},502], [text,{text:12,...common},502],
    [text,{indices:[0],...common},502], [question,{indices:[3],...common},502],
  ];
  for(const [candidate,output,status] of cases) {
    const handler=createSolveHandler({env,client:{solve:async()=>({...output,private:'provider private'})}});
    const {res}=await invoke({handler,body:{question:candidate}});
    assert.equal(res.statusCode,status);
    assert.ok(!res.text.includes('provider private'));
    if(status===200)assert.deepEqual(res.body,typeof output.text==='string'?{...output,text:output.text.trim()}:output);
    else assert.equal(res.body.error.code,'FORMAT');
  }
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

test('public per-instance limiter allows60 total requests/minute across IPs and resets',async()=>{
  let time=100000;
  let calls=0;
  const handler=createSolveHandler({env:{...env,PUBLIC_HUB:'true'},now:()=>time,client:{solve:async()=>{calls++;return answer;}}});
  for(let index=0;index<60;index++) assert.equal((await invoke({handler,headers:{authorization:'','x-vercel-forwarded-for':`192.0.2.${Math.floor(index/20)+1}`}})).res.statusCode,200);
  const limited=await invoke({handler,headers:{authorization:'','x-vercel-forwarded-for':'192.0.2.4'}});
  assert.equal(limited.res.statusCode,429);
  assert.equal(limited.res.headers['retry-after'],'60');
  assert.equal(calls,60);
  time+=60000;
  assert.equal((await invoke({handler,headers:{authorization:''}})).res.statusCode,200);
  assert.equal(calls,61);
});

test('public mode allows anonymous requests with or without an old private token configured',async()=>{
  for(const configuration of [{...env,PUBLIC_HUB:'true'},{GROQ_API_KEY:env.GROQ_API_KEY,PUBLIC_HUB:'true'}]) {
    const handler=createSolveHandler({env:configuration,client:defaultClient});
    for(const authorization of ['', 'Bearer obsolete_or_incorrect_token']) {
      const {res}=await invoke({handler,headers:{authorization}});
      assert.equal(res.statusCode,200);
      assert.deepEqual(res.body,answer);
      assert.ok(!res.text.includes(env.HUB_ACCESS_TOKEN));
      assert.ok(!res.text.includes(env.GROQ_API_KEY));
    }
    const cli=await invoke({handler,headers:{authorization:'',origin:''}});
    assert.equal(cli.res.statusCode,200);
  }
});

test('public mode keeps origin, provider configuration, payload and model protections',async()=>{
  const handler=createSolveHandler({env:{...env,PUBLIC_HUB:'true'},client:defaultClient});
  const denied=await invoke({handler,headers:{origin:'https://evil.example',authorization:''}});
  assert.equal(denied.res.statusCode,403);
  assert.equal(denied.res.headers['access-control-allow-origin'],undefined);
  const malformed=await invoke({handler,headers:{authorization:''},body:{question,model:'not-permitted'}});
  assert.equal(malformed.res.statusCode,400);
  const missingKey=createSolveHandler({env:{PUBLIC_HUB:'true',HUB_ACCESS_TOKEN:env.HUB_ACCESS_TOKEN},client:defaultClient});
  const unconfigured=await invoke({handler:missingKey,headers:{authorization:''}});
  assert.equal(unconfigured.res.statusCode,503);
  assert.equal(unconfigured.res.body.error.code,'CONFIG');
  for(const value of ['false','TRUE',true,undefined]) {
    const privateHandler=createSolveHandler({env:{...env,PUBLIC_HUB:value},client:defaultClient});
    assert.equal((await invoke({handler:privateHandler,headers:{authorization:''}})).res.statusCode,401);
  }
});

test('public per-IP budget limits each caller to20/minute and prefers trusted Vercel IP',async()=>{
  let time=200000;
  const handler=createSolveHandler({env:{...env,PUBLIC_HUB:'true'},now:()=>time,client:defaultClient});
  for(let index=0;index<20;index++) {
    const {res}=await invoke({handler,headers:{authorization:'','x-vercel-forwarded-for':'198.51.100.7','x-forwarded-for':`203.0.113.${index}`}});
    assert.equal(res.statusCode,200);
  }
  const limited=await invoke({handler,headers:{authorization:'','x-vercel-forwarded-for':'198.51.100.7','x-forwarded-for':'203.0.113.200'}});
  assert.equal(limited.res.statusCode,429);
  assert.equal(limited.res.headers['retry-after'],'60');
  assert.equal(limited.res.headers['access-control-allow-origin'],origin);
  const another=await invoke({handler,headers:{authorization:'','x-vercel-forwarded-for':'198.51.100.8'}});
  assert.equal(another.res.statusCode,200);
  time+=60000;
  const reset=await invoke({handler,headers:{authorization:'','x-vercel-forwarded-for':'198.51.100.7'}});
  assert.equal(reset.res.statusCode,200);
});

test('IP sanitization rejects arbitrary header identities and falls back to the socket',async()=>{
  const handler=createSolveHandler({env:{...env,PUBLIC_HUB:'true'},client:defaultClient});
  for(let index=0;index<20;index++) {
    const req=makeRequest({headers:{authorization:'','x-vercel-forwarded-for':`not-an-ip-${index}`,'x-forwarded-for':`192.0.2.${index}`}});
    req.socket={remoteAddress:'127.0.0.1'};
    const res=makeResponse();
    await handler(req,res);
    assert.equal(res.statusCode,200);
  }
  const req=makeRequest({headers:{authorization:'','x-vercel-forwarded-for':'still-not-an-ip'}});
  req.socket={remoteAddress:'::ffff:127.0.0.1'};
  const res=makeResponse();
  await handler(req,res);
  assert.equal(res.statusCode,429,'IPv4 and IPv4-mapped socket addresses share one budget');
});

test('IP bucket memory is bounded and expired buckets are removed',()=>{
  let time=0;
  const limiter=createRequestLimiter({now:()=>time,maxBuckets:2});
  assert.equal(limiter.consume('192.0.2.1').allowed,true);
  assert.equal(limiter.consume('192.0.2.2').allowed,true);
  assert.equal(limiter.consume('192.0.2.3').allowed,false);
  assert.equal(limiter.size,2);
  for(let index=0;index<100;index++) limiter.consume(`203.0.113.${index}`);
  assert.equal(limiter.size,2);
  time=60000;
  assert.equal(limiter.consume('192.0.2.3').allowed,true);
  assert.equal(limiter.size,1);
});
