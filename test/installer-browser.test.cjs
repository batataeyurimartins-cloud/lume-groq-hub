const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

let browser;
const site = path.join(__dirname, '../site');
const rawBundle = '/* Public hub bundle */\n(() => { window.__LUME_GROQ_HUB__ = { version: "test" }; })();';
const loaderBundle = 'window.installerTest.loaded++;window.__LUME_GROQ_HUB__={mode:"public",focus:function(){window.installerTest.focused++;}};';
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function setup({ fragment = '', clipboardFails = false, bundleStatus = 200, loaderStatus = 200, loaderDelay = 0, assetPrefix = '/', pagePath = '/' } = {}) {
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1200, height: 880 } });
  page.setDefaultTimeout(4000);
  const requests = [];
  await page.route('https://installer.test/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    requests.push({ url: request.url(), pathname, headers: request.headers() });
    if (pathname === `${assetPrefix}hub.js`) {
      await route.fulfill({ status: bundleStatus, contentType: 'text/javascript', body: rawBundle });
      return;
    }
    if (pathname === `${assetPrefix}bookmarklet.js`) {
      if (loaderDelay) await new Promise(resolve => setTimeout(resolve, loaderDelay));
      await route.fulfill({ status: loaderStatus, contentType: 'text/javascript', body: loaderBundle });
      return;
    }
    const filename = { [pagePath]: 'index.html', [`${assetPrefix}install.js`]: 'install.js', [`${assetPrefix}style.css`]: 'style.css' }[pathname];
    if (!filename) { await route.fulfill({ status: 404, body: '' }); return; }
    let body = await readFile(path.join(site, filename), 'utf8');
    if (filename === 'index.html') body = body.replace(/href="(?:\.\/|\/)style\.css"/, `href="${assetPrefix}style.css"`).replace(/src="(?:\.\/|\/)install\.js"/, `src="${assetPrefix}install.js"`);
    await route.fulfill({ contentType: filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'text/html', body });
  });
  await page.addInitScript(({ clipboardFails }) => {
    window.installerTest = { copied: '', storageWrites: 0, loaded: 0, focused: 0 };
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
  await page.goto(`https://installer.test${pagePath}${fragment}`);
  await page.locator('#bookmarklet-link').waitFor();
  return { page, requests };
}

async function bookmarkletCode(page) {
  const value = await page.locator('#bookmarklet-link').getAttribute('href');
  assert.ok(value.startsWith('javascript:'));
  return value.slice('javascript:'.length);
}

test('public installer needs no access fields, discards legacy token and offers a one-line draggable bookmarklet', async () => {
  const { page, requests } = await setup({ fragment: '#token=legacy-private-code' });
  try {
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.locator('input[type="password"], #access-token, #lume-api-key').count(), 0);
    const link = page.locator('#bookmarklet-link');
    assert.equal(await link.getAttribute('draggable'), 'true');
    const code = await bookmarkletCode(page);
    assert.ok(code.includes('https://installer.test/bookmarklet.js'));
    assert.ok(code.includes('lume-bookmarklet-loader') && code.includes('30000'));
    assert.ok(!/\r|\n|eval\s*\(|new\s+Function/.test(code));
    assert.ok(!code.includes('legacy-private-code'));
    await page.getByRole('button', { name: 'Copiar bookmarklet', exact: true }).click();
    await page.waitForFunction(() => window.installerTest.copied.startsWith('javascript:'));
    assert.equal(await page.evaluate(() => window.installerTest.copied), `javascript:${code}`);
    assert.equal(await page.evaluate(() => window.installerTest.storageWrites), 0);
    assert.equal(requests.filter(request => ['/hub.js', '/api/lume/solve'].includes(request.pathname)).length, 0);
  } finally { await page.close(); }
});

test('bookmarklet injects only one pending loader, cleans it and focuses an existing public hub', async () => {
  const { page, requests } = await setup({ loaderDelay: 180 });
  try {
    const code = await bookmarkletCode(page);
    await page.evaluate(`(() => { ${code}; ${code}; })()`);
    assert.equal(await page.locator('#lume-bookmarklet-loader').count(), 1);
    await page.waitForFunction(() => window.installerTest.loaded === 1);
    assert.equal(await page.locator('#lume-bookmarklet-loader').count(), 0);
    await page.evaluate(code);
    assert.equal(await page.evaluate(() => window.installerTest.focused), 1);
    assert.equal(requests.filter(request => request.pathname === '/bookmarklet.js').length, 1);
  } finally { await page.close(); }
});

test('bookmarklet loads the public version when a stale private hub exists', async () => {
  const { page, requests } = await setup();
  try {
    const code = await bookmarkletCode(page);
    await page.evaluate(() => { window.__LUME_GROQ_HUB__ = { mode: 'private', focus: () => window.installerTest.focused++ }; });
    await page.evaluate(code);
    await page.waitForFunction(() => window.installerTest.loaded === 1);
    assert.equal(await page.evaluate(() => window.installerTest.focused), 0);
    assert.equal(requests.filter(request => request.pathname === '/bookmarklet.js').length, 1);
  } finally { await page.close(); }
});

test('blocked loader is removed and reports the console fallback without opening a new tab', async () => {
  const { page } = await setup({ loaderStatus: 503 });
  try {
    const code = await bookmarkletCode(page);
    const dialogPromise = page.waitForEvent('dialog');
    await page.evaluate(code);
    const dialog = await dialogPromise;
    assert.ok(dialog.message().includes('O site bloqueou o Lume') && dialog.message().includes('Usar pelo console'));
    await dialog.accept();
    assert.equal(await page.locator('#lume-bookmarklet-loader').count(), 0);
    assert.equal(page.context().pages().length, 1);
  } finally { await page.close(); }
});

test('console fallback copies public backend configuration with a fresh bundle and no token', async () => {
  const { page, requests } = await setup();
  try {
    await page.getByText('Usar pelo console', { exact: true }).click();
    await page.getByRole('button', { name: 'Copiar script para o console', exact: true }).click();
    await page.waitForFunction(() => window.installerTest.copied.includes('__LUME_HOSTED_CONFIG__'));
    const copied = await page.evaluate(() => window.installerTest.copied);
    const config = JSON.parse(copied.match(/window\.__LUME_HOSTED_CONFIG__ = (.+);/)[1]);
    assert.deepEqual(config, { endpoint: 'https://installer.test/api/lume/solve', public: true });
    assert.ok(copied.includes(rawBundle));
    assert.ok(!Object.hasOwn(config, 'token'));
    assert.equal(requests.find(request => request.pathname === '/hub.js').headers['cache-control'], 'no-cache');
    assert.equal(requests.filter(request => request.pathname === '/api/lume/solve').length, 0);
    assert.equal(await page.evaluate(() => window.installerTest.storageWrites), 0);
  } finally { await page.close(); }
});

test('clipboard denial exposes selected bookmarklet and console code for manual copying', async () => {
  const { page } = await setup({ clipboardFails: true });
  try {
    await page.getByRole('button', { name: 'Copiar bookmarklet', exact: true }).click();
    const textarea = page.locator('#generated-script');
    await textarea.waitFor();
    let code = await textarea.inputValue();
    assert.ok(code.startsWith('javascript:'));
    assert.equal(await textarea.evaluate(element => element.selectionEnd - element.selectionStart), code.length);
    await page.getByText('Usar pelo console', { exact: true }).click();
    await page.getByRole('button', { name: 'Copiar script para o console', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#generated-script').value.includes('__LUME_HOSTED_CONFIG__'));
    code = await textarea.inputValue();
    assert.ok(code.includes(rawBundle) && code.includes('"public":true'));
    assert.equal(await textarea.evaluate(element => element.selectionEnd - element.selectionStart), code.length);
  } finally { await page.close(); }
});

test('downloaded Netscape bookmarks file contains the real bookmarklet and mobile layout fits', async () => {
  const { page } = await setup();
  try {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar favorito', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'lume-favorito.html');
    const content = await readFile(await download.path(), 'utf8');
    assert.ok(content.includes('NETSCAPE-Bookmark-file-1') && content.includes('HREF="javascript:'));
    assert.ok(content.includes('https://installer.test/bookmarklet.js'));
    await page.setViewportSize({ width: 360, height: 780 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('#bookmarklet-link').isVisible(), true);
  } finally { await page.close(); }
});


test('BatataHub installer resolves nested script assets while keeping its API at the origin root', async () => {
  const prefix = '/scripts/lume/';
  const { page, requests } = await setup({ assetPrefix: prefix, pagePath: '/lume.html' });
  try {
    assert.equal(new URL(page.url()).pathname, '/lume.html');
    const code = await bookmarkletCode(page);
    assert.ok(code.includes('https://installer.test/scripts/lume/bookmarklet.js'));
    assert.ok(!code.includes('https://installer.test/bookmarklet.js'));
    assert.equal(requests.some(request => request.pathname.startsWith('/api/')), false);
    await page.evaluate(code);
    await page.waitForFunction(() => window.installerTest.loaded === 1);
    assert.equal(requests.filter(request => request.pathname === `${prefix}bookmarklet.js`).length, 1);
    await page.getByText('Usar pelo console', { exact: true }).click();
    await page.getByRole('button', { name: 'Copiar script para o console', exact: true }).click();
    await page.waitForFunction(() => window.installerTest.copied.includes('__LUME_HOSTED_CONFIG__'));
    const copied = await page.evaluate(() => window.installerTest.copied);
    const config = JSON.parse(copied.match(/window\.__LUME_HOSTED_CONFIG__ = (.+);/)[1]);
    assert.deepEqual(config, { endpoint: 'https://installer.test/api/lume/solve', public: true });
    assert.ok(copied.includes(rawBundle));
    const bundleRequests = requests.filter(request => request.pathname.endsWith('/hub.js'));
    assert.equal(bundleRequests.length, 1);
    assert.equal(bundleRequests[0].pathname, `${prefix}hub.js`);
    assert.equal(bundleRequests[0].headers['cache-control'], 'no-cache');
    assert.equal(requests.some(request => request.pathname.startsWith('/api/')), false);
    assert.equal(await page.evaluate(() => window.installerTest.storageWrites), 0);
  } finally { await page.close(); }
});
