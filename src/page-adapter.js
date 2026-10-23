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
      if (item.hidden || item.getAttribute('aria-hidden') === 'true') return false;
      const style = view?.getComputedStyle(item);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')) return false;
    }
    return true;
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
    const readableLabel = labels.find(label => normalize(label.textContent));
    if (readableLabel) return readableLabel;
    if (!native(element)) return element;
    // Sala's MUI label contains only the radio icon; the statement is in a
    // sibling div. Include their shared row, without crossing another choice.
    if (element.closest(MUI_CONTROL)) {
      let row = element.parentElement;
      for (let level = 0; row && level < 6; level++, row = row.parentElement) {
        if (row.matches('body,html,form,fieldset,[role="radiogroup"]') || choiceControls(row).length !== 1) break;
        if (normalize(row.textContent)) return row;
      }
    }
    if (labels.length) return labels[0];
    const candidate = element.closest('li,.option,.answer,.choice,.alternative,.alternativa,.MuiFormControlLabel-root');
    if (candidate && candidate.querySelectorAll(CONTROL).length === 1) return candidate;
    const parent = element.parentElement;
    return parent && parent.querySelectorAll(CONTROL).length === 1 ? parent : element;
  }
  function optionText(element) {
    const explicit = normalize(element.getAttribute('aria-label'));
    if (explicit) return explicit;
    const labels = labelsFor(element).filter(label => visible(label));
    const labelText = normalize(labels.map(label => label.textContent).join(' '));
    if (labelText) return labelText;
    const wrapper = optionWrapper(element);
    if (wrapper !== element || !native(element)) return normalize(wrapper.textContent);
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
    if (!normalize(row.textContent)) return null;
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
  function scan(config = {}) {
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
      const options = members.map((element, index) => ({ index, text: optionText(element), element, type: typeOf(element) }));
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
      if (!prompt) {
        warnings.push('Um grupo sem enunciado legível foi ignorado. Configure o seletor do enunciado.');
        continue;
      }
      if (prompt.length > 16000 || options.some(option => option.text.length > 6000)) {
        warnings.push('Um bloco muito amplo foi ignorado. Configure o seletor da questão.');
        continue;
      }
      if (root.querySelector('img,canvas,svg image,video')) warnings.push('Há conteúdo visual na página; imagens e gráficos não são enviados ao modelo.');
      const fingerprint = JSON.stringify([prompt, options.map(option => [option.text, option.type])]);
      const question = { id: `q-${key}`, prompt, options, multiple: options.every(option => option.type === 'checkbox'), element: root, fingerprint };
      metadata.set(question, { settings, key, root, members: [...members], fingerprint });
      questions.push(question);
    }
    return { questions, warnings: [...new Set(warnings)] };
  }
  function isCurrent(question) {
    const previous = metadata.get(question);
    if (!previous || !previous.root.isConnected || previous.members.some(element => !element.isConnected)) return false;
    const current = scan(previous.settings).questions.find(candidate => candidate.id === `q-${previous.key}`);
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
  async function apply(question, indices, { signal } = {}) {
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
  return { scan, isCurrent, apply };
}
