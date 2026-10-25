// Public bookmarks never contain credentials; the provider key stays on the server.
import { VISION_MODEL, cleanQuestionImages, questionTextSize } from './image-input.js';

export function createHostedClient({ endpoint, token, public: publicAccess = false, fetchImpl = globalThis.fetch, timeoutMs = 45000,
  minIntervalMs = 0, visionIntervalMs = 0, onWait = () => {}, now = Date.now } = {}) {
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('Endereço do servidor inválido. Copie o script novamente no instalador.'); }
  if (url.protocol !== 'https:' || !['/api/solve', '/api/lume/solve'].includes(url.pathname) || url.username || url.password || url.search || url.hash) {
    throw new Error('Endereço do servidor inválido. Copie o script novamente no instalador.');
  }
  function failure(code, message) { return Object.assign(new Error(message), { code }); }
  const boundedInterval = value => Number.isFinite(value) ? Math.max(0, Math.min(60000, value)) : 0;
  let nextRequestAt = 0;
  // Reserve request starts, rather than adding a delay after a response. A
  // slow response already provides spacing; pausing a queued call cancels it.
  async function waitForTurn(signal, interval) {
    const notify = seconds => { try { onWait(seconds); } catch {} };
    while (nextRequestAt > now()) {
      if (signal?.aborted) throw failure('ABORTED', 'Consulta cancelada.');
      const remaining = nextRequestAt - now();
      notify(Math.ceil(remaining / 1000));
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(failure('ABORTED', 'Consulta cancelada.')); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, Math.min(1000, remaining));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    }
    if (signal?.aborted) throw failure('ABORTED', 'Consulta cancelada.');
    nextRequestAt = now() + interval;
    notify(0);
  }
  const messages = {
    AUTH: 'O código de acesso foi recusado. Gere o script novamente no instalador.',
    UNAUTHORIZED: 'O código de acesso foi recusado. Gere o script novamente no instalador.',
    CONFIG: 'A integração de IA do BatataHub ainda não foi configurada no servidor.',
    RATE_LIMIT: 'Limite de consultas atingido. Aguarde um pouco e inicie novamente.',
    MODEL: 'Modelo indisponível. Confira o modelo nos ajustes.',
    INPUT: 'Não foi possível ler esta questão. Confira os seletores nos ajustes.',
    IMAGE: 'Não foi possível ler uma imagem desta questão. Confira se ela carregou e tente novamente.',
    FORMAT: 'O servidor não retornou uma resposta válida. Tente novamente.',
    TIMEOUT: 'A consulta demorou demais. Tente iniciar novamente.',
    ORIGIN: 'Este site não está autorizado a usar o hub hospedado.',
  };
  const textFormatMessages = {
    TRUNCATED: 'A resposta de texto foi interrompida pela IA antes de terminar. Tente novamente.',
    TEXT_LENGTH: 'A IA não respeitou o limite de caracteres desta questão. Nada foi preenchido.',
    TEXT_SHAPE: 'A IA não devolveu o texto no formato solicitado. Nada foi preenchido.',
    METADATA: 'A resposta de texto veio incompleta. Nada foi preenchido.',
    INVALID_JSON: 'A IA devolveu uma resposta de texto ilegível. Tente novamente.',
    ENVELOPE: 'A IA não devolveu uma resposta de texto completa. Tente novamente.',
  };
  function cleanQuestion(question) {
    if (!question || typeof question !== 'object' || Array.isArray(question)
        || typeof question.prompt !== 'string' || !question.prompt.trim() || question.prompt.length > 20000) {
      throw failure('INPUT', messages.INPUT);
    }
    const options = (values, minimum = 2, maximum = 30, maxTextLength = 4000) => {
      if (!Array.isArray(values) || values.length < minimum || values.length > maximum
          || Array.from(values).some(option => typeof option?.text !== 'string' || !option.text.trim() || option.text.length > maxTextLength)) {
        throw failure('INPUT', messages.INPUT);
      }
      return values.map(option => ({ text: option.text }));
    };
    const kind = question.kind === undefined ? 'choice' : question.kind;
    let clean;
    if (kind === 'choice') clean = { prompt: question.prompt, multiple: question.multiple === true, options: options(question.options) };
    else if (kind === 'order') clean = { prompt: question.prompt, kind, options: options(question.options, 2, 60, 1000) };
    else if (kind === 'blanks') {
      if (!Array.isArray(question.fields) || question.fields.length < 1 || question.fields.length > 20) throw failure('INPUT', messages.INPUT);
      clean = { prompt: question.prompt, kind, fields: Array.from(question.fields, field => {
        if (!field || typeof field.label !== 'string' || field.label.length > 1000) throw failure('INPUT', messages.INPUT);
        return { label: field.label, options: options(field.options, 1) };
      }) };
    } else if (kind === 'text') {
      const maxLength = question.maxLength === undefined ? 3000 : question.maxLength;
      const minLength = question.minLength === undefined ? 0 : question.minLength;
      if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 8000
          || !Number.isInteger(minLength) || minLength < 0 || minLength > maxLength) throw failure('INPUT', messages.INPUT);
      clean = { prompt: question.prompt, kind, maxLength, minLength };
    } else throw failure('INPUT', messages.INPUT);
    const images = cleanQuestionImages(question.images);
    if (images?.length) clean.images = images;
    if (questionTextSize(clean) > 32000) throw failure('INPUT', messages.INPUT);
    return clean;
  }
  function cleanAnswer(answer, question) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)
        || typeof answer.explanation !== 'string' || !answer.explanation.trim() || answer.explanation.length > 3000
        || !['high', 'medium', 'low'].includes(answer.confidence)) throw failure('FORMAT', messages.FORMAT);
    const details = { explanation: answer.explanation.trim(), confidence: answer.confidence };
    if (question.kind === 'order') {
      if (!Array.isArray(answer.order) || ('indices' in answer) || ('text' in answer) || ('selections' in answer)
          || (answer.order.length !== 0 && answer.order.length !== question.options.length)
          || new Set(answer.order).size !== answer.order.length
          || answer.order.some(index => !Number.isInteger(index) || index < 0 || index >= question.options.length)) {
        throw failure('FORMAT', messages.FORMAT);
      }
      return { order: [...answer.order], ...details };
    }
    if (question.kind === 'blanks') {
      if (!Array.isArray(answer.selections) || ('indices' in answer) || ('text' in answer) || ('order' in answer)
          || (answer.selections.length !== 0 && answer.selections.length !== question.fields.length)
          || answer.selections.some((index, field) => !Number.isInteger(index) || index < 0 || index >= question.fields[field]?.options.length)) {
        throw failure('FORMAT', messages.FORMAT);
      }
      return { selections: [...answer.selections], ...details };
    }
    if (question.kind === 'text') {
      if (typeof answer.text !== 'string' || ('indices' in answer) || ('selections' in answer) || ('order' in answer)) throw failure('FORMAT', messages.FORMAT);
      const text = answer.text.trim();
      if (text.length > question.maxLength || (text.length > 0 && text.length < question.minLength)) throw failure('FORMAT', messages.FORMAT);
      return { text, ...details };
    }
    if (!Array.isArray(answer.indices) || new Set(answer.indices).size !== answer.indices.length
        || answer.indices.some(index => !Number.isInteger(index) || index < 0 || index >= question.options.length)
        || (!question.multiple && answer.indices.length > 1)) throw failure('FORMAT', messages.FORMAT);
    return { indices: [...answer.indices], ...details };
  }
  async function solve({ question, model = 'openai/gpt-oss-120b', signal } = {}) {
    if (signal?.aborted) throw failure('ABORTED', 'Consulta cancelada.');
    if (!publicAccess && !token) throw failure('INPUT', messages.INPUT);
    const clean = cleanQuestion(question);
    const data = { question: clean, model: clean.images?.length ? VISION_MODEL : model };
    const interval = clean.images?.length
      ? Math.max(boundedInterval(minIntervalMs), Math.min(60000, boundedInterval(visionIntervalMs) * clean.images.length))
      : boundedInterval(minIntervalMs);
    if (nextRequestAt > now()) await waitForTurn(signal, interval);
    else nextRequestAt = now() + interval;
    if (signal?.aborted) throw failure('ABORTED', 'Consulta cancelada.');
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(url.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(!publicAccess ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(data), signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
      });
      let answer;
      try { answer = await response.json(); } catch { throw failure('FORMAT', messages.FORMAT); }
      if (controller.signal.aborted) throw failure('ABORTED', 'Consulta cancelada.');
      if (!response.ok) {
        const code = answer?.error?.code;
        if (code === 'FORMAT' && clean.kind === 'text' && Object.hasOwn(textFormatMessages, answer?.error?.reason)) {
          throw failure('FORMAT', textFormatMessages[answer.error.reason]);
        }
        if (response.status === 429 && code === 'RATE_LIMIT') {
          const rawDelay = response.headers?.get?.('retry-after') || '';
          const seconds = /^\d+$/.test(rawDelay) ? Number(rawDelay) : NaN;
          const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, seconds) : undefined;
          const error = failure('RATE_LIMIT', delay
            ? `Limite de consultas atingido. Aguarde ${delay} s e inicie novamente.` : messages.RATE_LIMIT);
          if (delay) error.retryAfter = delay;
          throw error;
        }
        if (response.status === 401 && code === 'AUTH') throw failure('CONFIG', 'O BatataHub não conseguiu autenticar no serviço de IA. Confira a configuração da integração.');
        if (response.status === 401) throw failure('AUTH', messages.AUTH);
        if (code === 'MODEL' && clean.images?.length) throw failure('MODEL', 'O modelo de leitura de imagens está indisponível. Tente novamente mais tarde.');
        const knownCode = Object.hasOwn(messages, code);
        throw failure(knownCode ? code : 'API', knownCode ? messages[code] : 'O servidor não conseguiu responder. Tente novamente.');
      }
      return cleanAnswer(answer, data.question);
    } catch (error) {
      if (controller.signal.aborted) throw failure(timedOut ? 'TIMEOUT' : 'ABORTED', timedOut ? messages.TIMEOUT : 'Consulta cancelada.');
      if (error?.code && ['AUTH', 'UNAUTHORIZED', 'CONFIG', 'RATE_LIMIT', 'MODEL', 'INPUT', 'IMAGE', 'FORMAT', 'TIMEOUT', 'ORIGIN', 'API'].includes(error.code)) throw error;
      throw failure('NETWORK', 'Não foi possível conectar ao servidor. Confira a conexão; a página pode bloquear consultas externas (CSP/CORS).');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return { solve };
}
