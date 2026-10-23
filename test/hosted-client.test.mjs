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
