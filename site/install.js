(() => {
  'use strict';
  const input = document.querySelector('#access-token');
  const form = document.querySelector('#install-form');
  const copyButton = document.querySelector('#copy-script');
  const downloadButton = document.querySelector('#download-script');
  const feedback = document.querySelector('#feedback');
  const fallback = document.querySelector('#copy-fallback');
  const generated = document.querySelector('#generated-script');
  const reveal = document.querySelector('#reveal-token');
  const validToken = /^[A-Za-z0-9_-]{43}$/;
  let token = '';
  let busy = false;

  // Fragments are never sent to the server. Remove the access code from the URL immediately.
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has('token')) {
    token = fragment.get('token') || '';
    history.replaceState(history.state, '', location.pathname + location.search);
    if (validToken.test(token)) input.value = token;
    else token = '';
  }

  function message(text, tone = 'success') {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
    feedback.hidden = !text;
  }
  function setBusy(value, label = 'Preparando…') {
    busy = value;
    copyButton.disabled = value;
    downloadButton.disabled = value;
    input.disabled = value;
    reveal.disabled = value;
    copyButton.querySelector('span').textContent = value ? label : 'Copiar script';
    form.setAttribute('aria-busy', String(value));
  }
  function readToken() {
    token = input.value.trim();
    if (!validToken.test(token)) {
      token = '';
      message('Informe um código de acesso válido para preparar seu hub.', 'error');
      input.focus();
      return null;
    }
    return token;
  }
  async function prepareScript(accessToken) {
    const response = await fetch('/hub-groq.js', {
      method: 'GET', cache: 'no-store', credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error('Não foi possível carregar o hub. Tente novamente em instantes.');
    const raw = await response.text();
    if (!raw.trim() || raw.length > 500000 || /text\/html/i.test(response.headers.get('content-type') || '') || /^\s*</.test(raw)) {
      throw new Error('O arquivo do hub ainda não está disponível. Atualize a página e tente novamente.');
    }
    const config = { endpoint: `${location.origin}/api/solve`, token: accessToken };
    return `/* Lume · Execute na página da atividade. Seu código de acesso está neste script. */\nwindow.__LUME_HOSTED_CONFIG__ = ${JSON.stringify(config)};\n${raw}\n`;
  }
  function selectCode() {
    generated.focus();
    generated.select();
    generated.setSelectionRange(0, generated.value.length);
  }
  function showFallback(script) {
    generated.value = script;
    fallback.hidden = false;
    message('Seu script está pronto. Copie o texto selecionado e cole no console da atividade.');
    selectCode();
  }
  async function copyScript(event) {
    event.preventDefault();
    if (busy) return;
    const accessToken = readToken();
    if (!accessToken) return;
    fallback.hidden = true;
    generated.value = '';
    message('');
    setBusy(true);
    try {
      const script = await prepareScript(accessToken);
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(script);
        message('Script copiado! Cole no console da atividade e pressione Enter.');
      } catch {
        showFallback(script);
      }
    } catch (error) {
      message(error.message || 'Não foi possível preparar o script. Tente novamente.', 'error');
    } finally { setBusy(false); }
  }
  async function downloadScript() {
    if (busy) return;
    const accessToken = readToken();
    if (!accessToken) return;
    message('');
    setBusy(true);
    try {
      const script = await prepareScript(accessToken);
      const blob = new Blob([script], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'lume-hub.js';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('Arquivo baixado. Abra o .js, copie seu conteúdo e cole no console da atividade.');
    } catch (error) {
      message(error.message || 'Não foi possível baixar o arquivo. Tente novamente.', 'error');
    } finally { setBusy(false); }
  }

  form.addEventListener('submit', copyScript);
  downloadButton.addEventListener('click', downloadScript);
  document.querySelector('#select-script').addEventListener('click', selectCode);
  input.addEventListener('input', () => {
    token = input.value.trim();
    generated.value = '';
    fallback.hidden = true;
    message('');
  });
  reveal.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(show));
    reveal.setAttribute('aria-label', show ? 'Ocultar código de acesso' : 'Mostrar código de acesso');
  });
  window.addEventListener('pagehide', () => {
    token = '';
    input.value = '';
    generated.value = '';
  });
})();
