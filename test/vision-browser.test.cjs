const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1sAAAAASUVORK5CYII=', 'base64');
let browser, sourceServer, apiServer, certDirectory, sourceOrigin, endpoint;
let network = [], providerCalls = [], pending = [], slowImages = [], holdAnswers = false;
let nextFixture = '', pageNumber = 0;

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const close = server => new Promise(resolve => {
  if (!server) return resolve();
  server.close(resolve);
  server.closeAllConnections?.();
});

function activity({ image = 'chart', imageOptions = false } = {}) {
  const option = (text, index) => `<div class="MuiBox-root option"><div class="MuiBox-root row"><label class="MuiFormControlLabel-root"><span class="MuiButtonBase-root MuiRadio-root"><input type="radio" value="${index}" class="MuiSwitchBase-input"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"></circle></svg></span></label><div class="MuiBox-root statement"><div class="ql-editor">${text}</div></div></div></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>.MuiPaper-elevation3{padding:16px;margin:16px}.row{display:flex;gap:12px}.option{padding:4px}img{max-width:100%}</style></head><body>
  <aside>PRIVATE_CONTEXT_NOT_FOR_MODEL<img src="/pixel.png" alt="Avatar fora da questão" width="30" height="30"></aside>
  <h2>Tarefa 1: Leitura de gráficos</h2><main><div id="visual-question" class="MuiPaper-root MuiPaper-elevation3">
  <h6 class="MuiTypography-root">Questão 01 de 01</h6><div class="main"><div class="ql-editor"><p>${imageOptions ? 'Qual imagem apresenta o símbolo solicitado?' : 'Observe o gráfico. Qual é o valor da barra verde?'}</p></div></div>
  ${image === 'canvas' ? '<canvas width="400" height="200"></canvas>' : imageOptions ? '' : `<div class="MuiBox-root"><img id="question-image" class="MuiCardMedia-root MuiCardMedia-img" ${image === 'slow' ? 'src="/slow.png"' : 'data-chart="true"'} alt="Gráfico com duas barras" width="480" height="320"></div>`}
  <div class="MuiFormGroup-root" role="radiogroup">${(imageOptions ? ['<img data-option-chart="0" alt="Figura A" width="80" height="80">', '<img data-option-chart="1" alt="Figura B" width="80" height="80">'] : ['2', '3', '7', '10']).map(option).join('')}</div></div></main></body></html>`;
}

before(async () => {
  certDirectory = mkdtempSync(path.join(tmpdir(), 'lume-vision-browser-'));
  const keyFile = path.join(certDirectory, 'localhost-key.pem');
  const certFile = path.join(certDirectory, 'localhost-cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', keyFile, '-out', certFile], { stdio: 'ignore' });
  sourceServer = http.createServer((req, res) => {
    if (req.url === '/slow.png') { slowImages.push(res); return; }
    if (req.url === '/pixel.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(nextFixture);
  });
  sourceOrigin = `http://127.0.0.1:${await listen(sourceServer)}`;
  const { createSolveHandler } = await import(pathToFileURL(path.join(root, 'api/solve.js')).href);
  const handler = createSolveHandler({
    env: { PUBLIC_HUB: 'true', GROQ_API_KEY: 'dummy-local-vision-test-key', ALLOWED_ORIGINS: sourceOrigin },
    client: { solve: async ({ question, model }) => {
      providerCalls.push({ question, model });
      if (holdAnswers) await new Promise(resolve => pending.push(resolve));
      return { indices: [question.options.length === 2 ? 1 : 2], explanation: 'Resposta simulada após a análise da imagem.', confidence: 'high' };
    } },
  });
  apiServer = https.createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
    const record = { method: req.method, authorization: req.headers.authorization };
    network.push(record);
    res.once('finish', () => { record.status = res.statusCode; });
    handler(req, res).catch(() => { if (!res.writableEnded) { res.statusCode = 500; res.end(); } });
  });
  endpoint = `https://127.0.0.1:${await listen(apiServer)}/api/solve`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  pending.splice(0).forEach(resolve => resolve());
  slowImages.splice(0).forEach(res => res.destroy());
  await browser?.close();
  await Promise.all([close(apiServer), close(sourceServer)]);
  if (certDirectory) rmSync(certDirectory, { recursive: true, force: true });
});

async function setup(options = {}) {
  network = []; providerCalls = []; pending = []; slowImages = []; holdAnswers = options.holdAnswers || false;
  nextFixture = activity(options);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  context.setDefaultTimeout(6000);
  const page = await context.newPage();
  await page.goto(`${sourceOrigin}/atividade/vision-${++pageNumber}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.__visionToastHistory = [];
    window.__visionSubmits = 0;
    document.addEventListener('submit', event => { window.__visionSubmits++; event.preventDefault(); });
    function pixels(color, second = false) {
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 320;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 480, 320);
      ctx.fillStyle = '#2469ba'; ctx.fillRect(80, 180, 100, 90);
      ctx.fillStyle = color; ctx.fillRect(280, second ? 90 : 60, 100, second ? 180 : 210);
      ctx.fillStyle = '#111'; ctx.font = '26px sans-serif'; ctx.fillText('AZUL', 88, 310); ctx.fillText('VERDE', 284, 310);
      ctx.font = '32px sans-serif'; ctx.fillText('3', 120, 165); ctx.fillText(second ? '6' : '7', 320, second ? 75 : 45);
      return canvas.toDataURL('image/png');
    }
    const image = document.querySelector('[data-chart]'); if (image) image.src = pixels('#169d4d');
    for (const image of document.querySelectorAll('[data-option-chart]')) image.src = pixels(image.dataset.optionChart === '0' ? '#f26c2b' : '#169d4d');
    window.__replacementImage = pixels('#169d4d', true);
  });
  await page.evaluate(endpoint => { window.__LUME_HOSTED_CONFIG__ = { endpoint, public: true }; }, endpoint);
  await page.addScriptTag({ content: readFileSync(path.join(root, 'dist/hub-groq.js'), 'utf8') });
  await page.locator('#lume-groq-hub').evaluate(host => {
    new MutationObserver(() => { window.__visionToastHistory.push(host.shadowRoot.querySelector('.toasts').textContent); })
      .observe(host.shadowRoot, { childList: true, subtree: true, characterData: true });
  });
  return { context, page };
}

test('actual browser image pixels pass through real CORS/API routing before confirmed marking and task completion', async () => {
  const { context, page } = await setup();
  try {
    assert.equal(providerCalls.length, 0);
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#visual-question input[value="2"]').checked);
    await page.getByRole('button', { name: 'Tarefa concluída', exact: true }).waitFor();
    assert.equal(providerCalls.length, 1);
    const { question, model } = providerCalls[0];
    assert.equal(model, 'qwen/qwen3.8-27b');
    assert.match(question.prompt, /barra verde/);
    assert.equal(question.images.length, 1);
    assert.match(question.images[0].url, /^data:image\/(?:png|jpeg);base64,/);
    assert.ok(question.images[0].url.length > 1000, 'The request must carry rendered pixels, rather than only the alt label');
    assert.match(question.images[0].label, /enunciado/);
    assert.deepEqual(Object.keys(question.images[0]).sort(), ['label', 'url']);
    assert.ok(!JSON.stringify(question).includes('PRIVATE_CONTEXT_NOT_FOR_MODEL'));
    assert.ok(!JSON.stringify(question).includes('Avatar fora da questão'));
    assert.deepEqual(network.map(request => [request.method, request.status]), [['OPTIONS', 204], ['POST', 200]]);
    assert.equal(network[1].authorization, undefined);
    const history = await page.evaluate(() => window.__visionToastHistory.join('\n'));
    assert.match(history, /Analisando imagens/);
    assert.match(history, /Respostas: 1/);
    assert.equal(await page.getByRole('button', { name: 'Tarefa concluída', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__visionSubmits), 0);
  } finally { await context.close(); }
});

test('image-only Sala alternatives remain distinct and their labeled pixels reach the API', async () => {
  const { context, page } = await setup({ imageOptions: true });
  try {
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#visual-question input[value="1"]').checked);
    assert.equal(providerCalls.length, 1);
    const { question } = providerCalls[0];
    assert.equal(question.images.length, 2);
    assert.match(question.images[0].label, /Alternativa 1/);
    assert.match(question.images[1].label, /Alternativa 2/);
    assert.notEqual(question.images[0].url, question.images[1].url);
    assert.ok(question.options.every(option => option.text.trim()), 'Image-only alternatives need stable textual identifiers');
  } finally { await context.close(); }
});

test('unsupported visual content and canceling image loading stop before any API query or response count', async () => {
  const unsupported = await setup({ image: 'canvas' });
  try {
    await unsupported.page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await unsupported.page.waitForFunction(() => document.querySelector('#lume-groq-hub').shadowRoot.querySelector('.toasts').textContent.includes('canvas'));
    await unsupported.page.waitForTimeout(300);
    assert.equal(providerCalls.length, 0);
    assert.equal(network.length, 0);
    assert.equal(await unsupported.page.locator('#visual-question input:checked').count(), 0);
  } finally { await unsupported.context.close(); }
  const loading = await setup({ image: 'slow' });
  try {
    await loading.page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await loading.page.getByText('Lendo imagens…', { exact: true }).waitFor();
    await loading.page.getByRole('button', { name: 'Pausar tarefa', exact: true }).click();
    slowImages.splice(0).forEach(res => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); });
    await loading.page.waitForTimeout(400);
    assert.equal(providerCalls.length, 0);
    assert.equal(network.length, 0);
    assert.equal(await loading.page.locator('#visual-question input:checked').count(), 0);
    assert.equal(await loading.page.getByText('Respostas: 1', { exact: true }).count(), 0);
  } finally { await loading.context.close(); }
});

test('replacing an image while its answer is pending rejects the old result and never marks it', async () => {
  const { context, page } = await setup({ holdAnswers: true });
  try {
    await page.getByRole('button', { name: 'Responder tarefa', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#lume-groq-hub').shadowRoot.querySelector('.status-text').textContent === 'Analisando imagens…');
    const end = Date.now() + 4000;
    while (providerCalls.length < 1) { if (Date.now() > end) throw new Error('The initial image query did not start'); await page.waitForTimeout(20); }
    await page.locator('#question-image').evaluate(image => { image.src = window.__replacementImage; });
    pending.shift()();
    await page.getByText('A questão mudou. Lendo a página novamente…', { exact: true }).waitFor();
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: 'Pausar tarefa', exact: true }).click();
    pending.splice(0).forEach(resolve => resolve());
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#visual-question input:checked').count(), 0);
    assert.equal(await page.getByText('Respostas: 1', { exact: true }).count(), 0);
  } finally { pending.splice(0).forEach(resolve => resolve()); await context.close(); }
});
