import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostedClient } from '../src/hosted-client.js';
const endpoint = 'https://lume-test.vercel.app/api/solve';
const token = 'test-app-code';
const question = {prompt:'Quanto é 2 + 2?',multiple:false,options:[{text:'3',element:{}},{text:'4',element:{}}],element:{private:'not sent'}};
const answer = {indices:[1],explanation:'2 + 2 = 4.',confidence:'high'};

test('hosted transport sends only question data and its app code, never a supplied Groq key', async () => {
  let request;
  const client = createHostedClient({endpoint,token,fetchImpl:async(url,options)=>{request={url,options};return Response.json(answer);}});
  assert.deepEqual(await client.solve({question,apiKey:'gsk_must_not_be_sent'}),answer);
  assert.equal(request.options.headers.Authorization,'Bearer test-app-code');
  assert.equal(request.options.credentials,'omit');
  assert.equal(request.options.redirect,'error');
  assert.ok(!request.options.body.includes('gsk_'));
  assert.ok(!request.options.body.includes('element'));
  assert.equal(JSON.parse(request.options.body).question.options.length,2);
});
test('invalid response indices cannot reach the page adapter', async () => {
  for (const indices of [[2],[0,1],[1,1],['1']]) {
    const client=createHostedClient({endpoint,token,fetchImpl:async()=>Response.json({...answer,indices})});
    await assert.rejects(client.solve({question}),error=>error.code==='FORMAT');
  }
});
test('app access failure and upstream Groq auth failure give different recovery steps', async () => {
  const denied=createHostedClient({endpoint,token,fetchImpl:async()=>Response.json({error:{code:'UNAUTHORIZED',message:'private'}},{status:401})});
  await assert.rejects(denied.solve({question}),error=>error.code==='AUTH'&&error.message.includes('código de acesso'));
  const provider=createHostedClient({endpoint,token,fetchImpl:async()=>Response.json({error:{code:'AUTH',message:'private'}},{status:401})});
  await assert.rejects(provider.solve({question}),error=>error.code==='CONFIG'&&error.message.includes('Groq')&&!error.message.includes('private'));
});
test('pause aborts the native request and pre-aborted work never uses fetch', async () => {
  let calls=0;
  const client=createHostedClient({endpoint,token,fetchImpl:async(_,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))));}});
  const controller=new AbortController();
  const pending=client.solve({question,signal:controller.signal});controller.abort();
  await assert.rejects(pending,error=>error.code==='ABORTED');
  await assert.rejects(client.solve({question,signal:controller.signal}),error=>error.code==='ABORTED');
  assert.equal(calls,1);
});
test('transport refuses insecure or redirect-capable endpoint configuration', () => {
  for (const value of ['http://lume-test/api/solve','https://lume-test/other','https://lume-test/api/solve?target=x']) assert.throws(()=>createHostedClient({endpoint:value,token}));
});

test('public bookmark transport needs no token and never sends an old token', async () => {
  let request;
  const client = createHostedClient({endpoint,public:true,token:'old-private-code',fetchImpl:async(url,options)=>{request={url,options};return Response.json(answer);}});
  assert.deepEqual(await client.solve({question}),answer);
  assert.equal(request.options.headers.Authorization,undefined);
  assert.ok(!request.options.body.includes('old-private-code'));
  const anonymous = createHostedClient({endpoint,public:true,fetchImpl:async()=>Response.json(answer)});
  assert.deepEqual(await anonymous.solve({question}),answer);
});

test('rate limiting reports the wait time without retrying or trusting provider text', async () => {
  let calls=0;
  const client=createHostedClient({endpoint,public:true,fetchImpl:async()=>{
    calls++;
    return Response.json({error:{code:'RATE_LIMIT',message:'private provider text'}},{status:429,headers:{'Retry-After':'75'}});
  }});
  await assert.rejects(client.solve({question}),error=>error.code==='RATE_LIMIT'&&error.retryAfter===75&&error.message.includes('75 s')&&!error.message.includes('private'));
  assert.equal(calls,1);
  const invalid=createHostedClient({endpoint,public:true,fetchImpl:async()=>Response.json({error:{code:'RATE_LIMIT'}},{status:429,headers:{'Retry-After':'invalid'}})});
  await assert.rejects(invalid.solve({question}),error=>error.code==='RATE_LIMIT'&&error.retryAfter===undefined);
});

const blanks={kind:'blanks',prompt:'Complete [Lacuna 1] e [Lacuna 2].',fields:[
  {label:'Variação',element:{private:true},options:[{text:'4',value:'private-value'},{text:'8'}]},
  {label:'Tempo',options:[{text:'2'},{text:'4'}]},
]};
const details={explanation:'Justificativa que não pertence aos campos.',confidence:'high'};

test('hosted blank payload excludes DOM and values, and preserves positional selections',async()=>{
  let sent;
  const client=createHostedClient({endpoint,public:true,fetchImpl:async(_,options)=>{
    sent=JSON.parse(options.body);
    return Response.json({selections:[1,0],...details,notes:'ignored metadata'});
  }});
  assert.deepEqual(await client.solve({question:blanks}),{selections:[1,0],...details});
  assert.deepEqual(sent.question,{kind:'blanks',prompt:blanks.prompt,fields:blanks.fields.map(field=>({label:field.label,options:field.options.map(option=>({text:option.text}))}))});
  assert.ok(!JSON.stringify(sent).includes('private'));
  const repeated=createHostedClient({endpoint,public:true,fetchImpl:async()=>Response.json({selections:[1,1],...details})});
  assert.deepEqual((await repeated.solve({question:blanks})).selections,[1,1]);
  const abstaining=createHostedClient({endpoint,public:true,fetchImpl:async()=>Response.json({selections:[],...details})});
  assert.deepEqual((await abstaining.solve({question:blanks})).selections,[]);
  const remaining=createHostedClient({endpoint,public:true,fetchImpl:async()=>Response.json({selections:[0],...details})});
  assert.deepEqual((await remaining.solve({question:{...blanks,fields:[{label:'',options:[{text:'8'}]}]}})).selections,[0]);
});

test('hosted blank validation blocks partial, wrong-type and mismatched field answers',async()=>{
  for(const result of [
    {selections:[1],...details},{selections:[2,0],...details},{selections:[0,-1],...details},
    {selections:['1',0],...details},{selections:[0.5,0],...details},{selections:[0,0,0],...details},
    {indices:[1],...details},{selections:[1,0],text:'wrong-kind',...details},
  ]){
    const client=createHostedClient({endpoint,public:true,fetchImpl:async()=>Response.json(result)});
    await assert.rejects(client.solve({question:blanks}),error=>error.code==='FORMAT');
  }
});

test('hosted text transport validates field limits and returns only the answer text and metadata',async()=>{
  let sent;
  const textQuestion={kind:'text',prompt:'Explique distância e deslocamento.',minLength:5,maxLength:100,element:{private:true},options:[],value:'draft'};
  const client=createHostedClient({endpoint,public:true,fetchImpl:async(_,options)=>{
    sent=JSON.parse(options.body);
    return Response.json({text:'  Distância mede o caminho.  ',...details,notes:'ignored'});
  }});
  assert.deepEqual(await client.solve({question:textQuestion}),{text:'Distância mede o caminho.',...details});
  assert.deepEqual(sent.question,{kind:'text',prompt:textQuestion.prompt,minLength:5,maxLength:100});
  const abstaining=createHostedClient({endpoint,public:true,fetchImpl:async()=>Response.json({text:'  ',...details})});
  assert.equal((await abstaining.solve({question:textQuestion})).text,'');
  for(const result of [{text:'abc',...details},{text:'x'.repeat(101),...details},{text:4,...details},{indices:[],...details},{text:'Resposta válida',selections:[0],...details}]){
    const invalid=createHostedClient({endpoint,public:true,fetchImpl:async()=>Response.json(result)});
    await assert.rejects(invalid.solve({question:textQuestion}),error=>error.code==='FORMAT');
  }
});

test('hosted validation rejects malformed field inputs before network and keeps choice payload compatible',async()=>{
  let calls=0,sent;
  const client=createHostedClient({endpoint,public:true,fetchImpl:async(_,options)=>{calls++;sent=JSON.parse(options.body);return Response.json(answer);}});
  for(const invalidQuestion of [
    {...blanks,fields:[]},{...blanks,fields:[{label:'x',options:[]}]},
    {...blanks,fields:[{label:'x'.repeat(1001),options:blanks.fields[0].options}]},
    {...blanks,fields:Array(21).fill(blanks.fields[0])},{...blanks,fields:new Array(1)},
    {kind:'text',prompt:'Explique.',maxLength:8001},{kind:'text',prompt:'Explique.',maxLength:5,minLength:6},
    {kind:'text',prompt:'Explique.',minLength:-1},{kind:'unknown',prompt:'Explique.'},
    {kind:'text',prompt:'Explique.',maxLength:null},{...question,kind:null},
  ])await assert.rejects(client.solve({question:invalidQuestion}),error=>error.code==='INPUT');
  assert.equal(calls,0);
  await client.solve({question:{...question,kind:'choice'}});
  assert.equal(sent.question.kind,undefined);
  assert.deepEqual(sent.question.options,[{text:'3'},{text:'4'}]);
});
