import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroqClient } from '../src/groq-client.js';

const question = { prompt: 'Quanto é 2 + 2?', multiple: false, options: [{ text: '3' }, { text: '4' }, { text: '5' }] };
const answer = { indices: [1], explanation: '2 + 2 resulta em 4.', confidence: 'high' };
const envelope = (result = answer, finishReason = 'stop') => ({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(result) } }] });
const ok = (result = answer, finishReason = 'stop') => new Response(JSON.stringify(envelope(result, finishReason)), { status: 200 });
const input = (overrides = {}) => ({ apiKey: 'gsk_test_only', question, ...overrides });
const hasCode = (code) => error => error.code === code;

test('single choice sends only the question and returns validated indices', async () => {
  let request;
  const client = createGroqClient({ fetchImpl: async (url, options) => { request = { url, options }; return ok(); } });
  assert.deepEqual(await client.solve(input()), answer);
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer gsk_test_only');
  assert.equal(request.options.credentials, 'omit');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'openai/gpt-oss-120b');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.deepEqual(JSON.parse(body.messages[1].content), { prompt: question.prompt, multiple: false, options: question.options.map((option, index) => ({ index, text: option.text })) });
});

test('multiple answers are sorted and abstention is allowed', async () => {
  const result = { ...answer, indices: [2, 0] };
  const client = createGroqClient({ fetchImpl: async () => ok(result) });
  assert.deepEqual((await client.solve(input({ question: { ...question, multiple: true } }))).indices, [0, 2]);
  const abstaining = createGroqClient({ fetchImpl: async () => ok({ ...answer, indices: [], confidence: 'low' }) });
  assert.deepEqual((await abstaining.solve(input())).indices, []);
});

test('rejects impossible or incomplete answers before they can be applied', async (t) => {
  const invalid = [
    { ...answer, indices: [3] }, { ...answer, indices: [-1] }, { ...answer, indices: [0.5] },
    { ...answer, indices: ['1'] }, { ...answer, indices: [1, 1] }, { ...answer, indices: [0, 1] },
    { ...answer, confidence: 'certain' }, { ...answer, explanation: '' }, { explanation: 'x', confidence: 'high' },
  ];
  for (const result of invalid) await t.test(JSON.stringify(result), async () => {
    const client = createGroqClient({ fetchImpl: async () => ok(result) });
    await assert.rejects(client.solve(input()), hasCode('FORMAT'));
  });
});

test('rejects invalid JSON and incomplete generation', async () => {
  const malformed = createGroqClient({ fetchImpl: async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '```json\n{}\n```' } }] })) });
  await assert.rejects(malformed.solve(input()), hasCode('FORMAT'));
  const truncated = createGroqClient({ fetchImpl: async () => ok(answer, 'length') });
  await assert.rejects(truncated.solve(input()), hasCode('FORMAT'));
});

test('validates inputs without making a request', async () => {
  let calls = 0;
  const client = createGroqClient({ fetchImpl: async () => { calls++; return ok(); } });
  await assert.rejects(client.solve(input({ apiKey: '' })), hasCode('AUTH'));
  await assert.rejects(client.solve(input({ model: '\nunsafe' })), hasCode('MODEL'));
  await assert.rejects(client.solve(input({ question: { ...question, prompt: 'x'.repeat(20001) } })), hasCode('INPUT'));
  await assert.rejects(client.solve(input({ question: { ...question, options: [{ text: '' }, { text: 'A' }] } })), hasCode('INPUT'));
  assert.equal(calls, 0);
});

const blanks = {
  kind: 'blanks', prompt: 'Complete: variação [Lacuna 1] m/s; aceleração [Lacuna 2] m/s².',
  fields: [
    { label: 'Variação da velocidade', element: { private: true }, options: [{ text: '4', value: 'secret-id' }, { text: '8', element: {} }] },
    { label: 'Aceleração média', options: [{ text: '2' }, { text: '4' }, { text: '8' }] },
  ],
};
const details = { explanation: 'A variação é 8 m/s e a aceleração é 2 m/s².', confidence: 'high' };

test('blank fields are solved together in field order and only readable data reaches Groq', async () => {
  let body;
  const result = { selections: [1, 0], ...details };
  const client = createGroqClient({ fetchImpl: async (_, options) => { body = JSON.parse(options.body); return ok(result); } });
  assert.deepEqual(await client.solve(input({ question: blanks })), result);
  const sent = JSON.parse(body.messages[1].content);
  assert.deepEqual(sent, { kind: 'blanks', prompt: blanks.prompt, fields: blanks.fields.map((field, index) => ({ index, label: field.label, options: field.options.map((option, index) => ({ index, text: option.text })) })) });
  assert.ok(!JSON.stringify(sent).includes('secret-id'));
  assert.ok(!JSON.stringify(sent).includes('element'));
  assert.match(body.messages[0].content, /selections/);
  assert.match(body.messages[0].content, /text/);
  const repeated = createGroqClient({ fetchImpl: async () => ok({ ...details, selections: [1, 1] }) });
  assert.deepEqual((await repeated.solve(input({ question: blanks }))).selections, [1, 1], 'Different blanks may use the same option index');
  const abstaining = createGroqClient({ fetchImpl: async () => ok({ ...details, selections: [] }) });
  assert.deepEqual((await abstaining.solve(input({ question: blanks }))).selections, []);
  const remaining = createGroqClient({ fetchImpl: async () => ok({ ...details, selections: [0] }) });
  assert.deepEqual((await remaining.solve(input({ question: { ...blanks, fields: [{ label: '', options: [{ text: '8' }] }] } }))).selections, [0]);
});

test('partial, out-of-range and wrong-kind blank answers never reach the page', async () => {
  for (const result of [
    { selections: [1], ...details }, { selections: [2, 0], ...details }, { selections: [-1, 0], ...details },
    { selections: ['1', 0], ...details }, { selections: [0.5, 0], ...details },
    { selections: [1, 0, 0], ...details }, { indices: [1], ...details },
    { selections: [1, 0], text: 'wrong type', ...details }, { selections: null, ...details },
  ]) {
    const client = createGroqClient({ fetchImpl: async () => ok(result) });
    await assert.rejects(client.solve(input({ question: blanks })), hasCode('FORMAT'));
  }
});

test('text answers honor field limits, omit DOM data and permit explicit abstention', async () => {
  let sent;
  const textQuestion = { kind: 'text', prompt: 'Explique a diferença entre distância e deslocamento.', minLength: 10, maxLength: 200, element: { private: true }, value: 'existing draft' };
  const result = { text: '  Distância mede o caminho percorrido; deslocamento liga a posição inicial à final.  ', ...details };
  const client = createGroqClient({ fetchImpl: async (_, options) => { sent = JSON.parse(JSON.parse(options.body).messages[1].content); return ok(result); } });
  assert.deepEqual(await client.solve(input({ question: textQuestion })), { ...result, text: result.text.trim() });
  assert.deepEqual(sent, { kind: 'text', prompt: textQuestion.prompt, minLength: 10, maxLength: 200 });
  const abstaining = createGroqClient({ fetchImpl: async () => ok({ text: '   ', ...details }) });
  assert.equal((await abstaining.solve(input({ question: textQuestion }))).text, '');
  const defaults = createGroqClient({ fetchImpl: async (_, options) => { sent = JSON.parse(JSON.parse(options.body).messages[1].content); return ok({ text: 'Resposta curta.', ...details }); } });
  await defaults.solve(input({ question: { kind: 'text', prompt: textQuestion.prompt } }));
  assert.equal(sent.maxLength, 3000);
  assert.equal(sent.minLength, 0);
});

test('invalid new-format inputs fail before a request is sent', async () => {
  let calls = 0;
  const client = createGroqClient({ fetchImpl: async () => { calls++; return ok(); } });
  for (const invalidQuestion of [
    { ...blanks, fields: [] }, { ...blanks, fields: Array(21).fill(blanks.fields[0]) },
    { ...blanks, fields: [{ label: 'x', options: [] }] },
    { ...blanks, fields: [{ label: 'x'.repeat(1001), options: [{ text: 'A' }, { text: 'B' }] }] },
    { ...blanks, fields: [{ label: 'x', options: [{ text: '' }, { text: 'B' }] }] },
    { ...blanks, fields: new Array(1) },
    { kind: 'text', prompt: 'Explique.', maxLength: 0 }, { kind: 'text', prompt: 'Explique.', maxLength: 8001 },
    { kind: 'text', prompt: 'Explique.', maxLength: 20, minLength: 21 }, { kind: 'text', prompt: 'Explique.', minLength: -1 },
    { kind: 'text', prompt: 'Explique.', maxLength: '100' }, { kind: 'unknown', prompt: 'x' },
    { kind: 'text', prompt: 'Explique.', maxLength: null }, { ...question, kind: null },
  ]) await assert.rejects(client.solve(input({ question: invalidQuestion })), hasCode('INPUT'));
  assert.equal(calls, 0);
});

test('text response validation rejects oversized, undersized and wrong-kind output', async () => {
  const textQuestion = { kind: 'text', prompt: 'Explique.', minLength: 5, maxLength: 20 };
  for (const result of [
    { text: 'x'.repeat(21), ...details }, { text: 'abc', ...details }, { text: 2, ...details },
    { indices: [0], ...details }, { text: 'Texto válido', selections: [0], ...details },
    { text: 'Texto válido', indices: [], ...details }, { text: 'Texto válido', explanation: '', confidence: 'high' },
  ]) {
    const client = createGroqClient({ fetchImpl: async () => ok(result) });
    await assert.rejects(client.solve(input({ question: textQuestion })), hasCode('FORMAT'));
  }
});

const orderQuestion = {
  kind: 'order', prompt: 'Organize os blocos para formar a frase.', element: { private: true },
  options: [{ text: 'a', value: 'private-id' }, { text: 'casa', element: {} }, { text: 'a' }],
};

test('order questions preserve duplicate blocks as distinct indices and send only readable data', async () => {
  let body;
  const result = { order: [2, 1, 0], ...details };
  const client = createGroqClient({ fetchImpl: async (_, options) => { body = JSON.parse(options.body); return ok({ ...result, notes: 'discarded metadata' }); } });
  assert.deepEqual(await client.solve(input({ question: orderQuestion })), result);
  assert.deepEqual(JSON.parse(body.messages[1].content), { kind: 'order', prompt: orderQuestion.prompt, options: [{ index: 0, text: 'a' }, { index: 1, text: 'casa' }, { index: 2, text: 'a' }] });
  assert.match(body.messages[0].content, /kind="order"/);
  assert.match(body.messages[0].content, /orderedBlocks/);
  assert.match(body.messages[0].content, /cada ocorrência exatamente uma vez/);
  assert.equal(body.reasoning_effort, 'medium');
  assert.ok(!body.messages[1].content.includes('private'));
  const abstaining = createGroqClient({ fetchImpl: async () => ok({ order: [], ...details }) });
  assert.deepEqual((await abstaining.solve(input({ question: orderQuestion }))).order, []);
});

test('readable ordered blocks become original indices locally in one request', async () => {
  const words = ['demanda', 'industriais', 'cadeias', 'as', 'globais', 'por', 'reorganiza', 'terras', 'A', 'raras'];
  const orderedBlocks = ['A', 'demanda', 'por', 'terras', 'raras', 'reorganiza', 'as', 'cadeias', 'industriais', 'globais'];
  let calls = 0;
  const client = createGroqClient({ fetchImpl: async () => { calls++; return ok({ orderedBlocks, ...details }); } });
  const result = await client.solve(input({ question: { kind: 'order', prompt: 'Ordene os blocos para explicar a relação entre recursos naturais, indústria e território.', options: words.map(text => ({ text })) } }));
  assert.deepEqual(result, { order: [8, 0, 5, 7, 9, 6, 3, 2, 1, 4], ...details });
  assert.equal(calls, 1, 'Mapping words must not make a second provider request');
  assert.equal('orderedBlocks' in result, false, 'The public response contract remains a numeric order');
});

test('ordered block matching consumes duplicates and keeps multiword blocks, case and punctuation intact', async () => {
  const options = ['a', 'luz', 'e', 'a', 'água', 'sustentam', 'a vida.'].map(text => ({ text }));
  const orderedBlocks = ['a', 'água', 'e', 'a', 'luz', 'sustentam', ' a   vida. '];
  const client = createGroqClient({ fetchImpl: async () => ok({ orderedBlocks, ...details }) });
  const result = await client.solve(input({ question: { kind: 'order', prompt: 'Ordene.', options } }));
  assert.deepEqual(result.order, [0, 4, 2, 3, 1, 5, 6]);
  assert.equal(new Set(result.order).size, options.length);
  const duplicateIds = createGroqClient({ fetchImpl: async () => ok({ orderedBlocks: ['a', 'casa', 'a'], order: [2, 1, 0], ...details }) });
  assert.deepEqual((await duplicateIds.solve(input({ question: orderQuestion }))).order, [0, 1, 2], 'Equivalent duplicate occurrences do not contradict the visible sequence');
  const abstaining = createGroqClient({ fetchImpl: async () => ok({ orderedBlocks: [], ...details }) });
  assert.deepEqual((await abstaining.solve(input({ question: orderQuestion }))).order, []);
});

test('invented, omitted, repeated and contradictory ordered blocks are rejected before filling', async () => {
  for (const result of [
    { orderedBlocks: ['a', 'casa'], ...details },
    { orderedBlocks: ['a', 'casa', 'casa'], ...details },
    { orderedBlocks: ['a', 'casas', 'a'], ...details },
    { orderedBlocks: ['A', 'casa', 'a'], ...details },
    { orderedBlocks: ['a', 'casa.', 'a'], ...details },
    { orderedBlocks: ['a', 1, 'a'], ...details },
    { orderedBlocks: ['a', '', 'a'], ...details },
    { orderedBlocks: null, ...details },
    { orderedBlocks: ['a', 'casa', 'a'], order: [0, 2, 1], ...details },
    { orderedBlocks: ['a', 'casa', 'a'], order: [0, 1, 1], ...details },
    { orderedBlocks: ['a', 'casa', 'a'], order: ['0', 1, 2], ...details },
    { orderedBlocks: ['a', 'casa', 'a'], indices: [], ...details },
    { orderedBlocks: [], order: [0, 1, 2], ...details },
  ]) {
    const client = createGroqClient({ fetchImpl: async () => ok(result) });
    await assert.rejects(client.solve(input({ question: orderQuestion })), hasCode('FORMAT'));
  }
});

test('order output requires a full numeric permutation and rejects mixed answer kinds', async () => {
  for (const result of [
    { order: [0, 1], ...details }, { order: [0, 1, 1], ...details }, { order: [0, 1, 3], ...details },
    { order: [0, 1, -1], ...details }, { order: [0, 1, 1.5], ...details }, { order: ['a', 'casa', 'a'], ...details },
    { order: ['0', 1, 2], ...details }, { order: null, ...details }, { indices: [0, 1, 2], ...details },
    { order: [2, 1, 0], indices: [], ...details }, { order: [2, 1, 0], selections: [], ...details },
    { order: [2, 1, 0], text: 'a casa a', ...details },
  ]) {
    const client = createGroqClient({ fetchImpl: async () => ok(result) });
    await assert.rejects(client.solve(input({ question: orderQuestion })), hasCode('FORMAT'));
  }
  for (const [question, result] of [
    [blanks, { selections: [1, 0], order: [], ...details }],
    [{ kind: 'text', prompt: 'Explique.' }, { text: 'Resposta válida.', order: [], ...details }],
  ]) {
    const client = createGroqClient({ fetchImpl: async () => ok(result) });
    await assert.rejects(client.solve(input({ question })), hasCode('FORMAT'));
  }
});

test('order input is bounded to 2–60 blocks of at most 1000 characters and 32000 total JSON characters', async () => {
  let calls = 0;
  const client = createGroqClient({ fetchImpl: async () => { calls++; return ok({ order: [], ...details }); } });
  for (const options of [
    [], [{ text: 'one' }], Array(61).fill({ text: 'x' }),
    [{ text: ' ' }, { text: 'x' }], [{ text: 'x'.repeat(1001) }, { text: 'x' }],
    new Array(2), Array(60).fill({ text: 'x'.repeat(600) }),
  ]) await assert.rejects(client.solve(input({ question: { ...orderQuestion, options } })), hasCode('INPUT'));
  assert.equal(calls, 0);
  const maximum = Array.from({ length: 60 }, (_, index) => ({ text: `bloco ${index}` }));
  const result = await client.solve(input({ question: { ...orderQuestion, options: maximum } }));
  assert.deepEqual(result.order, []);
  assert.equal(calls, 1);
});

test('retries rate limiting once and respects Retry-After', async () => {
  let calls = 0;
  const client = createGroqClient({ retryDelayMs: 0, fetchImpl: async () => ++calls === 1
    ? new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }) : ok() });
  assert.deepEqual(await client.solve(input()), answer);
  assert.equal(calls, 2);
});

test('long provider cooldown returns RATE_LIMIT immediately instead of retrying after eight seconds', async () => {
  let calls = 0;
  const client = createGroqClient({ timeoutMs: 30, fetchImpl: async () => {
    calls++;
    return new Response('{}', { status: 429, headers: { 'Retry-After': '75.2' } });
  } });
  await assert.rejects(client.solve(input()), error => error.code === 'RATE_LIMIT' && error.retryAfter === 76);
  assert.equal(calls, 1);
});

test('HTTP-date Retry-After is preserved as seconds and very long waits are capped at one day', async () => {
  const current = Date.UTC(2026, 9, 23, 12, 0, 0);
  for (const [value, expected] of [
    [new Date(current + 75000).toUTCString(), 75],
    [new Date(current + 3 * 86400000).toUTCString(), 86400],
    ['999999999', 86400],
  ]) {
    let calls = 0;
    const client = createGroqClient({ now: () => current, timeoutMs: 30, fetchImpl: async () => {
      calls++;
      return new Response('{}', { status: 429, headers: { 'Retry-After': value } });
    } });
    await assert.rejects(client.solve(input()), error => error.code === 'RATE_LIMIT' && error.retryAfter === expected);
    assert.equal(calls, 1);
  }
});

test('invalid or absent cooldown headers use the bounded retry fallback without invented metadata', async () => {
  for (const value of [undefined, '', 'not-a-date', '-3', 'Infinity', '0x10', '123garbage']) {
    let calls = 0;
    const client = createGroqClient({ retryDelayMs: 0, fetchImpl: async () => {
      calls++;
      return new Response('{}', { status: 429, headers: value === undefined ? {} : { 'Retry-After': value } });
    } });
    await assert.rejects(client.solve(input()), error => error.code === 'RATE_LIMIT' && error.retryAfter === undefined);
    assert.equal(calls, 2);
  }
});

test('short and expired cooldowns retain one retry and final valid metadata', async () => {
  const current = Date.UTC(2026, 9, 23, 12, 0, 0);
  for (const [value, expected] of [['0.005', 1], [new Date(current - 10000).toUTCString(), 0]]) {
    let calls = 0;
    const client = createGroqClient({ now: () => current, fetchImpl: async () => {
      calls++;
      return new Response('{}', { status: 429, headers: { 'Retry-After': value } });
    } });
    await assert.rejects(client.solve(input()), error => error.code === 'RATE_LIMIT' && error.retryAfter === expected);
    assert.equal(calls, 2);
  }
});

test('temporary server errors retry once only when their cooldown fits the bounded wait', async () => {
  for (const status of [502, 503]) {
    let calls = 0;
    const short = createGroqClient({ retryDelayMs: 0, fetchImpl: async () => ++calls === 1
      ? new Response('{}', { status, headers: { 'Retry-After': '0' } }) : ok() });
    assert.deepEqual(await short.solve(input()), answer);
    assert.equal(calls, 2);
    calls = 0;
    const long = createGroqClient({ timeoutMs: 30, fetchImpl: async () => {
      calls++;
      return new Response('{}', { status, headers: { 'Retry-After': '45' } });
    } });
    await assert.rejects(long.solve(input()), error => error.code === 'API' && error.retryAfter === 45);
    assert.equal(calls, 1);
  }
});

test('retry is bounded and API errors never include provider data or the key', async () => {
  let calls = 0;
  const client = createGroqClient({ retryDelayMs: 0, fetchImpl: async () => { calls++; return new Response('{"error":"gsk_test_only secret"}', { status: 429 }); } });
  await assert.rejects(client.solve(input()), error => error.code === 'RATE_LIMIT' && !error.message.includes('gsk_'));
  assert.equal(calls, 2);
  const auth = createGroqClient({ fetchImpl: async () => new Response('secret', { status: 401 }) });
  await assert.rejects(auth.solve(input()), hasCode('AUTH'));
  const model = createGroqClient({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'model_decommissioned', message: 'secret' } }), { status: 400 }) });
  await assert.rejects(model.solve(input()), hasCode('MODEL'));
});

test('network failure has a useful Portuguese message', async () => {
  const client = createGroqClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(client.solve(input()), error => error.code === 'NETWORK' && error.message.includes('CSP/CORS'));
});

test('pre-aborted request does not use fetch', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const client = createGroqClient({ fetchImpl: async () => { called = true; return ok(); } });
  await assert.rejects(client.solve(input({ signal: controller.signal })), hasCode('ABORTED'));
  assert.equal(called, false);
});

test('cancellation interrupts fetch and retry waits', async () => {
  const controller = new AbortController();
  const client = createGroqClient({ fetchImpl: () => new Promise(() => {}) });
  const pending = client.solve(input({ signal: controller.signal }));
  controller.abort();
  await assert.rejects(pending, hasCode('ABORTED'));
  const retryController = new AbortController();
  let calls = 0;
  const retryClient = createGroqClient({ fetchImpl: async () => {
    calls++;
    setTimeout(() => retryController.abort(), 5);
    return new Response('{}', { status: 429, headers: { 'Retry-After': '8' } });
  } });
  await assert.rejects(retryClient.solve(input({ signal: retryController.signal })), hasCode('ABORTED'));
  assert.equal(calls, 1);
});

test('timeout covers a fetch or response body that never resolves', async () => {
  const never = () => new Promise(() => {});
  const pendingFetch = createGroqClient({ timeoutMs: 10, fetchImpl: never });
  await assert.rejects(pendingFetch.solve(input()), hasCode('TIMEOUT'));
  const pendingBody = createGroqClient({ timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: never }) });
  await assert.rejects(pendingBody.solve(input()), hasCode('TIMEOUT'));
});

const visionImage = { label: 'Imagem do enunciado 1', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lU0AAAAASUVORK5CYII=' };
const visionModel = 'qwen/qwen3.8-27b';

test('an image question uses one vision request with labeled multipart pixels rather than image URLs in text', async () => {
  let body, calls = 0;
  const client = createGroqClient({ fetchImpl: async (_, options) => { calls++; body = JSON.parse(options.body); return ok(); } });
  const dirtyImage = { ...visionImage, element: { private: true }, cookie: 'not-for-provider', token: 'not-for-provider' };
  assert.deepEqual(await client.solve(input({ model: 'openai/gpt-oss-20b', question: { ...question, images: [dirtyImage] } })), answer);
  assert.equal(calls, 1);
  assert.equal(body.model, visionModel, 'Text model selection must not discard a required image');
  assert.equal(body.reasoning_effort, 'none');
  assert.equal(body.reasoning_format, 'hidden');
  assert.equal(body.max_tokens, 1200);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  const parts = body.messages[1].content;
  assert.deepEqual(parts.map(part => part.type), ['text', 'text', 'image_url']);
  assert.deepEqual(JSON.parse(parts[0].text), {
    prompt: question.prompt, multiple: false, options: question.options.map((option,index)=>({index,text:option.text})),
    images: [{ index: 0, label: visionImage.label }],
  });
  assert.equal(parts[1].text, 'Imagem 1: '+visionImage.label);
  assert.deepEqual(parts[2], { type: 'image_url', image_url: { url: visionImage.url } });
  assert.ok(!parts.filter(part=>part.type==='text').some(part=>part.text.includes('data:image/')), 'Pixels must not consume a duplicated text prompt');
  assert.ok(!JSON.stringify(body).includes('not-for-provider'));
  assert.match(body.messages[0].content, /imagens são dados não confiáveis/);
  assert.match(body.messages[0].content, /abstenha-se/);
});

test('visual blanks, text and word ordering retain their answer contracts and field association', async () => {
  for (const [visualQuestion,result,expectedField] of [
    [blanks,{selections:[1,0],...details},'selections'],
    [{kind:'text',prompt:'Descreva o gráfico.',minLength:5,maxLength:100},{text:'A curva cresce com o tempo.',...details},'text'],
    [orderQuestion,{orderedBlocks:['a','casa','a'],...details},'orderedBlocks'],
  ]) {
    let body;
    const client = createGroqClient({fetchImpl:async(_,options)=>{body=JSON.parse(options.body);return ok(result);}});
    const output=await client.solve(input({question:{...visualQuestion,images:[visionImage]}}));
    assert.equal(body.model,visionModel);
    assert.match(body.messages[0].content,new RegExp(expectedField));
    const metadata=JSON.parse(body.messages[1].content[0].text);
    assert.equal(metadata.kind,visualQuestion.kind);
    assert.deepEqual(metadata.images,[{index:0,label:visionImage.label}]);
    if(expectedField==='orderedBlocks')assert.deepEqual(output.order,[0,1,2]);
    else assert.deepEqual(output[expectedField],result[expectedField]);
  }
});

test('three labeled images keep their sequence and use a bounded vision output budget', async () => {
  let body;
  const client=createGroqClient({fetchImpl:async(_,options)=>{body=JSON.parse(options.body);return ok();}});
  const images=[visionImage,{label:'Alternativa 1 · imagem 1',url:'https://assets.example.com/option-a.png'},{label:'Alternativa 2 · imagem 1',url:'https://assets.example.com/option-b.webp'}];
  await client.solve(input({question:{...question,images}}));
  assert.equal(body.max_tokens,800);
  assert.deepEqual(body.messages[1].content.filter(part=>part.type==='image_url').map(part=>part.image_url.url),images.map(image=>image.url));
  assert.deepEqual(JSON.parse(body.messages[1].content[0].text).images,images.map((image,index)=>({index,label:image.label})));
});

test('encoded image data has its own bound while question text keeps the original 32000 character budget', async () => {
  const largeImage={...visionImage,url:'data:image/png;base64,'+Buffer.concat([Buffer.from(visionImage.url.split(',')[1],'base64'),Buffer.alloc(30000)]).toString('base64')};
  let calls=0;
  const client=createGroqClient({fetchImpl:async()=>{calls++;return ok();}});
  await client.solve(input({question:{...question,images:[largeImage]}}));
  assert.equal(calls,1,'A valid image larger than the text budget must not be treated as text');
  await assert.rejects(client.solve(input({question:{...question,prompt:'x'.repeat(20000),options:Array(5).fill({text:'x'.repeat(3000)}),images:[largeImage]}})),hasCode('INPUT'));
  assert.equal(calls,1);
});

test('malformed or unsafe images are rejected before any provider request', async () => {
  let calls=0;
  const client=createGroqClient({fetchImpl:async()=>{calls++;return ok();}});
  for (const images of [
    null, {}, new Array(1), Array(4).fill(visionImage),
    [{label:visionImage.label}], [{url:visionImage.url,label:''}],
    [{...visionImage,url:'data:image/png;base64,AAAA'}],
    [{...visionImage,url:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='}],
    [{...visionImage,url:'http://assets.example.com/chart.png'}],
    [{...visionImage,url:'https://localhost/chart.png'}],
    [{...visionImage,url:'https://127.0.0.1/chart.png'}],
    [{...visionImage,url:'https://user:password@assets.example.com/chart.png'}],
    [{...visionImage,url:'data:image/png;base64,'+'A'.repeat(700000)}],
  ]) await assert.rejects(client.solve(input({question:{...question,images}})),hasCode('INPUT'));
  assert.equal(calls,0);
});

test('unavailable vision and unreadable image errors never trigger a text-only fallback or expose provider details', async () => {
  for (const [status,code,expected] of [[400,'invalid_image_url','IMAGE'],[413,'image_too_large','IMAGE'],[422,'invalid_request_error','IMAGE'],[404,'model_not_found','MODEL']]) {
    let calls=0;
    const client=createGroqClient({fetchImpl:async()=>{calls++;return Response.json({error:{code,message:'private image URL and provider detail'}},{status});}});
    await assert.rejects(client.solve(input({question:{...question,images:[visionImage]}})),error=>error.code===expected&&!error.message.includes('private'));
    assert.equal(calls,1,'Image errors must not retry through a text-only model');
  }
});

test('an empty image list preserves the text model and original scalar message content', async () => {
  let body;
  const client=createGroqClient({fetchImpl:async(_,options)=>{body=JSON.parse(options.body);return ok();}});
  await client.solve(input({question:{...question,images:[]}}));
  assert.equal(body.model,'openai/gpt-oss-120b');
  assert.equal(typeof body.messages[1].content,'string');
  assert.equal('images' in JSON.parse(body.messages[1].content),false);
  assert.equal(body.max_tokens,3000);
});
