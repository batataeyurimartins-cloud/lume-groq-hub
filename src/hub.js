function mountLumeHub() {
  const globalName = '__LUME_GROQ_HUB__';
  const version = '3.4.0';
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
      .task-banner{position:fixed;left:50%;top:16px;transform:translateX(-50%);width:max-content;max-width:min(580px,calc(100vw - 28px));padding:12px 18px;border:1px solid #c9df9d;border-radius:14px;background:#fcfdf8;box-shadow:0 8px 30px #1d2c1a26;pointer-events:none;font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#425932;text-align:center;overflow-wrap:anywhere}.task-caption{display:block;font-size:9px;letter-spacing:.7px;text-transform:uppercase;color:#829366;margin-bottom:3px}.task-name{font-weight:650}
      .toast{display:flex;gap:9px;align-items:center;background:#fcfdf8;border:1px solid #dce4ce;border-radius:12px;box-shadow:0 8px 30px #1d2c1a1a;padding:11px 13px;color:#61724d;overflow-wrap:anywhere;animation:appear .18s ease-out}.toast-icon{width:21px;height:21px;border-radius:7px;background:#eef4e0;display:grid;place-items:center;color:#8aa54e;flex:none}.toast[data-tone=success]{border-color:#c9df9d}.toast[data-tone=success] .toast-icon{background:#dff1b7;color:#5e7d34}.toast[data-tone=error]{border-color:#e8c9b8;color:#a15d3e}.toast[data-tone=error] .toast-icon{background:#f8e9df;color:#b2764f}
      @keyframes appear{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.toast{animation:none}}
    </style>
    <section class="panel" role="dialog" aria-label="Lume tarefas" tabindex="-1">
      <header class="head"><div class="logo" aria-hidden="true">✳</div><div class="brand">lume<span>GROQ</span></div>
        <button class="icon settings-toggle" aria-label="Ajustes" aria-expanded="false" aria-controls="lume-settings" title="Ajustes"><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8 2h4l.6 2.1 1.8 1 2.1-.5 2 3.4L17 9.6v2l1.5 1.5-2 3.4-2.1-.5-1.8 1L12 19H8l-.6-2.1-1.8-1-2.1.5-2-3.4L3 11.5v-2L1.5 8l2-3.4 2.1.5 1.8-1L8 2Z" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="10.5" r="2.5" stroke="currentColor" stroke-width="1.2"/></svg></button>
        <button class="icon minimize" aria-label="Minimizar" title="Minimizar">−</button><button class="icon close" aria-label="Fechar" title="Fechar">×</button>
      </header>
      <div class="body"><div class="main"><div class="status" data-active="false"><span class="dot"></span><span class="status-text">Pronto para começar</span></div><button class="primary toggle">Responder tarefa</button><div class="foot"><span>Alt + Shift + G</span><button class="undo" disabled>Desfazer</button></div></div>
        <div class="settings" id="lume-settings" hidden>
          <div class="field"><label class="form-label" for="lume-api-key">Chave da API Groq</label><input class="input api-key" id="lume-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="gsk_…"></div>
          <div class="field"><label class="form-label" for="lume-model">Modelo</label><input class="input model" id="lume-model" value="openai/gpt-oss-120b" list="lume-models" autocomplete="off" spellcheck="false"><datalist id="lume-models"><option value="openai/gpt-oss-120b"></option><option value="openai/gpt-oss-20b"></option></datalist></div>
          <details><summary>Leitura personalizada</summary><div class="field"><label class="form-label" for="lume-container">Bloco de cada questão</label><input class="input container-selector" id="lume-container" placeholder="Ex.: .question" spellcheck="false"></div><div class="field"><label class="form-label" for="lume-prompt">Enunciado</label><input class="input prompt-selector" id="lume-prompt" placeholder="Ex.: .question-text" spellcheck="false"></div><div class="field"><label class="form-label" for="lume-options">Alternativas</label><input class="input option-selector" id="lume-options" placeholder="Ex.: input[type=radio]" spellcheck="false"></div></details>
          <p class="help">Chave apenas na memória. Ao iniciar, as questões são enviadas à Groq e as sugestões são marcadas automaticamente. A IA pode errar.</p><button class="primary save-settings">Salvar e iniciar</button>
        </div>
      </div>
    </section>
    <button class="mini" hidden aria-label="Abrir painel Lume"><span class="dot"></span>lume / Groq</button>
    <div class="task-banner" role="status" aria-live="polite" hidden><span class="task-caption">Respondendo tarefa</span><span class="task-name"></span></div>
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
    dirty: false, timer: null, task: null, completed: false, answered: new Set(), readySignature: '', readySince: 0, bannerTimer: null,
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
  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
  function taskLocation() {
    const match = location.pathname.match(/\/(?:mobile\/)?atividade\/(?:preview\/)?([^/]+)/i);
    return match ? { key: `${location.origin}/atividade/${match[1]}`, fallback: `Tarefa ${match[1]}` }
      : { key: `${location.origin}${location.pathname.replace(/\/+$/, '') || '/'}`, fallback: 'Atividade atual' };
  }
  function pageVisible(element) {
    if (!element || element === host || host.contains(element) || element.closest('[hidden]')) return false;
    return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }
  function readTask() {
    const route = taskLocation();
    const elements = [...document.querySelectorAll('[data-task-title],h1,h2,h3,h4,h5,h6,.MuiTypography-root,p,span,legend,[data-question-total]')];
    const titles = elements.map(element => ({ element, text: cleanText(element.textContent) }))
      .filter(item => item.text.length > 0 && item.text.length <= 700 &&
        (item.element.hasAttribute('data-task-title') || /^Tarefa(?:\s+\d+)?\s*[:–-]\s*\S/i.test(item.text) ||
          (item.element.matches('.MuiCard-root > .MuiBox-root > .MuiTypography-root:first-child') && getComputedStyle(item.element).color === 'rgb(255, 255, 255)')) && pageVisible(item.element));
    const titlePriority = item => item.element.hasAttribute('data-task-title') ? 0 : /^Tarefa(?:\s+\d+)?\s*[:–-]/i.test(item.text) ? 1 : 2;
    titles.sort((a, b) => titlePriority(a) - titlePriority(b) || a.text.length - b.text.length);
    let total = 0, totalElement = null, totalMarker = '';
    for (const element of elements) {
      const explicit = Number(element.getAttribute('data-question-total'));
      const text = cleanText(element.textContent);
      const match = text.length <= 100 ? text.match(/\bQuest(?:ão|ao)\s*\d+\s*(?:de|\/)\s*(\d+)\b/i) : null;
      const candidate = explicit || Number(match?.[1]);
      if (Number.isInteger(candidate) && candidate > total && candidate <= 300 && pageVisible(element)) {
        total = candidate; totalElement = element; totalMarker = explicit ? element.getAttribute('data-question-total') : text;
      }
    }
    return { ...route, name: titles[0]?.text.slice(0, 500) || '', titleElement: titles[0]?.element || null, total, totalElement, totalMarker };
  }
  function layoutNotifications() {
    $('.toasts').style.top = $('.task-banner').hidden ? '16px' : `${Math.max(16, $('.task-banner').getBoundingClientRect().bottom + 8)}px`;
  }
  function hideTaskBanner() {
    clearTimeout(state.bannerTimer);
    state.bannerTimer = null;
    $('.task-banner').hidden = true;
    layoutNotifications();
  }
  function showTaskBanner() {
    $('.task-name').textContent = state.task.name || state.task.fallback;
    $('.task-banner').hidden = false;
    layoutNotifications();
    clearTimeout(state.bannerTimer);
    state.bannerTimer = setTimeout(hideTaskBanner, 6500);
  }
  function syncTask() {
    if (state.closed) return false;
    const next = readTask();
    if (!state.task || state.task.key !== next.key) {
      const previous = state.task;
      state.controller?.abort();
      state.active = false;
      state.completed = false;
      state.run++;
      state.dirty = false;
      clearTimeout(state.timer);
      state.timer = null;
      state.count = 0;
      state.handled.clear();
      state.answered.clear();
      state.warnings.clear();
      state.undo = null;
      state.undoEntry = null;
      state.readySignature = '';
      state.readySince = 0;
      hideTaskBanner();
      for (const timer of toastTimers.values()) clearTimeout(timer);
      toastTimers.clear();
      $('.toasts').replaceChildren();
      // SPA navigation can update the URL before React replaces the old title.
      // Keep the route fallback until that previous heading changes or remounts.
      const stale = previous && next.titleElement === previous.titleElement && next.name === (previous.name || previous.blockedName);
      const staleTotal = previous && next.total && next.totalElement === previous.totalElement && next.totalMarker === previous.totalMarker && (stale || !next.name);
      state.task = { ...next, total: staleTotal ? 0 : next.total, blockedTotal: staleTotal ? { element: next.totalElement, marker: next.totalMarker } : null,
        name: stale ? '' : next.name, blockedTitle: stale ? next.titleElement : null, blockedName: stale ? next.name : '',
        staleQuestions: previous?.questionElements || [], questionElements: [] };
      status('Pronto para responder esta tarefa');
      updateControls();
      return true;
    }
    let freshTitle = false;
    if (next.name && (next.titleElement !== state.task.blockedTitle || next.name !== state.task.blockedName)) {
      freshTitle = next.name !== state.task.name || next.titleElement !== state.task.titleElement;
      state.task.name = next.name;
      state.task.titleElement = next.titleElement;
      state.task.blockedTitle = null;
      if (!$('.task-banner').hidden) { $('.task-name').textContent = next.name; layoutNotifications(); }
    }
    if (next.total && (!state.task.blockedTotal || freshTitle || next.totalElement !== state.task.blockedTotal.element || next.totalMarker !== state.task.blockedTotal.marker)) {
      const freshTotal = next.totalElement !== state.task.totalElement || next.totalMarker !== state.task.totalMarker;
      state.task.total = next.total;
      state.task.totalElement = next.totalElement;
      state.task.totalMarker = next.totalMarker;
      state.task.blockedTotal = null;
      if (freshTotal) { state.task.blockedTitle = null; state.task.blockedName = ''; }
    }
    if ((state.task.blockedTitle || state.task.blockedTotal) && state.task.staleQuestions.length && state.task.staleQuestions.every(element => !element?.isConnected)) {
      state.task.blockedTitle = null;
      state.task.blockedName = '';
      state.task.blockedTotal = null;
      if (next.total) state.task.total = next.total;
    }
    return false;
  }
  function questionIdentity(question) {
    const label = cleanText(question.element?.textContent).slice(0, 250);
    const match = label.match(/\bQuest(?:ão|ao)\s*(\d+)\s*(?:de|\/)\s*\d+/i);
    return match ? `number:${Number(match[1])}` : JSON.stringify([question.id, question.fingerprint]);
  }
  function finishTask() {
    pause(false);
    state.completed = true;
    status(`Tarefa concluída · ${state.count} ${state.count === 1 ? 'resposta' : 'respostas'}`);
    notify(`Tarefa concluída · Respostas: ${state.count}`, 'success');
    updateControls();
  }
  function finishOrWait(result) {
    const entries = result.questions.map(question => state.handled.get(keyFor(question)));
    if (result.warnings?.length || entries.some(entry => entry?.status !== 'done')) {
      pause(false);
      status('Há questões pendentes · você pode tentar novamente');
      return;
    }
    if (state.task.blockedTotal) { status('Aguardando o carregamento da tarefa…'); return; }
    if (state.task.total) {
      if (state.count >= state.task.total) finishTask();
      else status(`Aguardando próximas questões · ${state.count}/${state.task.total}`);
      return;
    }
    const signature = JSON.stringify(result.questions.map(keyFor).sort());
    if (state.readySignature !== signature) { state.readySignature = signature; state.readySince = Date.now(); }
    if (Date.now() - state.readySince >= 650) finishTask();
    else { status('Conferindo conclusão da tarefa…'); schedule(700); }
  }
  function updateControls() {
    if (state.closed) return;
    $('.toggle').textContent = state.completed ? 'Tarefa concluída' : state.active ? 'Pausar tarefa' : 'Responder tarefa';
    $('.toggle').dataset.active = String(state.active);
    $('.toggle').disabled = state.completed || (!state.active && state.processing);
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
  const keyFor = question => JSON.stringify([state.task?.key || taskLocation().key, questionIdentity(question), question.fingerprint]);
  function pause(announce = true) {
    state.active = false;
    state.run++;
    state.dirty = false;
    clearTimeout(state.timer);
    state.timer = null;
    state.controller?.abort();
    status('Tarefa pausada');
    updateControls();
    if (announce) notify('Tarefa pausada.');
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
    syncTask();
    if (state.closed || state.active || state.processing || state.completed) return;
    if (!state.key && !hostedConfig?.public) {
      setSettings(true);
      $('.api-key').focus();
      notify('Adicione sua chave da Groq para iniciar.', 'error');
      return;
    }
    for (const [key, entry] of state.handled) if (entry.status === 'error' || entry.status === 'skipped') state.handled.delete(key);
    state.active = true;
    state.run++;
    state.warnings.clear();
    state.readySignature = '';
    state.readySince = 0;
    setSettings(false);
    status('Lendo tarefa…');
    showTaskBanner();
    notify('Lendo tarefa…');
    updateControls();
    schedule(0);
  }
  async function processPage() {
    syncTask();
    if (!state.active || state.closed || state.processing) return;
    state.processing = true;
    state.dirty = false;
    const run = state.run;
    const task = state.task;
    const taskKey = state.task.key;
    updateControls();
    try {
      while (state.active && !state.closed && run === state.run) {
        if (syncTask() || run !== state.run) break;
        if (state.task.blockedTitle || state.task.blockedTotal) { status('Aguardando o carregamento da tarefa…'); break; }
        const controller = new AbortController();
        state.controller = controller;
        const readingUrl = location.href;
        if (typeof adapter.prepare === 'function') await adapter.prepare(state.selectors, { signal: controller.signal });
        syncTask();
        if (state.closed || !state.active || run !== state.run || controller.signal.aborted) break;
        if (location.href !== readingUrl) { state.dirty = true; continue; }
        const result = adapter.scan(state.selectors);
        state.task.questionElements = result.questions.map(question => question.element).filter(Boolean);
        for (const warning of result.warnings || []) if (!state.warnings.has(warning)) {
          state.warnings.add(warning);
          notify(warning);
        }
        const question = result.questions.find(item => !state.handled.has(keyFor(item)));
        if (!question) {
          if (result.questions.length === 0) {
            status(result.warnings?.length ? 'Leitura precisa de ajuste' : 'Nenhuma questão reconhecida');
            const warning = 'Não consegui reconhecer os campos de resposta desta página.';
            if (!state.warnings.has(warning)) {
              state.warnings.add(warning);
              notify(warning);
            }
          } else finishOrWait(result);
          break;
        }
        state.readySignature = '';
        state.readySince = 0;
        const key = keyFor(question);
        const pageUrl = location.href;
        if (!adapter.isCurrent(question)) { state.dirty = true; break; }
        const kind = question.kind || 'choice';
        notify(kind === 'text' ? 'Questão de texto detectada' : kind === 'blanks' ? 'Lacunas detectadas' : kind === 'order' ? 'Blocos de palavras detectados' : 'Questão detectada');
        status('Buscando resposta…');
        notify('Buscando resposta…');
        let querying = true;
        try {
          const answer = await client.solve({ apiKey: state.key, model: state.model, question, signal: controller.signal });
          querying = false;
          syncTask();
          if (state.closed || !state.active || run !== state.run || controller.signal.aborted) break;
          if (location.href !== pageUrl || !adapter.isCurrent(question)) {
            // A manual edit can invalidate a pending field answer without
            // changing its prompt. Do not immediately query and overwrite it.
            if (location.href === pageUrl) state.handled.set(key, { status: 'skipped' });
            notify('A questão mudou. Lendo a página novamente…');
            state.dirty = true;
            break;
          }
          const payload = kind === 'text' ? answer.text : kind === 'blanks' ? answer.selections : kind === 'order' ? answer.order : answer.indices;
          if (kind === 'text' ? typeof payload !== 'string' || !payload.trim() : !Array.isArray(payload) || !payload.length) {
            state.handled.set(key, { status: 'skipped' });
            notify('Sem resposta suficiente. Questão ignorada.');
            if (kind === 'text' && typeof answer.explanation === 'string' && answer.explanation.trim()) {
              const reason = answer.explanation.trim();
              notify(reason.length > 240 ? `${reason.slice(0, 237)}…` : reason);
            }
            continue;
          }
          notify(answer.confidence === 'low' ? 'Resposta detectada · confiança baixa' : 'Resposta detectada');
          const filling = kind === 'order' ? 'Ordenando palavras…' : kind === 'text' || kind === 'blanks' ? 'Preenchendo respostas…' : 'Marcando respostas…';
          status(filling);
          notify(filling);
          const outcome = await adapter.apply(question, payload, { signal: controller.signal });
          syncTask();
          if (state.closed || state.task !== task || state.task.key !== taskKey || taskLocation().key !== taskKey) break;
          const identity = questionIdentity(question);
          const entry = { status: outcome.selected ? 'done' : 'error', counted: Boolean(outcome.selected) && !state.answered.has(identity), key, identity };
          if (typeof outcome.undo === 'function') { state.undo = outcome.undo; state.undoEntry = entry; }
          if (outcome.selected) {
            state.handled.set(key, entry);
            state.answered.add(identity);
            state.count = state.answered.size;
            notify(`Respostas: ${state.count}`, 'success');
          } else if (controller.signal.aborted || !state.active || run !== state.run) {
            notify('Marcação interrompida. Você pode desfazer a última ação.');
            break;
          } else {
            state.handled.set(key, entry);
            notify(outcome.message || 'O site não confirmou a marcação.', 'error');
          }
        } catch (error) {
          syncTask();
          if (state.task !== task) break;
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
      syncTask();
      if (!state.closed && state.task === task && state.active && error.code !== 'ABORTED') {
        pause(false);
        notify(error.message || 'Não foi possível ler a atividade. Confira os ajustes.', 'error');
      }
    } finally {
      state.processing = false;
      state.controller = null;
      updateControls();
      if (state.active && state.dirty && !state.closed) schedule();
    }
  }
  async function undoLast() {
    syncTask();
    if (state.closed || state.processing || !state.undo) return;
    pause(false);
    state.processing = true;
    const controller = new AbortController();
    const task = state.task;
    const taskKey = state.task.key;
    state.controller = controller;
    updateControls();
    try {
      const result = await state.undo({ signal: controller.signal });
      syncTask();
      if (state.closed || state.task !== task || state.task.key !== taskKey || taskLocation().key !== taskKey) return;
      if (result.restored) {
        if (state.undoEntry?.counted) state.answered.delete(state.undoEntry.identity);
        state.count = state.answered.size;
        if (state.undoEntry?.key) state.handled.delete(state.undoEntry.key);
        state.undo = null;
        state.undoEntry = null;
        state.completed = false;
        state.readySignature = '';
        state.readySince = 0;
        notify('Última resposta desfeita.', 'success');
        notify(`Respostas: ${state.count}`, 'success');
      } else notify(result.message || 'Não foi possível desfazer a última resposta.', 'error');
    } catch (error) {
      syncTask();
      if (state.task === task && !state.closed) notify(error.message || 'Não foi possível desfazer.', 'error');
    }
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
    if (records.some(record => record.target !== host && !host.contains(record.target))) {
      syncTask();
      schedule();
    }
  });
  const routeTimer = setInterval(() => { if (taskLocation().key !== state.task?.key) syncTask(); }, 250);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['aria-checked', 'aria-label', 'aria-labelledby', 'aria-hidden', 'aria-disabled', 'aria-expanded', 'aria-controls', 'role', 'hidden', 'style', 'class', 'disabled', 'name', 'type', 'for', 'id', 'placeholder', 'contenteditable', 'maxlength', 'minlength'],
  });
  function close() {
    if (state.closed) return;
    state.closed = true;
    state.active = false;
    state.run++;
    state.controller?.abort();
    adapter.destroy?.();
    events.abort();
    observer.disconnect();
    clearTimeout(state.timer);
    clearInterval(routeTimer);
    hideTaskBanner();
    for (const timer of toastTimers.values()) clearTimeout(timer);
    toastTimers.clear();
    state.key = '';
    $('.api-key').value = '';
    state.handled.clear();
    state.answered.clear();
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
  on(window, 'popstate', () => { syncTask(); schedule(); });
  on(window, 'hashchange', () => { syncTask(); schedule(); });
  on(window, 'resize', () => { clampPosition(); layoutNotifications(); });
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
  syncTask();
  updateControls();
}

mountLumeHub();
