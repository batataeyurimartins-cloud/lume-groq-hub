function mountLumeHub() {
  const globalName = '__LUME_GROQ_HUB__';
  const version = '3.1.1';
  const suppliedConfig = window.__LUME_HOSTED_CONFIG__;
  delete window.__LUME_HOSTED_CONFIG__;
  const hostedConfig = suppliedConfig && typeof suppliedConfig.endpoint === 'string' && (suppliedConfig.public === true || typeof suppliedConfig.token === 'string')
    ? { endpoint: suppliedConfig.endpoint, public: suppliedConfig.public === true, token: suppliedConfig.public === true ? '' : suppliedConfig.token } : null;
  if (window[globalName]?.version === version && !hostedConfig) {
    window[globalName].focus();
    return;
  }
  window[globalName]?.close?.();

  const host = document.createElement('div');
  host.id = 'lume-groq-hub';
  host.style.cssText = 'all:initial;position:fixed;right:12px;bottom:12px;width:min(286px,calc(100vw - 24px));z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host{color-scheme:light}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}
      button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.5}
      button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #88a543;outline-offset:3px}
      .panel{font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#2b3827;background:#fcfdf8;border:1px solid #dce3cf;border-radius:18px;box-shadow:0 14px 50px #1c2a1733;overflow:hidden;max-height:calc(100dvh - 24px);display:flex;flex-direction:column}
      .head{display:flex;align-items:center;gap:8px;padding:12px 13px 9px;touch-action:none;cursor:grab;user-select:none}.head:active{cursor:grabbing}
      .logo{width:28px;height:28px;display:grid;place-items:center;background:#d7f17d;color:#405629;border-radius:9px;font-size:21px}
      .brand{flex:1;font-size:19px;font-weight:750;letter-spacing:-.8px}.brand span{font-size:8px;color:#869574;letter-spacing:1.4px;font-weight:500;margin-left:5px}
      .icon{width:23px;height:25px;display:grid;place-items:center;background:none;border:0;border-radius:6px;color:#7c8c6b;padding:0}.icon:hover{background:#eef3e3}.icon[aria-expanded=true]{background:#eaf2da;color:#45622b}svg{display:block}
      .body{padding:3px 13px 13px;overflow:auto;scrollbar-width:thin;overscroll-behavior:contain}
      .status{display:flex;align-items:center;gap:7px;margin:5px 0 12px;color:#7d8b6b;font-size:10px;min-height:16px}.dot{width:6px;height:6px;border-radius:50%;background:#c2cbb6;flex:none}.status[data-active=true] .dot{background:#82a844;box-shadow:0 0 0 3px #edf4dc}.status-text{flex:1}
      .primary{width:100%;border:0;border-radius:10px;min-height:36px;padding:9px 10px;background:#d5ed96;color:#344b22;font-size:11px;font-weight:700}.primary:hover:not(:disabled){background:#cbe781}.primary[data-active=true]{background:#edf2e2;color:#68764e}
      .foot{display:flex;align-items:center;gap:7px;margin-top:10px;color:#9ba58e;font-size:9px}.foot span{flex:1}.undo{border:0;background:none;padding:0;color:#7c8e63;font-size:10px}.undo:hover:not(:disabled){color:#3a5822}
      .settings{padding-top:7px}.field{margin-bottom:11px}.form-label{display:block;font-size:10px;font-weight:600;color:#596d45;margin-bottom:5px}.input{width:100%;border:1px solid #dce4d0;border-radius:8px;padding:8px 9px;font-size:11px;background:#fff;color:#415331}.help{font-size:9px;color:#8a977a;line-height:1.6;margin:6px 0 11px}
      details{font-size:10px;color:#778a5e;margin:12px 0}summary{cursor:pointer;margin-bottom:9px}details .input{font:10px ui-monospace,Consolas,monospace}
      .mini{display:flex;gap:7px;align-items:center;margin-left:auto;background:#fcfdf8;border:1px solid #dce3cf;border-radius:25px;padding:10px 14px;box-shadow:0 8px 30px #1c2a1726;color:#425932;font:650 12px system-ui,sans-serif}.mini .dot{background:#86a84f}
      .toasts{position:fixed;right:14px;top:16px;width:min(292px,calc(100vw - 28px));display:grid;gap:8px;pointer-events:none;font:11px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
      .toast{display:flex;gap:9px;align-items:center;background:#fcfdf8;border:1px solid #dce4ce;border-radius:12px;box-shadow:0 8px 30px #1d2c1a1a;padding:11px 13px;color:#61724d;overflow-wrap:anywhere;animation:appear .18s ease-out}.toast-icon{width:21px;height:21px;border-radius:7px;background:#eef4e0;display:grid;place-items:center;color:#8aa54e;flex:none}.toast[data-tone=success]{border-color:#c9df9d}.toast[data-tone=success] .toast-icon{background:#dff1b7;color:#5e7d34}.toast[data-tone=error]{border-color:#e8c9b8;color:#a15d3e}.toast[data-tone=error] .toast-icon{background:#f8e9df;color:#b2764f}
      @keyframes appear{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.toast{animation:none}}
    </style>
    <section class="panel" role="dialog" aria-label="Lume automático" tabindex="-1">
      <header class="head"><div class="logo" aria-hidden="true">✳</div><div class="brand">lume<span>GROQ</span></div>
        <button class="icon settings-toggle" aria-label="Ajustes" aria-expanded="false" aria-controls="lume-settings" title="Ajustes"><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8 2h4l.6 2.1 1.8 1 2.1-.5 2 3.4L17 9.6v2l1.5 1.5-2 3.4-2.1-.5-1.8 1L12 19H8l-.6-2.1-1.8-1-2.1.5-2-3.4L3 11.5v-2L1.5 8l2-3.4 2.1.5 1.8-1L8 2Z" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="10.5" r="2.5" stroke="currentColor" stroke-width="1.2"/></svg></button>
        <button class="icon minimize" aria-label="Minimizar" title="Minimizar">−</button><button class="icon close" aria-label="Fechar" title="Fechar">×</button>
      </header>
      <div class="body"><div class="main"><div class="status" data-active="false"><span class="dot"></span><span class="status-text">Pronto para começar</span></div><button class="primary toggle">Iniciar automático</button><div class="foot"><span>Alt + Shift + G</span><button class="undo" disabled>Desfazer</button></div></div>
        <div class="settings" id="lume-settings" hidden>
          <div class="field"><label class="form-label" for="lume-api-key">Chave da API Groq</label><input class="input api-key" id="lume-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="gsk_…"></div>
          <div class="field"><label class="form-label" for="lume-model">Modelo</label><input class="input model" id="lume-model" value="openai/gpt-oss-120b" list="lume-models" autocomplete="off" spellcheck="false"><datalist id="lume-models"><option value="openai/gpt-oss-120b"></option><option value="openai/gpt-oss-20b"></option></datalist></div>
          <details><summary>Leitura personalizada</summary><div class="field"><label class="form-label" for="lume-container">Bloco de cada questão</label><input class="input container-selector" id="lume-container" placeholder="Ex.: .question" spellcheck="false"></div><div class="field"><label class="form-label" for="lume-prompt">Enunciado</label><input class="input prompt-selector" id="lume-prompt" placeholder="Ex.: .question-text" spellcheck="false"></div><div class="field"><label class="form-label" for="lume-options">Alternativas</label><input class="input option-selector" id="lume-options" placeholder="Ex.: input[type=radio]" spellcheck="false"></div></details>
          <p class="help">Chave apenas na memória. Ao iniciar, as questões são enviadas à Groq e as sugestões são marcadas automaticamente. A IA pode errar.</p><button class="primary save-settings">Salvar e iniciar</button>
        </div>
      </div>
    </section>
    <button class="mini" hidden aria-label="Abrir painel Lume"><span class="dot"></span>lume / Groq</button>
    <div class="toasts" role="log" aria-label="Notificações do Lume" aria-live="polite" aria-relevant="additions"></div>
  `;
  (document.body || document.documentElement).append(host);
  const $ = selector => shadow.querySelector(selector);
  const adapter = createPageAdapter({ document, exclude: host });
  const client = hostedConfig ? createHostedClient(hostedConfig) : createGroqClient();
  const events = new AbortController();
  const toastTimers = new Map();
  const state = {
    key: hostedConfig ? hostedConfig.token : '', model: 'openai/gpt-oss-120b', selectors: {}, active: false, processing: false,
    closed: false, minimized: false, settingsOpen: false, controller: null, run: 0,
    handled: new Map(), warnings: new Set(), count: 0, undo: null, undoEntry: null,
    dirty: false, timer: null,
  };
  if (hostedConfig) {
    $('.api-key').closest('.field').hidden = true;
    $('.help').textContent = 'Conexão configurada. As questões são enviadas ao servidor e as sugestões são marcadas automaticamente. A IA pode errar.';
  }
  const on = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: events.signal });
  function notify(message, tone = 'working') {
    if (state.closed || !message) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = tone;
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = tone === 'success' ? '✓' : tone === 'error' ? '!' : '✧';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    $('.toasts').append(toast);
    function remove(element) { clearTimeout(toastTimers.get(element)); toastTimers.delete(element); element.remove(); }
    while ($('.toasts').children.length > 3) remove($('.toasts').firstElementChild);
    toastTimers.set(toast, setTimeout(() => remove(toast), 6500));
  }
  function status(message) { if (!state.closed) $('.status-text').textContent = message; }
  function updateControls() {
    if (state.closed) return;
    $('.toggle').textContent = state.active ? 'Pausar automático' : 'Iniciar automático';
    $('.toggle').dataset.active = String(state.active);
    $('.toggle').disabled = !state.active && state.processing;
    $('.status').dataset.active = String(state.active);
    $('.save-settings').disabled = state.processing;
    $('.undo').disabled = state.processing || !state.undo;
  }
  function setSettings(open) {
    state.settingsOpen = open;
    $('.settings').hidden = !open;
    $('.main').hidden = open;
    $('.settings-toggle').setAttribute('aria-expanded', String(open));
    clampPosition();
  }
  const keyFor = question => JSON.stringify([location.href, question.id, question.fingerprint]);
  function pause(announce = true) {
    state.active = false;
    state.run++;
    state.dirty = false;
    clearTimeout(state.timer);
    state.timer = null;
    state.controller?.abort();
    status('Automático pausado');
    updateControls();
    if (announce) notify('Automático pausado.');
  }
  function schedule(delay = 300) {
    if (!state.active || state.closed) return;
    state.dirty = true;
    if (state.timer !== null) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      if (!state.processing) void processPage();
    }, delay);
  }
  function start() {
    if (state.closed || state.active || state.processing) return;
    if (!state.key && !hostedConfig?.public) {
      setSettings(true);
      $('.api-key').focus();
      notify('Adicione sua chave da Groq para iniciar.', 'error');
      return;
    }
    for (const [key, entry] of state.handled) if (entry.status === 'error') state.handled.delete(key);
    state.active = true;
    state.run++;
    state.warnings.clear();
    setSettings(false);
    status('Lendo atividade…');
    notify('Lendo atividade…');
    updateControls();
    schedule(0);
  }
  async function processPage() {
    if (!state.active || state.closed || state.processing) return;
    state.processing = true;
    state.dirty = false;
    const run = state.run;
    updateControls();
    try {
      while (state.active && !state.closed && run === state.run) {
        const result = adapter.scan(state.selectors);
        for (const warning of result.warnings || []) if (!state.warnings.has(warning)) {
          state.warnings.add(warning);
          notify(warning);
        }
        const question = result.questions.find(item => !state.handled.has(keyFor(item)));
        if (!question) {
          if (result.questions.length === 0) {
            status(result.warnings?.length ? 'Leitura precisa de ajuste' : 'Nenhuma alternativa reconhecida');
            const warning = 'Não consegui reconhecer as alternativas desta página.';
            if (!state.warnings.has(warning)) {
              state.warnings.add(warning);
              notify(warning);
            }
          } else status('Concluído · aguardando próxima questão');
          break;
        }
        const key = keyFor(question);
        const pageUrl = location.href;
        if (!adapter.isCurrent(question)) { state.dirty = true; break; }
        const controller = new AbortController();
        state.controller = controller;
        notify('Questão detectada');
        status('Buscando resposta…');
        notify('Buscando resposta…');
        let querying = true;
        try {
          const answer = await client.solve({ apiKey: state.key, model: state.model, question, signal: controller.signal });
          querying = false;
          if (state.closed || !state.active || run !== state.run || controller.signal.aborted) break;
          if (location.href !== pageUrl || !adapter.isCurrent(question)) {
            notify('A questão mudou. Lendo a página novamente…');
            state.dirty = true;
            break;
          }
          if (!answer.indices.length) {
            state.handled.set(key, { status: 'skipped' });
            notify('Sem resposta suficiente. Questão ignorada.');
            continue;
          }
          notify(answer.confidence === 'low' ? 'Resposta detectada · confiança baixa' : 'Resposta detectada');
          status('Marcando respostas…');
          notify('Marcando respostas…');
          const outcome = await adapter.apply(question, answer.indices, { signal: controller.signal });
          if (state.closed) break;
          const entry = { status: outcome.selected ? 'done' : 'error', counted: Boolean(outcome.selected), key };
          if (typeof outcome.undo === 'function') { state.undo = outcome.undo; state.undoEntry = entry; }
          if (outcome.selected) {
            state.handled.set(key, entry);
            state.count++;
            notify(`Respostas: ${state.count}`, 'success');
          } else if (controller.signal.aborted || !state.active || run !== state.run) {
            notify('Marcação interrompida. Você pode desfazer a última ação.');
            break;
          } else {
            state.handled.set(key, entry);
            notify(outcome.message || 'O site não confirmou a marcação.', 'error');
          }
        } catch (error) {
          if (state.closed || !state.active || run !== state.run || controller.signal.aborted || error.code === 'ABORTED') break;
          state.handled.set(key, { status: 'error' });
          pause(false);
          if (querying) status('Erro na consulta · veja o aviso');
          notify(error.message || 'Não foi possível responder. Tente iniciar novamente.', 'error');
          break;
        } finally {
          if (state.controller === controller) state.controller = null;
        }
      }
    } catch (error) {
      if (!state.closed) {
        pause(false);
        notify(error.message || 'Não foi possível ler a atividade. Confira os ajustes.', 'error');
      }
    } finally {
      state.processing = false;
      updateControls();
      if (state.active && state.dirty && !state.closed) schedule();
    }
  }
  async function undoLast() {
    if (state.closed || state.processing || !state.undo) return;
    pause(false);
    state.processing = true;
    const controller = new AbortController();
    state.controller = controller;
    updateControls();
    try {
      const result = await state.undo({ signal: controller.signal });
      if (state.closed) return;
      if (result.restored) {
        if (state.undoEntry?.counted) state.count = Math.max(0, state.count - 1);
        if (state.undoEntry?.key) state.handled.delete(state.undoEntry.key);
        state.undo = null;
        state.undoEntry = null;
        notify('Última resposta desfeita.', 'success');
        notify(`Respostas: ${state.count}`, 'success');
      } else notify(result.message || 'Não foi possível desfazer a última resposta.', 'error');
    } catch (error) { notify(error.message || 'Não foi possível desfazer.', 'error'); }
    finally { state.processing = false; state.controller = null; updateControls(); }
  }
  function clampPosition() {
    if (!host.style.left) return;
    const rect = host.getBoundingClientRect();
    host.style.left = `${Math.max(12, Math.min(parseFloat(host.style.left), window.innerWidth - rect.width - 12))}px`;
    host.style.top = `${Math.max(12, Math.min(parseFloat(host.style.top), window.innerHeight - rect.height - 12))}px`;
  }
  function setMinimized(minimized) {
    state.minimized = minimized;
    $('.panel').hidden = minimized;
    $('.mini').hidden = !minimized;
    if (!minimized) { clampPosition(); $('.panel').focus({ preventScroll: true }); }
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target !== host && !host.contains(record.target))) schedule();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['aria-checked', 'aria-label', 'aria-labelledby', 'aria-hidden', 'aria-disabled', 'hidden', 'style', 'class', 'disabled', 'name', 'type', 'for', 'id'],
  });
  function close() {
    if (state.closed) return;
    state.closed = true;
    state.active = false;
    state.run++;
    state.controller?.abort();
    events.abort();
    observer.disconnect();
    clearTimeout(state.timer);
    for (const timer of toastTimers.values()) clearTimeout(timer);
    toastTimers.clear();
    state.key = '';
    $('.api-key').value = '';
    state.handled.clear();
    state.undo = null;
    state.undoEntry = null;
    host.remove();
    if (window[globalName]?.close === close) delete window[globalName];
  }
  window[globalName] = { version, mode: hostedConfig?.public ? 'public' : hostedConfig ? 'private' : 'direct', focus: () => setMinimized(false), close };
  on($('.settings-toggle'), 'click', () => setSettings(!state.settingsOpen));
  on($('.toggle'), 'click', () => state.active ? pause() : start());
  on($('.save-settings'), 'click', () => {
    if (state.processing) return;
    pause(false);
    state.key = hostedConfig ? hostedConfig.token : $('.api-key').value.trim();
    state.model = $('.model').value.trim() || 'openai/gpt-oss-120b';
    state.selectors = {
      containerSelector: $('.container-selector').value.trim(),
      promptSelector: $('.prompt-selector').value.trim(),
      optionSelector: $('.option-selector').value.trim(),
    };
    start();
  });
  on($('.undo'), 'click', undoLast);
  on($('.close'), 'click', close);
  on($('.minimize'), 'click', () => setMinimized(true));
  on($('.mini'), 'click', () => setMinimized(false));
  on(document, 'change', event => { if (!event.composedPath().includes(host)) schedule(); });
  on(window, 'popstate', () => schedule());
  on(window, 'hashchange', () => schedule());
  on(window, 'resize', clampPosition);
  on(document, 'keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyG') { event.preventDefault(); setMinimized(!state.minimized); }
  });
  let drag = null;
  on($('.head'), 'pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const rect = host.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    $('.head').setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  on($('.head'), 'pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    host.style.left = `${drag.left + event.clientX - drag.x}px`;
    host.style.top = `${drag.top + event.clientY - drag.y}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    clampPosition();
  });
  on($('.head'), 'pointerup', () => { drag = null; });
  on($('.head'), 'pointercancel', () => { drag = null; });
  updateControls();
  if (hostedConfig) start();
}

mountLumeHub();
