/** Conservative DOM adapter: only recognized choice controls are ever clicked. */
export function createPageAdapter({ document: doc = document, exclude = null } = {}) {
  const view = doc.defaultView;
  const ids = new WeakMap();
  const metadata = new WeakMap();
  let serial = 0;
  const CONTROL = 'input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]';
  const MUI_CONTROL = '.MuiRadio-root,.MuiCheckbox-root,.MuiFormControlLabel-root';
  const CONTAINER = '.que,.question,.question-container,.question-item,.quiz-question,.pergunta,[data-question],[data-question-id],[data-testid="question"],[data-testid="question-container"],fieldset,[role="radiogroup"],[role="group"]';
  const uid = element => {
    if (!ids.has(element)) ids.set(element, ++serial);
    return ids.get(element);
  };
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const isExcluded = element => Boolean(exclude && (element === exclude || exclude.contains(element)));
  function visible(element) {
    if (!element || !element.isConnected || isExcluded(element)) return false;
    for (let item = element; item && item.nodeType === 1; item = item.parentElement) {
      if (item.hasAttribute('hidden') || item.getAttribute('aria-hidden') === 'true') return false;
      const style = view?.getComputedStyle(item);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) return false;
    }
    return true;
  }
  const IMAGE_LIMIT = 3;
  const IMAGE_DATA_LIMIT = 700000;
  const IMAGE_DOWNLOAD_LIMIT = 8 * 1024 * 1024;
  const imageError = message => Object.assign(new Error(message), { code: 'IMAGE' });
  function relevantImages(root) {
    return Array.from(root.querySelectorAll('img')).filter(image => {
      if (!formVisible(image, root) || image.closest('button,nav,header,footer,.MuiAvatar-root,.MuiSvgIcon-root')) return false;
      const width = Number(image.getAttribute('width')) || image.naturalWidth;
      const height = Number(image.getAttribute('height')) || image.naturalHeight;
      return !((width > 0 && width <= 2) && (height > 0 && height <= 2) && !normalize(image.alt));
    });
  }
  function imageSource(image) {
    return image.currentSrc || image.src || image.getAttribute('data-src') || image.getAttribute('data-original') || '';
  }
  function visualContext(root, controls = [], omitted = []) {
    const wrappers = controls.map(optionWrapper);
    const images = relevantImages(root).filter(image => !omitted.some(element => element.contains(image)));
    let stem = 0;
    const optionCounts = new Map();
    const descriptors = images.map(element => {
      const option = wrappers.findIndex(wrapper => wrapper === element || wrapper.contains(element));
      const count = option < 0 ? ++stem : (optionCounts.get(option) || 0) + 1;
      if (option >= 0) optionCounts.set(option, count);
      const alt = normalize(element.alt);
      const label = `${option < 0 ? 'Imagem do enunciado' : `Alternativa ${option + 1} · imagem`} ${count}${alt ? `: ${alt}` : ''}`.slice(0, 300);
      return { element, url: imageSource(element), label, alt, src: element.getAttribute('src') || '',
        srcset: element.getAttribute('srcset') || '', sizes: element.getAttribute('sizes') || '',
        lazy: [element.getAttribute('data-src') || '', element.getAttribute('data-original') || ''] };
    });
    const unsupported = Array.from(root.querySelectorAll('canvas,svg,video')).filter(element => {
      if (!formVisible(element, root) || element.closest('button,.MuiSvgIcon-root,.MuiRadio-root,.MuiCheckbox-root') ||
          omitted.some(item => item.contains(element))) return false;
      if (element.tagName.toLowerCase() !== 'svg') return true;
      const bounds = element.getBoundingClientRect();
      return Boolean(element.querySelector('image')) || bounds.width > 32 || bounds.height > 32;
    });
    let issue = unsupported.length ? 'Esta questão tem gráfico em canvas, SVG ou vídeo que ainda não pode ser lido. Nenhuma resposta foi preenchida.' : '';
    if (descriptors.some(image => /^data:image\/(?!png[;,]|jpe?g[;,]|webp[;,])/i.test(image.url) || /\.(?:gif|svg|avif|bmp)(?:[?#]|$)/i.test(image.url))) {
      issue = 'Há imagens em formato não suportado nesta questão. São aceitas imagens PNG, JPEG e WebP.';
    }
    if (descriptors.length > IMAGE_LIMIT) issue = `Esta questão tem mais de ${IMAGE_LIMIT} imagens. Não vou responder sem ler todas.`;
    return { root, controls, omitted, images: descriptors, unsupported, issue,
      signature: JSON.stringify([descriptors.map(({ url, label, alt, src, srcset, sizes, lazy }) => [url, label, alt, src, srcset, sizes, lazy]), unsupported.map(element => [element.tagName, element.getAttribute('src') || element.getAttribute('href') || ''])]) };
  }
  function attachVisuals(question, info, controls = [], omitted = []) {
    const visual = visualContext(question.element, controls, omitted);
    info.visual = visual;
    if (visual.images.length) question.images = visual.images.map(({ element, url, label }) => ({ element, url, label }));
    if (visual.issue) question.visualIssue = visual.issue;
    if (visual.images.length || visual.unsupported.length) {
      question.fingerprint = JSON.stringify([question.fingerprint, visual.signature]);
      info.fingerprint = question.fingerprint;
    }
    return visual;
  }
  function visualsCurrent(info) {
    const previous = info?.visual;
    if (!previous) return true;
    const current = visualContext(previous.root, previous.controls, previous.omitted);
    return current.signature === previous.signature && current.images.length === previous.images.length &&
      current.images.every((image, index) => image.element === previous.images[index].element) &&
      current.unsupported.length === previous.unsupported.length && current.unsupported.every((element, index) => element === previous.unsupported[index]);
  }
  const native = element => element.tagName === 'INPUT' && /^(radio|checkbox)$/i.test(element.type);
  const typeOf = element => native(element) ? element.type : element.getAttribute('role');
  function choiceControls(root) {
    return Array.from(root.querySelectorAll(CONTROL)).filter(element => native(element) ||
      !element.querySelector('input[type="radio"],input[type="checkbox"]'));
  }
  function labelsFor(element) {
    const labels = native(element) ? Array.from(element.labels || []) : [];
    const wrapping = element.closest('label');
    if (wrapping && !labels.includes(wrapping)) labels.push(wrapping);
    for (const id of (element.getAttribute('aria-labelledby') || '').split(/\s+/)) {
      const label = id && doc.getElementById(id);
      if (label && !labels.includes(label)) labels.push(label);
    }
    return labels;
  }
  function optionWrapper(element) {
    const labels = labelsFor(element);
    const readableLabel = labels.find(label => normalize(label.textContent) || relevantImages(label).length);
    if (readableLabel) return readableLabel;
    if (!native(element)) return element;
    // Sala's MUI label contains only the radio icon; the statement is in a
    // sibling div. Include their shared row, without crossing another choice.
    if (element.closest(MUI_CONTROL)) {
      let row = element.parentElement;
      for (let level = 0; row && level < 6; level++, row = row.parentElement) {
        if (row.matches('body,html,form,fieldset,[role="radiogroup"]') || choiceControls(row).length !== 1) break;
        if (normalize(row.textContent) || relevantImages(row).length) return row;
      }
    }
    if (labels.length) return labels[0];
    const candidate = element.closest('li,.option,.answer,.choice,.alternative,.alternativa,.MuiFormControlLabel-root');
    if (candidate && candidate.querySelectorAll(CONTROL).length === 1) return candidate;
    const parent = element.parentElement;
    return parent && parent.querySelectorAll(CONTROL).length === 1 ? parent : element;
  }
  function optionText(element, index = 0) {
    const explicit = normalize(element.getAttribute('aria-label'));
    if (explicit) return explicit;
    const labels = labelsFor(element).filter(label => visible(label));
    const labelText = normalize(labels.map(label => label.textContent).join(' '));
    if (labelText) return labelText;
    const wrapper = optionWrapper(element);
    if (wrapper !== element || !native(element)) {
      const text = normalize(wrapper.textContent);
      return text || (relevantImages(wrapper).length ? `[Imagem da alternativa ${index + 1}]` : '');
    }
    let text = '';
    for (let sibling = element.nextSibling; sibling; sibling = sibling.nextSibling) {
      if (sibling.nodeType === 1 && (sibling.matches(CONTROL) || /^(BR|INPUT|LABEL)$/.test(sibling.tagName))) break;
      text += ` ${sibling.textContent || ''}`;
    }
    return normalize(text);
  }
  function eligible(element) {
    return element && element.matches(CONTROL) && !isExcluded(element) &&
      (visible(element) || labelsFor(element).some(visible) ||
        (native(element) && element.closest(MUI_CONTROL) && visible(optionWrapper(element))));
  }
  function muiChoiceList(element) {
    if (!native(element) || !element.closest(MUI_CONTROL)) return null;
    const row = optionWrapper(element);
    if (!normalize(row.textContent) && !relevantImages(row).length) return null;
    let parent = row.parentElement;
    for (let level = 0; parent && level < 6; level++, parent = parent.parentElement) {
      if (parent.matches('body,html,form')) return null;
      const choices = choiceControls(parent);
      if (choices.length < 2) {
        if (parent.matches('article,section,.MuiPaper-root')) return null;
        continue;
      }
      if (choices.length > 30 || choices.some(choice => typeOf(choice) !== typeOf(element))) return null;
      const rows = choices.map(optionWrapper);
      // Each option must occupy its own row. This keeps neighboring question
      // containers from becoming one list merely because they share a page.
      if (rows.some(optionRow => optionRow === parent) || new Set(rows).size !== choices.length) return null;
      return parent;
    }
    return null;
  }
  function canonical(element) {
    if (element.matches(CONTROL)) return element;
    if (element.tagName === 'LABEL') {
      const linked = element.control || (element.htmlFor && doc.getElementById(element.htmlFor));
      if (linked?.matches(CONTROL)) return linked;
    }
    const controls = Array.from(element.querySelectorAll(CONTROL));
    return controls.length === 1 ? controls[0] : null;
  }
  function commonAncestor(elements) {
    let root = elements[0]?.parentElement;
    while (root && !elements.every(element => root.contains(element))) root = root.parentElement;
    return root;
  }
  function promptText(root, controls, config) {
    const selectors = config.promptSelector ? [config.promptSelector] : ['.qtext', '[data-question-text]', '.question-text', '.enunciado', '.prompt', '.question-title', '[data-testid="question-title"]', 'legend'];
    let explicit = null;
    for (const selector of selectors) {
      explicit = Array.from(root.querySelectorAll(selector)).find(element => visible(element) && !controls.some(control => optionWrapper(control).contains(element)));
      if (explicit) break;
    }
    if (explicit) {
      const pieces = [normalize(explicit.textContent)];
      // Include sibling paragraphs that carry context outside a question heading.
      for (let sibling = explicit.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
        if (sibling.matches(CONTROL) || sibling.querySelector(CONTROL)) break;
        if (visible(sibling) && /^(P|BLOCKQUOTE|PRE|TABLE|UL|OL)$/.test(sibling.tagName)) pieces.push(normalize(sibling.textContent));
      }
      return normalize(pieces.join(' '));
    }
    const labelled = (root.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => doc.getElementById(id)).filter(Boolean);
    if (labelled.length) return normalize(labelled.map(element => element.textContent).join(' '));
    const omitted = new Set(controls.map(optionWrapper));
    const pieces = [];
    const walker = doc.createTreeWalker(root, view?.NodeFilter.SHOW_TEXT || 4);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || !visible(parent) || parent.closest('script,style,button,select,textarea,nav,header,footer')) continue;
      if (controls.some(control => control === parent || control.contains(parent))) continue;
      let skip = false;
      for (const wrapper of omitted) if (wrapper === parent || wrapper.contains(parent)) { skip = true; break; }
      if (!skip) pieces.push(node.textContent);
    }
    return normalize(pieces.join(' '));
  }
  function scanChoices(config = {}) {
    const settings = {
      containerSelector: normalize(config.containerSelector),
      promptSelector: normalize(config.promptSelector),
      optionSelector: normalize(config.optionSelector)
    };
    const warnings = [];
    try {
      for (const selector of Object.values(settings)) if (selector) doc.querySelector(selector);
    } catch {
      return { questions: [], warnings: ['Um seletor CSS é inválido. Revise as opções avançadas.'] };
    }
    const scope = settings.containerSelector ? Array.from(doc.querySelectorAll(settings.containerSelector)) : [doc];
    const candidates = [];
    for (const root of scope) {
      if (root.nodeType === 1 && (!visible(root) || isExcluded(root))) continue;
      const found = Array.from(root.querySelectorAll(settings.optionSelector || CONTROL));
      for (const match of found) {
        const element = canonical(match);
        if (element && eligible(element) && !candidates.includes(element)) candidates.push(element);
      }
    }
    // A native input inside a role option represents the same choice; keep the input.
    const controls = candidates.filter(element => native(element) || !candidates.some(other => native(other) && element.contains(other)));
    const groups = new Map();
    for (const element of controls) {
      const type = typeOf(element);
      const explicitRoot = settings.containerSelector ? element.closest(settings.containerSelector) : element.closest(CONTAINER);
      const inferredList = !explicitRoot && !element.name ? muiChoiceList(element) : null;
      let key;
      if (native(element) && type === 'radio' && element.name) {
        key = `radio:${uid(element.form || element.getRootNode())}:${element.name}`;
      } else if (explicitRoot) {
        key = `${type}:root:${uid(explicitRoot)}`;
      } else if (inferredList) {
        key = `${type}:root:${uid(inferredList)}`;
      } else if (native(element) && element.name) {
        key = `${type}:${uid(element.form || element.getRootNode())}:${element.name}`;
      } else {
        const wrapper = optionWrapper(element);
        const parent = wrapper.parentElement || element.parentElement;
        key = `${type}:parent:${uid(parent)}`;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(element);
    }
    const questions = [];
    for (const [key, members] of groups) {
      if (members.length < 2) continue;
      let root = commonAncestor(members);
      if (!root) continue;
      const explicitRoot = settings.containerSelector ? members[0].closest(settings.containerSelector) : members[0].closest(CONTAINER);
      if (explicitRoot && members.every(element => explicitRoot.contains(element))) root = explicitRoot;
      if (!settings.containerSelector && !root.matches('fieldset,[data-question],[data-question-id],.question,.que')) {
        const card = root.closest('article,section,.MuiPaper-elevation3,.MuiCard-root,[data-question-id]');
        if (card && members.every(element => card.contains(element)) && choiceControls(card).every(element => members.includes(element))) root = card;
      }
      const options = members.map((element, index) => ({ index, text: optionText(element, index), element, type: typeOf(element) }));
      if (options.some(option => !option.text)) {
        warnings.push('Há alternativas sem texto legível; esse grupo foi ignorado.');
        continue;
      }
      let prompt = promptText(root, members, settings);
      // Common layouts put the question immediately above an options-only container.
      for (let level = 0; !prompt && level < 7 && !settings.containerSelector; level++) {
        const parent = root.parentElement;
        if (!parent || /^(BODY|HTML)$/.test(parent.tagName) || controls.some(control => parent.contains(control) && !members.includes(control))) break;
        root = parent;
        prompt = promptText(root, members, settings);
      }
      if (!prompt && relevantImages(root).some(image => !members.some(member => optionWrapper(member).contains(image)))) {
        prompt = 'Observe a imagem do enunciado e responda à questão.';
      }
      if (!prompt) {
        warnings.push('Um grupo sem enunciado legível foi ignorado. Configure o seletor do enunciado.');
        continue;
      }
      if (prompt.length > 16000 || options.some(option => option.text.length > 6000)) {
        warnings.push('Um bloco muito amplo foi ignorado. Configure o seletor da questão.');
        continue;
      }
      const fingerprint = JSON.stringify([prompt, options.map(option => [option.text, option.type])]);
      const question = { id: `q-${key}`, prompt, options, multiple: options.every(option => option.type === 'checkbox'), element: root, fingerprint };
      const info = { settings, key, root, members: [...members], fingerprint };
      const visual = attachVisuals(question, info, members);
      if (visual.issue) warnings.push(visual.issue);
      metadata.set(question, info);
      questions.push(question);
    }
    return { questions, warnings: [...new Set(warnings)] };
  }
  function isChoiceCurrent(question) {
    const previous = metadata.get(question);
    if (!previous || !previous.root.isConnected || previous.members.some(element => !element.isConnected)) return false;
    const current = scanChoices(previous.settings).questions.find(candidate => candidate.id === `q-${previous.key}`);
    return Boolean(current && current.element === previous.root && current.fingerprint === previous.fingerprint &&
      current.options.length === previous.members.length && current.options.every((option, index) => option.element === previous.members[index]));
  }
  function selected(element) {
    if (native(element)) return element.checked;
    const value = element.getAttribute('aria-checked');
    return value === 'true' ? true : value === 'false' ? false : null;
  }
  const disabled = element => element.disabled || element.matches(':disabled') || Boolean(element.closest('[aria-disabled="true"],[inert]'));
  const states = members => members.map(selected);
  const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
  const settle = () => new Promise(resolve => setTimeout(resolve, 35));
  async function applyChoice(question, indices, { signal } = {}) {
    const previous = metadata.get(question);
    if (!previous || !isCurrent(question)) return { selected: false, message: 'A questão mudou. Leia a página novamente.' };
    if (!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length ||
        indices.some(index => !Number.isInteger(index) || index < 0 || index >= previous.members.length) ||
        (!question.multiple && indices.length !== 1)) return { selected: false, message: 'A resposta contém índices inválidos.' };
    if (signal?.aborted) return { selected: false, message: 'Operação cancelada.' };
    const members = previous.members;
    const before = states(members);
    const desired = members.map((_, index) => indices.includes(index));
    if (before.includes(null)) return { selected: false, message: 'O controle não informa seu estado. A marcação automática não está disponível.' };
    if (members.some((element, index) => before[index] !== desired[index] && disabled(element))) return { selected: false, message: 'Uma alternativa está desabilitada.' };
    let observed = before;
    let touched = false;
    async function undo({ signal: undoSignal } = {}) {
      if (undoSignal?.aborted) return { restored: false, message: 'Restauração cancelada.' };
      if (!isCurrent(question) || !equal(states(members), observed)) return { restored: false, message: 'A questão ou a seleção mudou; não foi possível desfazer.' };
      const toRestore = before.findIndex(Boolean);
      if (!question.multiple && toRestore === -1 && members.some(element => !native(element))) return { restored: false, message: 'Este controle não permite limpar a seleção. Desfaça manualmente na página.' };
      if (members.some((element, index) => selected(element) !== before[index] && disabled(element))) return { restored: false, message: 'Uma alternativa foi desabilitada; desfaça manualmente.' };
      if (!question.multiple && toRestore >= 0) members[toRestore].click();
      else if (question.multiple) {
        for (let index = 0; index < members.length; index++) {
          if (undoSignal?.aborted) return { restored: false, message: 'Restauração cancelada.' };
          if (!isCurrent(question)) return { restored: false, message: 'A questão mudou durante a restauração.' };
          if (selected(members[index]) !== before[index]) { members[index].click(); await settle(); }
        }
      } else {
        const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'checked').set;
        for (const element of members) if (element.checked) {
          setter.call(element, false);
          element.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
          element.dispatchEvent(new view.Event('change', { bubbles: true, composed: true }));
        }
      }
      await settle();
      const restored = isCurrent(question) && equal(states(members), before);
      if (restored) observed = [...before];
      return { restored, message: restored ? 'Seleção anterior restaurada.' : 'O site não confirmou a restauração. Revise a página.' };
    }
    try {
      const targets = question.multiple ? members.map((_, index) => index).filter(index => before[index] !== desired[index]) : indices;
      for (const index of targets) {
        if (signal?.aborted) return { selected: false, message: 'Operação cancelada.', ...(touched ? { undo } : {}) };
        if (!isCurrent(question)) return { selected: false, message: 'A questão mudou durante a marcação.', ...(touched ? { undo } : {}) };
        if (selected(members[index]) === desired[index]) continue;
        if (disabled(members[index])) return { selected: false, message: 'A alternativa foi desabilitada.', ...(touched ? { undo } : {}) };
        members[index].click();
        touched = true;
        await settle();
        observed = states(members);
      }
      const confirmed = isCurrent(question) && equal(states(members), desired);
      return { selected: confirmed, message: confirmed ? 'Alternativa marcada na página.' : 'O site não confirmou a marcação. Revise a página.', ...(touched ? { undo } : {}) };
    } catch {
      observed = states(members);
      return { selected: false, message: 'O site impediu a marcação. Revise a página.', ...(touched ? { undo } : {}) };
    }
  }
  // Form answers keep the provider payload independent of the page's DOM.
  const SELECTOR = 'select:not([multiple]),.MuiSelect-select[role="combobox"][aria-haspopup="listbox"]';
  const TEXT_SELECTOR = 'textarea,input[type="text"],input:not([type])';
  const FIELD_ROOT = '.que,.question,.question-container,.question-item,.quiz-question,[data-question],[data-question-id],fieldset,.MuiPaper-elevation3';
  const menuCache = new WeakMap();
  let preparationWarnings = [];
  let preparing = false;
  let menuSession = null;
  const clean = value => normalize(String(value || '').replace(/[\u200b\ufeff]/g, ''));
  const aborted = signal => {
    if (signal?.aborted) {
      const error = new Error('Operação cancelada.');
      error.code = 'ABORTED';
      throw error;
    }
  };
  function formVisible(element, root) {
    if (!element?.isConnected || isExcluded(element)) return false;
    for (let item = element; item && item !== root?.parentElement; item = item.parentElement) {
      const hiddenByOwnMenu = menuSession && item.contains(menuSession.field.element) &&
        !menuSession.hiddenBefore.has(item);
      if (item.hasAttribute('hidden') || (item.getAttribute('aria-hidden') === 'true' && !hiddenByOwnMenu)) return false;
      const style = view.getComputedStyle(item);
      if (style.display === 'none' || /^(hidden|collapse)$/.test(style.visibility)) return false;
    }
    return true;
  }
  function selectDescriptor(element) {
    return { element, type: element.tagName === 'SELECT' ? 'native' : 'mui' };
  }
  function fieldValue(field) {
    if (field.type !== 'mui') return String(field.element.value || '');
    const input = field.element.closest('.MuiInputBase-root')?.querySelector('input.MuiSelect-nativeInput');
    return input ? String(input.value || '') : clean(field.element.textContent);
  }
  function textCandidate(element, root) {
    if (element.tagName === 'INPUT' && !element.closest('.que,.question,.question-container,.question-item,.quiz-question,[data-question],[data-question-id],fieldset') &&
        !/^(?:responder|resposta)\b/i.test(element.getAttribute('placeholder') || element.getAttribute('aria-label') || '')) return false;
    return !element.matches('.MuiSelect-nativeInput,[aria-hidden="true"],[type="hidden"]') &&
      !element.readOnly && !element.closest('.MuiSelect-root,[role="listbox"]') && formVisible(element, root);
  }
  function fieldRoot(element, settings) {
    if (settings.containerSelector) return element.closest(settings.containerSelector);
    const explicit = element.closest(FIELD_ROOT);
    if (explicit) return explicit;
    return element.closest('article,section,.MuiPaper-root');
  }
  function formSettings(config = {}) {
    return {
      containerSelector: normalize(config.containerSelector),
      promptSelector: normalize(config.promptSelector),
      optionSelector: normalize(config.optionSelector)
    };
  }
  function collectFieldGroups(config = {}) {
    const settings = formSettings(config);
    for (const selector of Object.values(settings)) if (selector) doc.querySelector(selector);
    const groups = new Map();
    const add = (element, kind) => {
      if (!visible(element) || isExcluded(element)) return;
      const root = fieldRoot(element, settings);
      if (!root || !visible(root) || root.matches('body,html')) return;
      if (kind === 'text' && !textCandidate(element, root)) return;
      const key = `${kind}:${uid(root)}`;
      if (!groups.has(key)) groups.set(key, { kind, root, settings, fields: [] });
      groups.get(key).fields.push(kind === 'blanks' ? selectDescriptor(element) : { element, type: 'text' });
    };
    for (const element of doc.querySelectorAll(SELECTOR)) add(element, 'blanks');
    for (const element of doc.querySelectorAll(TEXT_SELECTOR)) add(element, 'text');
    return [...groups.values()];
  }
  function fieldPrompt(root, fields, kind, settings) {
    const placeholders = new Map(fields.map((field, index) => [field.element, kind === 'blanks' ? `[Lacuna ${index + 1}]` : '']));
    let scope = root;
    if (settings.promptSelector) {
      const custom = root.matches(settings.promptSelector) ? root : root.querySelector(settings.promptSelector);
      // A custom enunciado selector must include the phrase's slots for blanks.
      if (custom && (kind !== 'blanks' || fields.every(field => custom.contains(field.element)))) scope = custom;
    }
    const visit = node => {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1 || isExcluded(node)) return '';
      if (placeholders.has(node)) return ` ${placeholders.get(node)} `;
      if (!formVisible(node, root) || node.matches('script,style,button,svg,textarea,input,select,[role="listbox"]')) return '';
      if (kind === 'text' && fields.some(field => node.matches('.MuiInputBase-root') && node.contains(field.element))) return '';
      const ownText = clean(node.textContent);
      if (node.matches('p,span,label,.MuiTypography-root,.MuiFormHelperText-root') &&
          (/^N[°ºo.]?\s*(?:mínimo|máximo|minimo|maximo)\s+de\s+caracteres\s*:/i.test(ownText) ||
           /^\d+\s*(?:\/\s*\d+|caracteres?|palavras?)$/i.test(ownText) ||
           /^(?:caracteres?|palavras?)\s*:\s*\d+(?:\s*\/\s*\d+)?$/i.test(ownText))) return '';
      return Array.from(node.childNodes).map(visit).join(' ');
    };
    let prompt = clean(visit(scope));
    if (kind === 'blanks') for (let index = 0; index < fields.length; index++) {
      if (!prompt.includes(`[Lacuna ${index + 1}]`)) prompt += ` [Lacuna ${index + 1}]`;
    }
    if (kind === 'blanks' && fields.every(field => field.type === 'mui' && /^\d+-/.test(field.element.id))) {
      prompt += ' As opções pertencem a um banco compartilhado; uma opção usada sai dos outros menus.';
    }
    return prompt;
  }
  function limitsFor(element, root) {
    // Sala renders the label even when its numeric limit is undefined. Read
    // each label in isolation so its sibling counter cannot become the limit.
    const blockSelector = '.MuiTypography-root,p,label,legend';
    const blocks = Array.from(root.querySelectorAll(blockSelector));
    if (root.matches(blockSelector)) blocks.unshift(root);
    function labelLimit(word) {
      const prefix = new RegExp(`N[°ºo.]?\\s*(?:${word})\\s+de\\s+caracteres\\s*:`, 'i');
      const pattern = new RegExp(`${prefix.source}\\s*(\\d+)`, 'i');
      for (const block of blocks) {
        if (!prefix.test(clean(block.textContent))) continue;
        // A broad Typography wrapper must not join separate label blocks.
        if (Array.from(block.querySelectorAll(blockSelector)).some(child => prefix.test(clean(child.textContent)))) continue;
        const match = clean(block.textContent).match(pattern);
        if (match) return Number(match[1]);
      }
      // Plain HTML can put a complete label in a single text node. Combining
      // unrelated text nodes here would recreate the missing-limit bug.
      const walker = doc.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const match = clean(node.textContent).match(pattern);
        if (match) return Number(match[1]);
      }
      return null;
    }
    const minLabel = labelLimit('mínimo|minimo');
    const maxLabel = labelLimit('máximo|maximo');
    const attrMax = Number(element.getAttribute('maxlength'));
    const attrMin = Number(element.getAttribute('minlength'));
    const minimum = minLabel ?? (element.hasAttribute('minlength') && attrMin >= 0 ? attrMin : 0);
    const explicitMax = maxLabel ?? (element.hasAttribute('maxlength') && attrMax > 0 ? attrMax : null);
    const maximum = explicitMax ?? Math.max(3000, minimum);
    const maxLength = Math.max(1, Math.min(8000, maximum));
    if (minimum > 8000 || minimum > maxLength) return { minLength: minimum, maxLength, invalid: true };
    return { minLength: Math.max(0, minimum || 0), maxLength };
  }
  function nativeOptions(element) {
    return Array.from(element.options).filter(option => !option.disabled && !option.hidden &&
      !(option.value === '' && /^(?:selecione|escolha|select|choose|[-–—\s]*$)/i.test(clean(option.textContent))))
      .map(option => ({ text: clean(option.textContent), value: String(option.value), element: option }));
  }
  function descriptorOptions(field, context) {
    if (field.type === 'native') return nativeOptions(field.element);
    const cached = menuCache.get(field.element);
    return cached?.context === context ? cached.options : null;
  }
  function fieldContext(group, prompt) {
    return JSON.stringify([view.location?.href || '', uid(group.root), group.root.getAttribute('data-question-id'), prompt, group.fields.map(field => uid(field.element))]);
  }
  function listboxFor(trigger) {
    const id = trigger.getAttribute('aria-controls');
    const linked = id && doc.getElementById(id);
    if (linked?.getAttribute('role') === 'listbox' && fieldMenuVisible(linked, trigger)) return linked;
    if (trigger.getAttribute('aria-expanded') !== 'true') return null;
    const menus = Array.from(doc.querySelectorAll('.MuiMenu-root [role="listbox"]')).filter(visible);
    return menus.length === 1 ? menus[0] : null;
  }
  function fieldMenuVisible(menu, trigger) {
    return trigger.getAttribute('aria-expanded') === 'true' && visible(menu);
  }
  async function waitUntil(check, signal, milliseconds = 1000) {
    const until = Date.now() + milliseconds;
    while (Date.now() < until) {
      aborted(signal);
      const result = check();
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return null;
  }
  async function openSelect(field, signal) {
    aborted(signal);
    if (!field.element.isConnected || disabled(field.element)) throw new Error('A lacuna está desabilitada ou mudou.');
    const existing = listboxFor(field.element);
    if (existing) return existing;
    if (Array.from(doc.querySelectorAll('.MuiMenu-root [role="listbox"]')).some(visible)) throw new Error('Feche o menu aberto na página para continuar.');
    const hiddenBefore = new Set();
    for (let item = field.element; item; item = item.parentElement) if (item.getAttribute('aria-hidden') === 'true') hiddenBefore.add(item);
    menuSession = { field, hiddenBefore };
    field.element.focus();
    field.element.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    const menu = await waitUntil(() => listboxFor(field.element), signal);
    if (!menu) throw new Error('Não foi possível abrir as opções desta lacuna.');
    return menu;
  }
  async function closeSelect(field, menu) {
    try {
      if (!menu?.isConnected) return;
      if (field.element.getAttribute('aria-expanded') !== 'false') menu.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
      const closed = await waitUntil(() => !menu.isConnected || !visible(menu), undefined, 900);
      if (!closed) throw new Error('Feche o menu da lacuna para continuar.');
    } finally { if (menuSession?.field.element === field.element) menuSession = null; }
  }
  function menuOptions(menu) {
    return Array.from(menu.querySelectorAll('[role="option"]')).filter(option => visible(option) && option.getAttribute('aria-disabled') !== 'true')
      .map(option => ({ text: clean(option.textContent), value: option.getAttribute('data-value') ?? clean(option.textContent), element: option }));
  }
  async function prepare(config = {}, { signal } = {}) {
    aborted(signal);
    if (preparing) return { warnings: [] };
    preparing = true;
    preparationWarnings = [];
    try {
      let groups;
      try { groups = collectFieldGroups(config); }
      catch { return { warnings: ['Um seletor CSS é inválido. Revise as opções avançadas.'] }; }
      for (const group of groups.filter(group => group.kind === 'blanks')) {
        if (group.fields.length > 20) continue;
        const prompt = fieldPrompt(group.root, group.fields, 'blanks', group.settings);
        const context = fieldContext(group, prompt);
        for (const field of group.fields) {
          aborted(signal);
          if (field.type !== 'mui' || menuCache.get(field.element)?.context === context) continue;
          let menu;
          try {
            menu = await openSelect(field, signal);
            const options = menuOptions(menu);
            if (!options.length || options.length > 30 || options.some(option => !option.text)) throw new Error('A lacuna não tem de 1 a 30 opções legíveis.');
            menuCache.set(field.element, { context, options: options.map(({ text, value }) => ({ text, value })) });
          } catch (error) {
            aborted(signal);
            preparationWarnings.push(error.message || 'Não foi possível ler uma lacuna.');
          } finally {
            const ownedMenu = menu || listboxFor(field.element);
            if (ownedMenu) await closeSelect(field, ownedMenu);
            else if (menuSession?.field.element === field.element) menuSession = null;
          }
        }
      }
      return { warnings: [...new Set(preparationWarnings)] };
    } finally { preparing = false; }
  }
  function scan(config = {}) {
    const choices = scanChoices(config);
    const warnings = [...choices.warnings, ...preparationWarnings];
    let groups;
    try { groups = collectFieldGroups(config); }
    catch { return choices; }
    const questions = [...choices.questions];
    for (const group of groups) {
      if (group.kind === 'text' && (group.fields.length !== 1 || choices.questions.some(question => group.fields.some(field => question.element.contains(field.element))))) continue;
      if (group.kind === 'blanks' && (group.fields.length < 1 || group.fields.length > 20)) continue;
      const rawPrompt = fieldPrompt(group.root, group.fields, group.kind, group.settings);
      const prompt = !rawPrompt.replace(/\[Lacuna \d+\]/g, '').trim() && relevantImages(group.root).length
        ? `Observe a imagem do enunciado e responda à questão. ${rawPrompt}`.trim() : rawPrompt;
      if (!prompt || prompt.length > 20000 || !prompt.replace(/\[Lacuna \d+\]/g, '').trim()) continue;
      const context = fieldContext(group, rawPrompt);
      const options = group.kind === 'blanks' ? group.fields.map(field => descriptorOptions(field, context)) : [];
      if (group.kind === 'blanks' && options.some(list => !list || list.length < 1 || list.length > 30 || list.some(option => !option.text))) {
        warnings.push('As opções das lacunas ainda não foram lidas. Tente iniciar novamente.');
        continue;
      }
      const limits = group.kind === 'text' ? limitsFor(group.fields[0].element, group.root) : {};
      if (limits.invalid) {
        warnings.push('Os limites de texto da questão são incompatíveis ou excedem 8.000 caracteres.');
        continue;
      }
      const fingerprint = JSON.stringify([group.kind, prompt, group.kind === 'blanks' ? options.map(list => list.map(({ text, value }) => [text, value])) : limits]);
      const question = { kind: group.kind, id: `q-${group.kind}:${uid(group.root)}`, prompt, element: group.root, fingerprint, options: [] };
      if (group.kind === 'blanks') question.fields = group.fields.map((field, index) => ({ label: field.element.getAttribute('aria-label') || `Lacuna ${index + 1}`, element: field.element, options: options[index].map((option, optionIndex) => ({ index: optionIndex, text: option.text, element: option.element })) }));
      else Object.assign(question, limits, { field: group.fields[0].element });
      const info = { kind: group.kind, group, prompt: rawPrompt, fingerprint, context, options, limits, expectedValues: group.fields.map(fieldValue) };
      const visual = attachVisuals(question, info);
      if (visual.issue) warnings.push(visual.issue);
      metadata.set(question, info);
      questions.push(question);
    }
    const ordering = scanOrders(config);
    questions.push(...ordering.questions);
    warnings.push(...ordering.warnings);
    questions.sort((a, b) => a.element === b.element ? 0 : (a.element.compareDocumentPosition(b.element) & 4) ? -1 : 1);
    return { questions, warnings: [...new Set(warnings)] };
  }
  function isFormCurrent(question) {
    const info = metadata.get(question);
    if (!info || !info.group.root.isConnected || !visualsCurrent(info)) return false;
    const { group } = info;
    if (group.fields.some(field => !field.element.isConnected || !group.root.contains(field.element) || disabled(field.element) || (field.type === 'text' && field.element.readOnly))) return false;
    const current = Array.from(group.root.querySelectorAll(group.kind === 'blanks' ? SELECTOR : TEXT_SELECTOR))
      .filter(element => group.kind === 'blanks' ? formVisible(element, group.root) : textCandidate(element, group.root));
    if (current.length !== group.fields.length || current.some((element, index) => element !== group.fields[index].element)) return false;
    if (fieldPrompt(group.root, group.fields, group.kind, group.settings) !== info.prompt) return false;
    if (!equal(group.fields.map(fieldValue), info.expectedValues)) return false;
    if (group.kind === 'text') return JSON.stringify(limitsFor(group.fields[0].element, group.root)) === JSON.stringify(info.limits);
    return group.fields.every((field, index) => {
      const options = descriptorOptions(field, info.context);
      return options && JSON.stringify(options.map(({ text, value }) => [text, value])) === JSON.stringify(info.options[index].map(({ text, value }) => [text, value]));
    });
  }
  function isCurrent(question) {
    const info = metadata.get(question);
    if (info?.kind === 'order') return isOrderCurrent(info);
    return info?.kind === 'blanks' || info?.kind === 'text' ? isFormCurrent(question) : isChoiceCurrent(question);
  }
  function setNativeValue(field, value) {
    const prototype = field.element.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : field.element.tagName === 'SELECT' ? view.HTMLSelectElement.prototype : view.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field.element, value);
    field.element.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
    field.element.dispatchEvent(new view.Event('change', { bubbles: true, composed: true }));
    field.element.blur();
  }
  function inlineClear(field) {
    const base = field.element.closest('.MuiInputBase-root');
    const wrapper = base?.parentElement;
    if (!wrapper || wrapper.tagName !== 'SPAN' || !wrapper.contains(field.element)) return null;
    const candidates = Array.from(wrapper.children).filter(element => element.matches('button.MuiIconButton-root') && !clean(element.textContent));
    return candidates.length === 1 && !disabled(candidates[0]) ? candidates[0] : null;
  }
  async function writeField(info, index, value, signal) {
    aborted(signal);
    if (!isFormCurrentFromInfo(info)) throw new Error('A questão ou sua resposta mudou.');
    const field = info.group.fields[index];
    if (fieldValue(field) === value) return;
    if (field.type !== 'mui') {
      field.element.focus();
      setNativeValue(field, value);
      info.expectedValues[index] = value;
      await settle();
    } else if (value === '') {
      const clear = inlineClear(field);
      if (!clear) throw new Error('Esta lacuna não permite restaurar o vazio automaticamente.');
      clear.click();
      info.expectedValues[index] = '';
      await settle();
    } else {
      let menu;
      try {
        menu = await openSelect(field, signal);
        aborted(signal);
        if (!isFormCurrentFromInfo(info)) throw new Error('A questão ou sua resposta mudou.');
        const expected = info.options[index].find(option => option.value === value);
        const matches = menuOptions(menu).filter(option => option.value === value && (!expected || option.text === expected.text));
        if (matches.length !== 1) throw new Error('A palavra já não está disponível nesta lacuna.');
        matches[0].element.click();
        info.expectedValues[index] = value;
        await settle();
      } finally {
        const ownedMenu = menu || listboxFor(field.element);
        if (ownedMenu) await closeSelect(field, ownedMenu);
        else if (menuSession?.field.element === field.element) menuSession = null;
      }
    }
    if (!isFormCurrentFromInfo(info)) throw new Error('O site não confirmou o preenchimento. Revise a questão.');
  }
  function isFormCurrentFromInfo(info) { return isFormCurrent(info.question); }
  async function applyForm(question, answer, { signal } = {}) {
    const info = metadata.get(question);
    if (!info || !isFormCurrent(question)) return { selected: false, message: 'A questão ou sua resposta mudou. Leia novamente.' };
    info.question = question;
    let target;
    if (info.kind === 'blanks') {
      if (!Array.isArray(answer) || answer.length !== info.group.fields.length || answer.some((index, fieldIndex) => !Number.isInteger(index) || index < 0 || index >= info.options[fieldIndex].length)) return { selected: false, message: 'As respostas das lacunas são inválidas. Nada foi preenchido.' };
      target = answer.map((index, fieldIndex) => info.options[fieldIndex][index].value);
    } else {
      if (typeof answer !== 'string' || !answer.trim() || answer.length > info.limits.maxLength || answer.trim().length < info.limits.minLength) return { selected: false, message: 'O texto não respeita os limites da questão. Nada foi preenchido.' };
      target = [answer];
    }
    if (signal?.aborted) return { selected: false, message: 'Operação cancelada.' };
    const before = [...info.expectedValues];
    let touched = false;
    async function restore(values, operationSignal) {
      if (!isFormCurrent(question)) throw new Error('A questão ou a resposta mudou. Não foi possível restaurar.');
      // Free occupied bank words before restoring another field's former word.
      for (let index = 0; index < values.length; index++) if (info.group.fields[index].type === 'mui' && info.expectedValues[index] && info.expectedValues[index] !== values[index]) {
        touched = true;
        await writeField(info, index, '', operationSignal);
      }
      for (let index = 0; index < values.length; index++) {
        aborted(operationSignal);
        if (info.expectedValues[index] !== values[index]) {
          touched = true;
          await writeField(info, index, values[index], operationSignal);
        }
      }
    }
    async function undo({ signal: undoSignal } = {}) {
      try {
        aborted(undoSignal);
        if (!isFormCurrent(question)) return { restored: false, message: 'A questão ou a seleção mudou; não foi possível desfazer.' };
        await restore(before, undoSignal);
        return { restored: true, message: 'Resposta anterior restaurada.' };
      } catch (error) { return { restored: false, message: error.message || 'O site não confirmou a restauração.' }; }
    }
    try {
      await restore(target, signal);
      return { selected: true, message: info.kind === 'text' ? 'Resposta escrita na página.' : 'Lacunas preenchidas na página.', ...(touched ? { undo } : {}) };
    } catch (error) {
      return { selected: false, message: error.message || 'Não foi possível preencher a resposta.', ...(touched ? { undo } : {}) };
    }
  }
  async function apply(question, answer, options = {}) {
    const kind = metadata.get(question)?.kind;
    if (kind === 'order') return applyOrder(question, answer, options);
    return kind === 'blanks' || kind === 'text' ? applyForm(question, answer, options) : applyChoice(question, answer, options);
  }

  // CLOUD keeps every word in a fixed bank, hiding the words in the answer.
  // Its word buttons remove individual selections; no drag or submission is
  // needed. Only this two-panel structure anchored by its own heading is used.
  const orderEntries = new WeakMap();
  const orderBindings = new Set();
  function bankWords(bank) {
    return Array.from(bank.children).filter(element => element.matches('.MuiBox-root') &&
      clean(Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join(' ')) &&
      !element.querySelector('button,input,textarea,select') && view.getComputedStyle(element).cursor === 'pointer');
  }
  function orderPrompt(entry, settings) {
    let scope = entry.root;
    if (settings.promptSelector) scope = entry.root.querySelector(settings.promptSelector) || scope;
    function visit(node) {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1 || node === entry.grid || isExcluded(node) || !formVisible(node, entry.root) ||
          node.matches('script,style,button,svg,input,textarea,select,nav,header,footer')) return '';
      return Array.from(node.childNodes).map(visit).join(' ');
    }
    return clean(visit(scope));
  }
  function orderState(entry) {
    const words = bankWords(entry.bank);
    const texts = words.map(element => clean(element.textContent));
    const used = words.map(element => element.hasAttribute('hidden') || view.getComputedStyle(element).display === 'none');
    const buttons = Array.from(entry.answer.querySelectorAll('button.MuiIconButton-root'))
      .filter(button => !button.querySelector('svg') && clean(button.textContent));
    const labels = buttons.map(button => clean(button.textContent));
    const available = used.map((selected, index) => selected ? index : -1).filter(index => index >= 0);
    const order = [];
    for (const label of labels) {
      const position = available.findIndex(index => texts[index] === label);
      if (position < 0) return null;
      order.push(available.splice(position, 1)[0]);
    }
    if (available.length || !equal(texts, entry.words)) return null;
    return { words, buttons, labels, used, order };
  }
  const orderSnapshot = state => ({ labels: [...state.labels], used: [...state.used] });
  const sameOrderState = (state, expected) => state && equal(state.labels, expected.labels) && equal(state.used, expected.used);
  function orderStructureCurrent(info) {
    const entry = info.entry;
    return entry.live && entry.grid.isConnected && entry.root.isConnected && entry.root.contains(entry.grid) &&
      entry.grid.contains(entry.answer) && entry.grid.contains(entry.bank) && entry.version === info.version &&
      (view.location?.href || '') === info.url && orderPrompt(entry, info.settings) === info.prompt && visualsCurrent(info);
  }
  function isOrderCurrent(info) {
    return orderStructureCurrent(info) && sameOrderState(orderState(info.entry), info.expected);
  }
  function scanOrders(config) {
    const settings = formSettings(config);
    const questions = [], warnings = [];
    for (const entry of orderBindings) if (!entry.grid.isConnected) {
      entry.controller.abort(); entry.live = false; orderBindings.delete(entry);
    }
    for (const label of doc.querySelectorAll('.MuiTypography-root')) {
      if (clean(label.textContent) !== 'Resposta do Aluno' || !visible(label) || isExcluded(label)) continue;
      let grid = label.closest('.MuiGrid-container');
      let panels;
      while (grid) {
        panels = Array.from(grid.children).filter(element => element.matches('.MuiGrid-item'));
        if (panels.length === 2 && panels[0].contains(label) && bankWords(panels[1]).length >= 2) break;
        grid = grid.parentElement?.closest('.MuiGrid-container');
      }
      if (!grid) continue;
      const root = fieldRoot(grid, settings);
      if (!root || !visible(root) || root.matches('body,html') || !root.contains(grid)) continue;
      const words = bankWords(panels[1]).map(element => clean(element.textContent));
      if (words.length < 2 || words.length > 60 || words.some(word => !word || word.length > 1000)) {
        warnings.push('Este banco de palavras excede os limites de leitura.'); continue;
      }
      let entry = orderEntries.get(grid);
      if (!entry || !entry.live || entry.root !== root || entry.answer !== panels[0] || entry.bank !== panels[1] || !equal(words, entry.words)) {
        if (entry) { entry.controller.abort(); entry.live = false; orderBindings.delete(entry); }
        entry = { root, grid, answer: panels[0], bank: panels[1], words, version: 0, owned: false, live: true, controller: new view.AbortController() };
        const interact = event => {
          if (entry.owned) return;
          const target = event.target;
          if ((entry.answer.contains(target) && target.closest?.('button')) || bankWords(entry.bank).some(word => word.contains(target))) entry.version++;
        };
        for (const panel of panels) panel.addEventListener('click', interact, { capture: true, signal: entry.controller.signal });
        orderEntries.set(grid, entry); orderBindings.add(entry);
      }
      const prompt = orderPrompt(entry, settings);
      if (!prompt || prompt.length > 20000) continue;
      const state = orderState(entry);
      if (!state) { warnings.push('Não foi possível reconhecer a ordem atual dos blocos.'); continue; }
      const question = { kind: 'order', id: `q-order:${uid(grid)}`, element: root, prompt,
        options: words.map((text, index) => ({ index, text, element: state.words[index] })),
        fingerprint: JSON.stringify(['order', prompt, words]) };
      const info = { kind: 'order', entry, settings, prompt, version: entry.version, url: view.location?.href || '', expected: orderSnapshot(state) };
      const visual = attachVisuals(question, info, [], [grid]);
      if (visual.issue) warnings.push(visual.issue);
      metadata.set(question, info);
      questions.push(question);
    }
    return { questions, warnings };
  }
  async function applyOrder(question, order, { signal } = {}) {
    const info = metadata.get(question);
    if (!info || !isOrderCurrent(info)) return { selected: false, message: 'Os blocos ou sua resposta mudaram. Leia novamente.' };
    const count = info.entry.words.length;
    if (!Array.isArray(order) || order.length !== count || new Set(order).size !== count ||
        order.some(index => !Number.isInteger(index) || index < 0 || index >= count)) {
      return { selected: false, message: 'A ordem dos blocos é inválida. Nada foi alterado.' };
    }
    const before = [...orderState(info.entry).order];
    let touched = false;
    async function click(target, expected, operationSignal) {
      aborted(operationSignal);
      if (!isOrderCurrent(info) || disabled(target) || !formVisible(target, info.entry.root) || view.getComputedStyle(target).pointerEvents === 'none') {
        throw new Error('O bloco foi alterado ou está indisponível.');
      }
      info.entry.owned = true;
      try { target.click(); touched = true; } finally { info.entry.owned = false; }
      await settle();
      if (!orderStructureCurrent(info)) throw new Error('A questão ou a resposta mudou durante a ordenação.');
      const state = orderState(info.entry);
      if (!state) throw new Error('O site não confirmou os blocos selecionados.');
      info.expected = orderSnapshot(state);
      if (!sameOrderState(state, expected)) throw new Error('O site não confirmou a ordem dos blocos.');
      aborted(operationSignal);
    }
    async function restore(indices, operationSignal) {
      aborted(operationSignal);
      if (!isOrderCurrent(info)) throw new Error('A questão ou a resposta mudou.');
      const desired = { labels: indices.map(index => info.entry.words[index]), used: info.entry.words.map((_, index) => indices.includes(index)) };
      let state = orderState(info.entry);
      if (sameOrderState(state, desired)) return;
      while (state.buttons.length) {
        const last = state.buttons.length - 1;
        // With repeated words the DOM exposes the selected label, not its id.
        // Read the observed bank again after each removal before proceeding.
        const expectedLabels = state.labels.slice(0, last);
        const target = state.buttons[last];
        aborted(operationSignal);
        if (!isOrderCurrent(info) || disabled(target) || !formVisible(target, info.entry.root) || view.getComputedStyle(target).pointerEvents === 'none') throw new Error('Não foi possível remover um bloco.');
        info.entry.owned = true;
        try { target.click(); touched = true; } finally { info.entry.owned = false; }
        await settle();
        if (!orderStructureCurrent(info)) throw new Error('A questão ou a resposta mudou durante a ordenação.');
        state = orderState(info.entry);
        if (!state) throw new Error('O site não confirmou a remoção do bloco.');
        info.expected = orderSnapshot(state);
        if (!equal(state.labels, expectedLabels)) throw new Error('O site não confirmou a remoção do bloco.');
      }
      for (const index of indices) {
        aborted(operationSignal);
        state = orderState(info.entry);
        const expected = { labels: [...state.labels, info.entry.words[index]], used: state.used.map((used, position) => used || position === index) };
        await click(state.words[index], expected, operationSignal);
      }
      aborted(operationSignal);
      if (!isOrderCurrent(info) || !sameOrderState(orderState(info.entry), desired)) throw new Error('A ordem final não foi confirmada.');
    }
    async function undo({ signal: undoSignal } = {}) {
      try { await restore(before, undoSignal); return { restored: true, message: 'Ordem anterior restaurada.' }; }
      catch (error) { return { restored: false, message: error.message || 'Não foi possível restaurar os blocos.' }; }
    }
    try {
      await restore(order, signal);
      return { selected: true, message: 'Blocos ordenados na página.', ...(touched ? { undo } : {}) };
    } catch (error) {
      return { selected: false, message: error.message || 'Não foi possível ordenar os blocos.', ...(touched ? { undo } : {}) };
    }
  }
  function publicImageURL(source) {
    try {
      const url = new view.URL(source, view.location?.href);
      const host = url.hostname.toLowerCase();
      if (source.length > 4096 || url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') ||
          !host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host) ||
          host.endsWith('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
      return url;
    } catch { return null; }
  }
  async function waitForImage(image, signal) {
    aborted(signal);
    if (image.complete) {
      if (!image.naturalWidth || !image.naturalHeight) throw imageError('Uma imagem da questão não carregou. Aguarde a imagem aparecer e tente novamente.');
      return;
    }
    // Lazy images can be below the fold even though their question is ready.
    // Loading the image does not move the page or change the student's answer.
    if ('loading' in image) image.loading = 'eager';
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
        signal.removeEventListener('abort', canceled);
      };
      const loaded = () => {
        cleanup();
        if (image.naturalWidth && image.naturalHeight) resolve();
        else reject(imageError('Uma imagem da questão está vazia ou não pôde ser carregada.'));
      };
      const failed = () => { cleanup(); reject(imageError('Uma imagem da questão não carregou. Não vou responder sem conseguir lê-la.')); };
      const canceled = () => { cleanup(); reject(Object.assign(new Error('Leitura de imagem cancelada.'), { code: 'ABORTED' })); };
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', failed, { once: true });
      signal.addEventListener('abort', canceled, { once: true });
      if (signal.aborted) canceled();
      else if (image.complete) loaded();
    });
  }
  function encodeImage(source) {
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!(width > 0 && height > 0) || width * height > 100000000) throw imageError('Uma imagem é grande demais ou não tem dimensões válidas.');
    const canvas = doc.createElement('canvas');
    for (const maximum of [2000, 1600, 1200]) {
      const ratio = Math.min(1, maximum / width, maximum / height);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw imageError('Este navegador não conseguiu preparar a imagem da questão.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL('image/png');
      if (png.length <= IMAGE_DATA_LIMIT) return png;
      for (const quality of [0.9, 0.78, 0.64]) {
        const jpeg = canvas.toDataURL('image/jpeg', quality);
        if (jpeg.length <= IMAGE_DATA_LIMIT) return jpeg;
      }
    }
    throw imageError('Uma imagem continua grande demais depois da preparação. Nenhuma resposta foi preenchida.');
  }
  async function downloadImage(source, signal, interruptible) {
    const url = new view.URL(source, view.location?.href);
    const response = await interruptible(view.fetch(url.href, {
      signal, mode: 'cors', credentials: url.origin === view.location?.origin ? 'same-origin' : 'omit',
      redirect: 'error', referrerPolicy: 'no-referrer',
    }));
    if (!response.ok) throw imageError('Não foi possível acessar uma imagem da questão.');
    if (!/^image\/(?:png|jpe?g|webp)(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      throw imageError('Uma imagem não está em formato PNG, JPEG ou WebP.');
    }
    const length = Number(response.headers.get('content-length'));
    if (length > IMAGE_DOWNLOAD_LIMIT) {
      try { await interruptible(response.body?.cancel()); } catch { /* Reading is already bounded by its signal. */ }
      throw imageError('Uma imagem excede o limite de 8 MB para leitura.');
    }
    if (!response.body?.getReader) throw imageError('Este navegador não permite preparar esta imagem.');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        aborted(signal);
        const part = await interruptible(reader.read());
        if (part.done) break;
        size += part.value.byteLength;
        if (size > IMAGE_DOWNLOAD_LIMIT) throw imageError('Uma imagem excede o limite de 8 MB para leitura.');
        chunks.push(part.value);
      }
    } catch (error) {
      try { await interruptible(reader.cancel()); } catch { /* Preserve the original failure. */ }
      throw error;
    } finally { reader.releaseLock(); }
    const blob = new view.Blob(chunks, { type: response.headers.get('content-type').split(';')[0] });
    const bitmap = await interruptible(view.createImageBitmap(blob));
    try { return encodeImage(bitmap); }
    finally { bitmap.close(); }
  }
  async function prepareQuestion(question, { signal } = {}) {
    aborted(signal);
    const info = metadata.get(question);
    if (!info || !isCurrent(question)) throw imageError('A questão mudou antes da leitura das imagens. Inicie novamente.');
    const visual = info.visual;
    if (visual?.issue) throw imageError(visual.issue);
    if (!visual?.images.length) return question;
    const controller = new view.AbortController();
    const canceled = () => controller.abort();
    signal?.addEventListener('abort', canceled, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
    const interruptible = operation => new Promise((resolve, reject) => {
      const onAbort = () => reject(Object.assign(new Error('Leitura de imagem cancelada.'), { code: 'ABORTED' }));
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(operation).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', onAbort));
    });
    try {
      const images = [];
      for (const descriptor of visual.images) {
        aborted(controller.signal);
        await interruptible(waitForImage(descriptor.element, controller.signal));
        if (!isCurrent(question)) throw imageError('A imagem da questão mudou durante a leitura. Inicie novamente.');
        let url;
        try { url = encodeImage(descriptor.element); }
        catch (error) {
          aborted(controller.signal);
          // A loaded cross-origin image can taint canvas even when its CDN
          // allows fetch. Fetch only its bytes, never an enclosing page.
          if (error?.name !== 'SecurityError') throw error;
          try { url = await downloadImage(descriptor.url, controller.signal, interruptible); }
          catch (downloadError) {
            aborted(controller.signal);
            const remote = publicImageURL(descriptor.url);
            // An authenticated/same-origin or blob image must be encoded here.
            // A public remote URL can instead be fetched by the vision model.
            if (!remote || remote.origin === view.location?.origin) throw imageError('O navegador bloqueou a leitura de uma imagem. Não vou responder sem conseguir enviá-la.');
            url = remote.href;
          }
        }
        images.push({ url, label: descriptor.label });
      }
      if (!isCurrent(question)) throw imageError('A imagem da questão mudou durante a leitura. Inicie novamente.');
      return { ...question, images };
    } catch (error) {
      if (timedOut) throw imageError('A leitura das imagens demorou mais de 8 segundos. Aguarde as imagens carregarem e tente novamente.');
      aborted(signal);
      if (error?.code === 'ABORTED') throw error;
      if (error?.code === 'IMAGE') throw error;
      throw imageError('Não foi possível preparar uma imagem desta questão. Nenhuma resposta foi preenchida.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', canceled);
      controller.abort();
    }
  }
  function destroy() {
    for (const entry of orderBindings) { entry.controller.abort(); entry.live = false; }
    orderBindings.clear();
  }

  return { scan, isCurrent, apply, prepare, prepareQuestion, destroy };
}
