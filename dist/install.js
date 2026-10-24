(() => {
  'use strict';
  const assetBase = new URL('./', document.currentScript?.src || document.baseURI);
  const apiEndpoint = new URL('/api/lume/solve', assetBase).href;
  const bookmarkletLink = document.querySelector('#bookmarklet-link');
  const copyBookmarklet = document.querySelector('#copy-bookmarklet');
  const downloadBookmark = document.querySelector('#download-bookmark');
  const copyScript = document.querySelector('#copy-script');
  const downloadScript = document.querySelector('#download-script');
  const feedback = document.querySelector('#feedback');
  const fallback = document.querySelector('#copy-fallback');
  const generated = document.querySelector('#generated-script');
  const buttons = [copyBookmarklet, downloadBookmark, copyScript, downloadScript];
  let busy = false;

  // Legacy private links are discarded. Public installation needs no access code.
  if (new URLSearchParams(location.hash.slice(1)).has('token')) {
    history.replaceState(history.state, '', location.pathname + location.search);
  }
  const loaderUrl = new URL('bookmarklet.js', assetBase).href;
  const blockedMessage = 'O site bloqueou o Lume. Use a opção “Usar pelo console” no instalador.';
  const bookmarklet = 'javascript:void(function(){' +
    'var w=window,d=document,h=w.__LUME_GROQ_HUB__;' +
    'if(h&&h.mode==="public"&&typeof h.focus==="function"){h.focus();return;}' +
    'if(d.getElementById("lume-bookmarklet-loader"))return;' +
    'var s=d.createElement("script"),done=false,t;' +
    's.id="lume-bookmarklet-loader";' +
    'function clean(){clearTimeout(t);s.onload=null;s.onerror=null;s.remove();}' +
    'function fail(){if(done)return;done=true;clean();w.alert(' + JSON.stringify(blockedMessage) + ');}' +
    's.onload=function(){if(done)return;done=true;clean();};s.onerror=fail;' +
    't=setTimeout(fail,30000);' +
    'try{s.src=' + JSON.stringify(loaderUrl) + ';(d.head||d.documentElement).appendChild(s);}catch(e){fail();}' +
    '}())';
  bookmarkletLink.href = bookmarklet;

  function message(text, tone = 'success') {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
    feedback.hidden = !text;
  }
  function setBusy(value) {
    busy = value;
    for (const button of buttons) button.disabled = value;
    copyScript.textContent = value ? 'Preparando…' : 'Copiar script para o console';
  }
  function selectCode() {
    generated.focus();
    generated.select();
    generated.setSelectionRange(0, generated.value.length);
  }
  async function copyCode(code, mode) {
    fallback.hidden = true;
    generated.value = '';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(code);
      message(mode === 'bookmarklet'
        ? 'Bookmarklet copiado! Crie um favorito e cole o código no campo de endereço.'
        : 'Script copiado! Cole no console da atividade e pressione Enter.');
    } catch {
      generated.value = code;
      document.querySelector('#generated-label').textContent = mode === 'bookmarklet' ? 'Seu bookmarklet está pronto' : 'Seu script está pronto';
      document.querySelector('#generated-help').textContent = mode === 'bookmarklet'
        ? 'Copie o código abaixo e cole no campo de endereço de um favorito.'
        : 'Copie o código abaixo e cole no console da atividade.';
      fallback.hidden = false;
      message('O navegador não permitiu copiar automaticamente. O código está selecionado abaixo.');
      selectCode();
    }
  }
  async function publicScript() {
    const response = await fetch(new URL('hub.js', assetBase).href, {
      method: 'GET', cache: 'no-store', credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error('Não foi possível carregar o hub. Tente novamente em instantes.');
    const raw = await response.text();
    if (!raw.trim() || raw.length > 500000 || /text\/html/i.test(response.headers.get('content-type') || '') || /^\s*</.test(raw)) {
      throw new Error('O arquivo do hub ainda não está disponível. Atualize a página e tente novamente.');
    }
    const config = { endpoint: apiEndpoint, public: true };
    return `/* Lume público · Execute na página da atividade. */\nwindow.__LUME_HOSTED_CONFIG__ = ${JSON.stringify(config)};\n${raw}\n`;
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function escapeHtml(value) {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }
  copyBookmarklet.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try { await copyCode(bookmarklet, 'bookmarklet'); }
    finally { setBusy(false); }
  });
  downloadBookmark.addEventListener('click', () => {
    if (busy) return;
    const content = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Favoritos Lume</TITLE>\n<H1>Favoritos Lume</H1>\n<DL><p>\n<DT><A HREF="' + escapeHtml(bookmarklet) + '">Lume automático</A>\n</DL><p>\n';
    download(content, 'lume-favorito.html', 'text/html;charset=utf-8');
    message('Favorito baixado. Importe o arquivo HTML no gerenciador de favoritos do navegador.');
  });
  copyScript.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    message('');
    try { await copyCode(await publicScript(), 'console'); }
    catch (error) { message(error.message || 'Não foi possível preparar o script. Tente novamente.', 'error'); }
    finally { setBusy(false); }
  });
  downloadScript.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    message('');
    try {
      download(await publicScript(), 'lume-hub.js', 'text/javascript;charset=utf-8');
      message('Arquivo baixado. Abra o .js, copie o conteúdo e cole no console da atividade.');
    } catch (error) { message(error.message || 'Não foi possível baixar o script. Tente novamente.', 'error'); }
    finally { setBusy(false); }
  });
  document.querySelector('#select-script').addEventListener('click', selectCode);
})();
