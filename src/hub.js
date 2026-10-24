function mountLumeHub() {
  const globalName = '__LUME_GROQ_HUB__';
  const version = '3.6.0';
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
      :host{color-scheme:dark;--ink:#f0f5eb;--muted:#a4b29e;--lime:#d7f887;--line:#e0f5cf17;--ease:cubic-bezier(.22,1,.36,1)}
      *,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}button,input{font:inherit}button{cursor:pointer;-webkit-tap-highlight-color:transparent}button:disabled{cursor:default}svg{display:block;flex:none}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--lime);outline-offset:3px}
      .panel{position:relative;isolation:isolate;font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);background:linear-gradient(145deg,#1c271f,#101712 72%);border:1px solid #e4f4d325;border-radius:22px;box-shadow:0 22px 64px #07100959,0 4px 16px #07100933,inset 0 1px #f0ffe514;overflow:hidden;max-height:calc(100dvh - 24px);display:flex;flex-direction:column;animation:panel-in .32s var(--ease) both}
      .panel::before{content:'';position:absolute;z-index:-1;inset:0;background:radial-gradient(ellipse at 5% 0,#c8ed7810,transparent 60%);pointer-events:none}
      .head{position:relative;display:flex;align-items:center;gap:7px;padding:15px 14px 14px;touch-action:none;cursor:grab;user-select:none}.head:active{cursor:grabbing}.head::after{content:'';position:absolute;bottom:0;left:14px;right:14px;height:1px;background:linear-gradient(90deg,transparent,#d7efc51f 20%,#d7efc51f 80%,transparent)}
      .logo{width:31px;height:31px;display:grid;place-items:center;flex:none;color:#17230f;background:var(--lime);border:1px solid #e5ffae;border-radius:11px;box-shadow:0 3px 13px #b0e76114,inset 0 1px #fff8}.logo svg{width:19px;height:19px}
      .brand{flex:1;min-width:0;display:flex;align-items:center;gap:7px;font-size:21px;font-weight:750;letter-spacing:-1.05px;line-height:1}.brand span{font-size:7px;line-height:16px;letter-spacing:1.1px;font-weight:650;color:#c4d4b8;border:1px solid #d5e9bf26;border-radius:5px;padding:0 4px}
      .icon{width:26px;height:28px;flex:none;display:grid;place-items:center;background:transparent;border:1px solid transparent;border-radius:8px;color:#b0bda6;padding:0;transition:background .18s,border-color .18s,color .18s,transform .18s var(--ease)}.icon:hover{background:#d7f1c910;border-color:#d7efc51a;color:#eff8e8;transform:translateY(-1px)}.icon:active{transform:scale(.9)}.icon[aria-expanded=true]{background:#cdec8120;border-color:#d7f88733;color:var(--lime)}.close:hover{color:#ffc0ac;background:#ff957315;border-color:#ff957329}
      .body{padding:12px 14px 13px;overflow:auto;min-height:0;scrollbar-width:thin;scrollbar-color:#6a8054 transparent;overscroll-behavior:contain}.main,.settings{animation:view-in .24s var(--ease) both}
      .status{display:flex;align-items:center;gap:11px;margin:0 0 12px;padding:11px 10px;min-height:64px;border:1px solid var(--line);border-radius:13px;background:#080f0a33;transition:border-color .24s,background .24s}.status-emblem{position:relative;width:32px;height:32px;display:grid;place-items:center;flex:none;color:#96ad80;background:#b9dc8910;border:1px solid #c9e5a91b;border-radius:10px;transition:color .25s,background .25s,border-color .25s}.status-emblem svg{width:16px;height:16px}.status-copy{min-width:0;flex:1}.status-caption{display:block;color:#8da27e;font-size:7px;font-weight:650;letter-spacing:1.1px;line-height:1.4;margin:0 0 4px}.status-text{display:block;color:#d9e5d0;font-size:10px;font-weight:500;line-height:1.5;overflow-wrap:anywhere}.dot{width:5px;height:5px;border-radius:50%;background:#6e8460;flex:none}.status>.dot{margin-left:auto;align-self:flex-start;margin-top:4px}.status[data-active=true]{border-color:#c2e98a29;background:#0b160c55}.status[data-active=true] .status-emblem{color:var(--lime);border-color:#d7f8873d;background:#b9dc8915}.status[data-active=true] .status-emblem::before{content:'';position:absolute;inset:-3px;border-radius:12px;border:1px solid transparent;border-top-color:#d7f88799;border-right-color:#d7f88726;animation:orbit 1.5s linear infinite}.status[data-active=true]>.dot{background:var(--lime);box-shadow:0 0 9px #d7f88777;animation:breathe 1.8s ease-in-out infinite}.status-complete{display:none}.panel[data-state=complete] .status-idle{display:none}.panel[data-state=complete] .status-complete{display:block}.panel[data-state=complete] .status-emblem{color:var(--lime);background:#c8ed781c;border-color:#d7f88740}.panel[data-state=complete] .status-complete path{stroke-dasharray:24;stroke-dashoffset:0;animation:draw-check .42s var(--ease) both}.panel[data-state=complete] .status>.dot{background:var(--lime)}
      .primary{position:relative;isolation:isolate;display:flex;justify-content:center;align-items:center;gap:9px;width:100%;border:1px solid #e4ffae80;border-radius:12px;min-height:42px;padding:11px 12px;background:var(--lime);color:#1c2c0e;font-size:11px;font-weight:700;box-shadow:0 4px 14px #050e051a,inset 0 1px #f4ffe280;overflow:hidden;transition:background .2s,border-color .2s,box-shadow .2s,transform .18s var(--ease)}.primary:hover:not(:disabled){background:#e1ff9b;box-shadow:0 5px 20px #b6e66e29,inset 0 1px #fff9;transform:translateY(-1px)}.primary:active:not(:disabled){transform:translateY(0) scale(.98)}.toggle{justify-content:flex-start}.toggle::after{content:'';position:absolute;z-index:-1;inset:-50%;background:linear-gradient(110deg,transparent 40%,#fff5 50%,transparent 60%);transform:translateX(-100%);transition:transform .65s var(--ease);pointer-events:none}.toggle:hover:not(:disabled)::after{transform:translateX(100%)}.toggle-label{flex:1;text-align:left}.button-symbol{display:grid;place-items:center;flex:none}.button-symbol svg{width:13px;height:13px}.button-pause,.button-done{display:none}.button-arrow{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:#20340c12;transition:transform .2s var(--ease)}.button-arrow svg{width:12px;height:12px}.toggle:hover:not(:disabled) .button-arrow{transform:translateX(2px)}.primary[data-active=true]{background:#202f21;border-color:#bedb9233;color:#d9edbf;box-shadow:inset 0 1px #cdec8110}.primary[data-active=true]:hover{background:#293b27;color:#edf8df}.toggle[data-active=true] .button-start{display:none}.toggle[data-active=true] .button-pause{display:block}.toggle[data-active=true] .button-arrow{opacity:0}.toggle:disabled{background:#1f3020;border-color:#b4d58a33;color:#cee6b0;box-shadow:none;opacity:1}.panel[data-state=complete] .button-start,.panel[data-state=complete] .button-arrow{display:none}.panel[data-state=complete] .button-done{display:block}.primary:disabled:not(.toggle){opacity:.5}
      .foot{display:flex;align-items:center;gap:7px;margin-top:12px;color:#8b9f7f;font-size:8px;line-height:1}.shortcut{flex:1;display:flex;align-items:center;gap:4px}.shortcut kbd{font:8px/1 system-ui,sans-serif;background:#d2e8bb08;border:1px solid #d2e8bb1a;border-radius:4px;padding:3px 4px;color:#a8b99a}.shortcut-separator{color:#617954;font-size:8px}.undo{display:flex;align-items:center;gap:4px;border:0;background:none;padding:2px 0;color:#aec398;font-size:9px;transition:color .16s,opacity .16s}.undo svg{width:10px;height:10px}.undo:hover:not(:disabled){color:var(--lime)}.undo:disabled{opacity:.35}
      .settings{padding-top:1px}.settings-heading{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 13px;color:#ecf5e4;font-size:12px;font-weight:650}.settings-heading small{color:#8a9f7b;font-size:8px;font-weight:400}.field{margin-bottom:12px}.form-label{display:block;font-size:9px;font-weight:550;color:#b4c6a5;margin-bottom:6px}.input{width:100%;border:1px solid #bddb9b26;border-radius:9px;padding:9px 10px;font-size:10px;background:#070f0a55;color:#e5efdc;transition:border-color .18s,background .18s;min-height:35px}.input::placeholder{color:#6f8461}.input:hover{border-color:#b9dc8944}.input:focus{background:#0c180e;border-color:#d7f88780}.help{font-size:9px;color:#93a686;line-height:1.7;margin:6px 0 12px}details{font-size:9px;color:#a3ba91;margin:13px 0}summary{cursor:pointer;margin-bottom:10px;transition:color .16s}summary:hover{color:var(--lime)}details .input{font:9px ui-monospace,Consolas,monospace}
      .mini{display:flex;gap:9px;align-items:center;margin-left:auto;background:#17221b;border:1px solid #d5efb533;border-radius:18px;padding:10px 13px;box-shadow:0 8px 30px #06100844,inset 0 1px #edffdf0a;color:#e9f4df;font:650 13px system-ui,sans-serif;letter-spacing:-.4px;animation:mini-in .28s var(--ease) both;transition:border-color .2s,background .2s,transform .2s var(--ease)}.mini:hover{border-color:#d7f88777;background:#20301f;transform:translateY(-2px)}.mini svg{width:18px;height:18px;color:var(--lime)}.mini .dot{width:4px;height:4px;background:var(--lime);margin-left:5px}.mini[data-state=idle] .dot{background:#829a6e}.mini[data-state=working] .dot{animation:breathe 1.8s ease-in-out infinite}
      .toasts{position:fixed;right:14px;top:16px;width:min(292px,calc(100vw - 28px));display:grid;gap:8px;pointer-events:none;font:11px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
      .task-banner{position:fixed;left:50%;top:16px;transform:translateX(-50%);width:max-content;max-width:min(580px,calc(100vw - 28px));pointer-events:none;font:12px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}.task-surface{display:flex;align-items:center;gap:12px;padding:13px 16px;border:1px solid #d7f88742;border-radius:17px;background:#152119;box-shadow:0 12px 42px #0610083d,inset 0 1px #e6ffd814;color:#edf6e4;animation:banner-in .35s var(--ease) both}.task-icon{position:relative;display:grid;place-items:center;width:32px;height:32px;flex:none;background:#d7f88714;color:var(--lime);border:1px solid #d7f8872e;border-radius:10px}.task-icon svg{width:17px;height:17px}.task-copy{min-width:0;text-align:left}.task-caption{display:block;font-size:8px;font-weight:600;letter-spacing:1.1px;text-transform:uppercase;color:#b7d39e;margin-bottom:3px}.task-name{display:block;font-size:12px;font-weight:550;line-height:1.5;overflow-wrap:anywhere}
      .toast{position:relative;display:flex;gap:10px;align-items:center;background:#19241c;border:1px solid #d2e9bb26;border-radius:14px;box-shadow:0 8px 26px #06100829,inset 0 1px #e5ffd80a;padding:12px 13px;color:#c7d7ba;overflow:hidden;overflow-wrap:anywhere;animation:toast-in .28s var(--ease) both,toast-out .18s ease-in 6.32s forwards}.toast-icon{width:27px;height:27px;border:1px solid #c5e6a51f;border-radius:9px;background:#b7d98d0d;display:grid;place-items:center;color:#b8d699;flex:none}.toast-icon svg{width:14px;height:14px}.toast-text{min-width:0;font-size:10px;font-weight:500;line-height:1.6}.toast-progress{position:absolute;left:0;bottom:0;width:100%;height:2px;background:#cae6a34d;transform-origin:left;animation:toast-timer 6.5s linear forwards}.toast[data-tone=success]{border-color:#c9ef8b42;color:#e0f3c7}.toast[data-tone=success] .toast-icon{background:#d7f88717;border-color:#d7f88733;color:var(--lime)}.toast[data-tone=success] .toast-progress{background:#d7f88780}.toast[data-tone=error]{border-color:#f3a48642;color:#ffd0bd;background:#291e18}.toast[data-tone=error] .toast-icon{background:#f3a48614;border-color:#f3a48633;color:#ffb99b}.toast[data-tone=error] .toast-progress{background:#f3a48680}
      @keyframes panel-in{from{opacity:0;transform:translateY(12px) scale(.965)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes mini-in{from{opacity:0;transform:translateY(8px) scale(.92)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes view-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}@keyframes banner-in{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes toast-in{from{opacity:0;transform:translateX(15px) scale(.97)}to{opacity:1;transform:translateX(0) scale(1)}}@keyframes toast-out{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(10px)}}@keyframes toast-timer{to{transform:scaleX(0)}}@keyframes orbit{to{transform:rotate(360deg)}}@keyframes breathe{50%{opacity:.45;box-shadow:0 0 3px #d7f88733}}@keyframes draw-check{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}
      @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    </style>
    <section class="panel" role="dialog" aria-label="Lume tarefas" tabindex="-1">
      <header class="head"><div class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M4.9 19.1 19.1 4.9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/></svg></div><div class="brand">lume<span>GROQ</span></div>
        <button class="icon settings-toggle" aria-label="Ajustes" aria-expanded="false" aria-controls="lume-settings" title="Ajustes"><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8 2h4l.6 2.1 1.8 1 2.1-.5 2 3.4L17 9.6v2l1.5 1.5-2 3.4-2.1-.5-1.8 1L12 19H8l-.6-2.1-1.8-1-2.1.5-2-3.4L3 11.5v-2L1.5 8l2-3.4 2.1.5 1.8-1L8 2Z" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="10.5" r="2.5" stroke="currentColor" stroke-width="1.2"/></svg></button>
        <button class="icon minimize" aria-label="Minimizar" aria-keyshortcuts="Alt+Shift+G" title="Minimizar"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button><button class="icon close" aria-label="Fechar" title="Fechar"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
      </header>
      <div class="body"><div class="main"><div class="status" data-active="false"><span class="status-emblem" aria-hidden="true"><svg class="status-idle" viewBox="0 0 24 24" fill="none"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg><svg class="status-complete" viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="status-copy"><span class="status-caption">Uma tarefa por vez</span><span class="status-text">Pronto para começar</span></span><span class="dot" aria-hidden="true"></span></div><button class="primary toggle"><span class="button-symbol" aria-hidden="true"><svg class="button-start" viewBox="0 0 16 16" fill="none"><path d="m5 3 7 5-7 5V3Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/></svg><svg class="button-pause" viewBox="0 0 16 16" fill="none"><path d="M5 4v8M11 4v8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg><svg class="button-done" viewBox="0 0 16 16" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="toggle-label">Responder tarefa</span><span class="button-arrow" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="M4 12 12 4M4 4h8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button><div class="foot"><span class="shortcut" aria-hidden="true"><kbd>Alt</kbd><span class="shortcut-separator">+</span><kbd>Shift</kbd><span class="shortcut-separator">+</span><kbd>G</kbd></span><button class="undo" disabled><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3 2 6l3 3M2.5 6H9a4 4 0 0 1 0 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Desfazer</button></div></div>
        <div class="settings" id="lume-settings" hidden><div class="settings-heading">Do seu jeito<small>Ajustes do hub</small></div>
          <div class="field"><label class="form-label" for="lume-api-key">Chave da API Groq</label><input class="input api-key" id="lume-api-key" type="password" autocomplete="off" spellcheck="false" placeholder="gsk_…"></div>
          <div class="field"><label class="form-label" for="lume-model">Modelo</label><input class="input model" id="lume-model" value="openai/gpt-oss-120b" list="lume-models" autocomplete="off" spellcheck="false"><datalist id="lume-models"><option value="openai/gpt-oss-120b"></option><option value="openai/gpt-oss-20b"></option></datalist></div>
          <details><summary>Leitura personalizada</summary><div class="field"><label class="form-label" for="lume-container">Bloco de cada questão</label><input class="input container-selector" id="lume-container" placeholder="Ex.: .question" spellcheck="false"></div><div class="field"><label class="form-label" for="lume-prompt">Enunciado</label><input class="input prompt-selector" id="lume-prompt" placeholder="Ex.: .question-text" spellcheck="false"></div><div class="field"><label class="form-label" for="lume-options">Alternativas</label><input class="input option-selector" id="lume-options" placeholder="Ex.: input[type=radio]" spellcheck="false"></div></details>
          <p class="help">Chave apenas na memória. Ao iniciar, as questões são enviadas à Groq e as sugestões são marcadas automaticamente. A IA pode errar.</p><button class="primary save-settings">Salvar e iniciar</button>
        </div>
      </div>
    </section>
    <button class="mini" hidden aria-label="Abrir painel Lume"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>lume<span class="dot" aria-hidden="true"></span></button>
    <div class="task-banner" role="status" aria-live="polite" hidden><div class="task-surface"><span class="task-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span><span class="task-copy"><span class="task-caption">Respondendo tarefa</span><span class="task-name"></span></span></div></div>
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
    icon.innerHTML = tone === 'success' ? '<svg viewBox="0 0 20 20" fill="none"><path d="m4 10 4 4 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : tone === 'error' ? '<svg viewBox="0 0 20 20" fill="none"><path d="M10 5v6m0 3h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' : '<svg viewBox="0 0 20 20" fill="none"><path d="m10 2 2.2 5.8L18 10l-5.8 2.2L10 18l-2.2-5.8L2 10l5.8-2.2L10 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    const progress = document.createElement('span');
    progress.className = 'toast-progress';
    progress.setAttribute('aria-hidden', 'true');
    toast.append(icon, text, progress);
    $('.toasts').append(toast);
    function remove(element) { clearTimeout(toastTimers.get(element)); toastTimers.delete(element); element.remove(); }
    while ($('.toasts').children.length > 3) remove($('.toasts').firstElementChild);
    toastTimers.set(toast, setTimeout(() => remove(toast), 6500));
  }
  function status(message) {
    if (state.closed || $('.status-text').textContent === message) return;
    const element = $('.status-text');
    element.textContent = message;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof element.animate === 'function') {
      element.getAnimations().forEach(animation => animation.cancel());
      element.animate([{ opacity: .35, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }
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
    $('.toggle-label').textContent = state.completed ? 'Tarefa concluída' : state.active ? 'Pausar tarefa' : 'Responder tarefa';
    $('.panel').dataset.state = state.completed ? 'complete' : state.active ? 'working' : 'idle';
    $('.mini').dataset.state = $('.panel').dataset.state;
    $('.status-caption').textContent = state.completed ? 'Tudo preenchido' : state.active ? 'Tarefa em andamento' : 'Uma tarefa por vez';
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
          if (question.images?.length) {
            status('Lendo imagens…');
            notify('Imagens detectadas · lendo conteúdo…');
          }
          const preparedQuestion = typeof adapter.prepareQuestion === 'function'
            ? await adapter.prepareQuestion(question, { signal: controller.signal }) : question;
          syncTask();
          if (state.closed || !state.active || state.task !== task || run !== state.run || controller.signal.aborted) break;
          if (location.href !== pageUrl || !adapter.isCurrent(question)) {
            if (location.href === pageUrl) state.handled.set(key, { status: 'skipped' });
            notify('A questão mudou. Lendo a página novamente…');
            state.dirty = true;
            break;
          }
          if (preparedQuestion.images?.length) {
            status('Analisando imagens…');
            notify('Analisando imagens…');
          }
          const answer = await client.solve({ apiKey: state.key, model: state.model, question: preparedQuestion, signal: controller.signal });
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
    else $('.mini').focus({ preventScroll: true });
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
    attributeFilter: ['aria-checked', 'aria-label', 'aria-labelledby', 'aria-hidden', 'aria-disabled', 'aria-expanded', 'aria-controls', 'role', 'hidden', 'style', 'class', 'disabled', 'name', 'type', 'for', 'id', 'placeholder', 'contenteditable', 'maxlength', 'minlength', 'src', 'srcset', 'sizes', 'alt', 'data-src', 'data-original'],
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
