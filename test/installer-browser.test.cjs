const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

let browser;
const site = path.join(__dirname, '../site');
const fakeToken = 'A'.repeat(43);
const rawBundle = '/* Public hub bundle */\n(() => { window.__LUME_GROQ_HUB__ = { version: "test" }; })();';
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function setup({ fragment = '', clipboardFails = false, bundleStatus = 200 } = {}) {
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1200, height: 880 } });
  page.setDefaultTimeout(4000);
  const requests = [];
  await page.route('https://installer.test/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push({ url: request.url(), pathname, headers: request.headers() });
    if (pathname === '/hub-groq.js') {
      await route.fulfill({ status: bundleStatus, contentType: 'text/javascript', body: rawBundle });
      return;
    }
    const filename = { '/': 'index.html', '/install.js': 'install.js', '/style.css': 'style.css' }[pathname];
    if (!filename) { await route.fulfill({ status: 404, body: '' }); return; }
    await route.fulfill({ contentType: filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'text/html', body: await readFile(path.join(site, filename), 'utf8') });
  });
  await page.addInitScript(({ clipboardFails }) => {
    window.installerTest = { copied: '', storageWrites: 0 };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.installerTest.storageWrites++; return original.apply(this, args); };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => {
        if (clipboardFails) throw new Error('Clipboard denied');
        window.installerTest.copied = text;
      } },
    });
  }, { clipboardFails });
  await page.goto(`https://installer.test/${fragment}`);
  await page.locator('#access-token').waitFor();
  return { page, requests };
}

test('installer consumes the fragment without storage and copies same-origin backend configuration', async () => {
  const { page, requests } = await setup({ fragment: `#token=${fakeToken}` });
  try {
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.locator('#access-token').inputValue(), fakeToken);
    assert.equal(await page.locator('#access-token').getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Copiar script', exact: true }).click();
    await page.waitForFunction(() => window.installerTest.copied.length > 0);
    const copied = await page.evaluate(() => window.installerTest.copied);
    const config = JSON.parse(copied.match(/window\.__LUME_HOSTED_CONFIG__ = (.+);/)[1]);
    assert.deepEqual(config, { endpoint: 'https://installer.test/api/solve', token: fakeToken });
    assert.ok(copied.includes(rawBundle));
    assert.equal(await page.evaluate(() => window.installerTest.storageWrites), 0);
    assert.ok(requests.every(request => !request.url.includes(fakeToken) && request.pathname !== '/api/solve'));
    assert.equal(requests.filter(request => request.pathname === '/hub-groq.js').length, 1);
    assert.equal(requests.find(request => request.pathname === '/hub-groq.js').headers['cache-control'], 'no-cache');
    await page.locator('#access-token').fill('B'.repeat(43));
    await page.getByRole('button', { name: 'Copiar script', exact: true }).click();
    await page.waitForFunction(() => window.installerTest.copied.includes('B'.repeat(43)));
    assert.equal(requests.filter(request => request.pathname === '/hub-groq.js').length, 2);
  } finally { await page.close(); }
});

test('installer validates access codes before fetching and removes an invalid token fragment', async () => {
  const { page, requests } = await setup({ fragment: '#token=invalid' });
  try {
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.locator('#access-token').inputValue(), '');
    await page.locator('#access-token').fill('too-short');
    await page.getByRole('button', { name: 'Copiar script', exact: true }).click();
    await page.getByText('Informe um código de acesso válido para preparar seu hub.', { exact: true }).waitFor();
    assert.equal(requests.filter(request => request.pathname === '/hub-groq.js').length, 0);
  } finally { await page.close(); }
});

test('clipboard denial reveals and selects the generated script for manual copying', async () => {
  const { page } = await setup({ clipboardFails: true });
  try {
    await page.locator('#access-token').fill(fakeToken);
    await page.getByRole('button', { name: 'Copiar script', exact: true }).click();
    const textarea = page.getByRole('textbox', { name: 'Script gerado para copiar', exact: true });
    await textarea.waitFor();
    const code = await textarea.inputValue();
    assert.ok(code.includes(rawBundle) && code.includes(fakeToken));
    assert.equal(await textarea.evaluate(element => element.selectionEnd - element.selectionStart), code.length);
    await page.locator('#access-token').fill('C'.repeat(43));
    assert.equal(await textarea.isVisible(), false);
    assert.equal(await page.locator('#generated-script').inputValue(), '');
  } finally { await page.close(); }
});

test('download contains the configured bundle and mobile layout has no horizontal overflow', async () => {
  const { page } = await setup({ fragment: `#token=${fakeToken}` });
  try {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Baixar arquivo/ }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'lume-hub.js');
    const content = await readFile(await download.path(), 'utf8');
    assert.ok(content.includes(fakeToken) && content.includes(rawBundle));
    await page.setViewportSize({ width: 360, height: 780 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: 'Mostrar código de acesso', exact: true }).click();
    assert.equal(await page.locator('#access-token').getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Ocultar código de acesso', exact: true }).click();
    assert.equal(await page.locator('#access-token').getAttribute('type'), 'password');
  } finally { await page.close(); }
});

test('bundle loading failure reports an error without copying any partial script', async () => {
  const { page } = await setup({ fragment: `#token=${fakeToken}`, bundleStatus: 503 });
  try {
    await page.getByRole('button', { name: 'Copiar script', exact: true }).click();
    await page.getByText('Não foi possível carregar o hub. Tente novamente em instantes.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.installerTest.copied), '');
  } finally { await page.close(); }
});
