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
  assert.equal(body.model, 'llama-3.3-70b-versatile');
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

test('retries rate limiting once and respects Retry-After', async () => {
  let calls = 0;
  const client = createGroqClient({ retryDelayMs: 0, fetchImpl: async () => ++calls === 1
    ? new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }) : ok() });
  assert.deepEqual(await client.solve(input()), answer);
  assert.equal(calls, 2);
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
