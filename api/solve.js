import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createGroqClient } from '../src/groq-client.js';
import { VISION_MODEL, cleanQuestionImages, questionTextSize } from '../src/image-input.js';

const MAX_TEXT_BODY_BYTES = 48 * 1024;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MODELS = new Set(['openai/gpt-oss-120b', 'openai/gpt-oss-20b', VISION_MODEL]);
const DEFAULT_ORIGIN = 'https://saladofuturo.educacao.sp.gov.br';
const BATATAHUB_ORIGIN = 'https://batata-hub.vercel.app';
// Sala's Application Insights fetch wrapper can add distributed-tracing
// headers. Accept those names without granting access to additional origins.
const CORS_HEADERS = ['Authorization', 'Content-Type', 'Request-Id', 'Request-Context', 'Traceparent', 'Tracestate', 'Baggage'];
const CORS_HEADER_NAMES = new Set(CORS_HEADERS.map(name => name.toLowerCase()));
const LOCAL_ERROR = Symbol('localApiError');

function header(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : '';
}

function apiError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status, [LOCAL_ERROR]: true });
}

function originValue(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function allowedOrigins(env) {
  const configured = typeof env.ALLOWED_ORIGINS === 'string' && env.ALLOWED_ORIGINS.trim();
  const origins = new Set((configured ? configured.split(',') : [DEFAULT_ORIGIN, BATATAHUB_ORIGIN])
    .map(value => originValue(value.trim())).filter(Boolean));
  for (const key of ['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const hostname = env[key];
    // Trust platform configuration, never the caller's Host header.
    if (typeof hostname === 'string' && /^[a-z0-9.-]+$/i.test(hostname)) {
      const origin = originValue(`https://${hostname}`);
      if (origin) origins.add(origin);
    }
  }
  return origins;
}

function authenticated(req, expected) {
  const authorization = header(req, 'authorization');
  if (!authorization || authorization.length > 1100) return false;
  const match = /^Bearer ([^\s]{1,1024})$/i.exec(authorization);
  if (!match) return false;
  // Fixed-size digests keep token length out of the timing comparison.
  const actualDigest = createHash('sha256').update(match[1]).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function requesterIp(req) {
  const normalize = value => {
    if (typeof value !== 'string' || value.length > 256) return '';
    const candidate = value.split(',')[0].trim().toLowerCase();
    if (!/^[0-9a-f:.]{1,45}$/.test(candidate) || !isIP(candidate)) return '';
    return candidate.startsWith('::ffff:') && isIP(candidate.slice(7)) === 4 ? candidate.slice(7) : candidate;
  };
  // Vercel overwrites its dedicated forwarding header. Never store arbitrary
  // header text; local/other runtimes fall back to forwarded-for or the socket.
  const vercelIp = header(req, 'x-vercel-forwarded-for');
  return normalize(vercelIp || header(req, 'x-forwarded-for'))
    || normalize(req.socket?.remoteAddress) || 'unknown';
}

export function createRequestLimiter({ now = Date.now, maxBuckets = 256 } = {}) {
  const capacity = Number.isInteger(maxBuckets) && maxBuckets > 0 ? Math.min(maxBuckets, 256) : 256;
  const buckets = new Map();
  let windowStart = now();
  let windowCount = 0;
  const remaining = (start, current) => Math.max(1, Math.ceil((60000 - (current - start)) / 1000));
  return {
    // Best effort only: memory, counts and IP buckets are local to one warm
    // function instance and reset on cold starts. They are not a global quota.
    consume(ip) {
      const current = now();
      if (current - windowStart >= 60000 || current < windowStart) { windowStart = current; windowCount = 0; }
      for (const [key, bucket] of buckets) {
        if (current - bucket.start >= 60000 || current < bucket.start) buckets.delete(key);
      }
      if (windowCount >= 60) return { allowed: false, retryAfter: remaining(windowStart, current) };
      let bucket = buckets.get(ip);
      if (!bucket) {
        // Refuse extra identities instead of evicting active budgets, which
        // would allow rotating identities to reset another visitor's budget.
        if (buckets.size >= capacity) return { allowed: false, retryAfter: 60 };
        bucket = { start: current, count: 0 };
        buckets.set(ip, bucket);
      }
      if (bucket.count >= 20) return { allowed: false, retryAfter: remaining(bucket.start, current) };
      bucket.count++;
      windowCount++;
      return { allowed: true };
    },
    get size() { return buckets.size; },
  };
}

async function readBody(req) {
  const length = header(req, 'content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw apiError('INPUT', 'O envio da questão com imagens excede o limite de 3 MB.', 413);
  }
  let value = req.rawBody ?? req.body;
  if (value === undefined) {
    value = await new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      const cleanup = () => {
        clearTimeout(timer);
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        req.removeListener('aborted', onAborted);
      };
      const fail = error => { cleanup(); req.resume?.(); reject(error); };
      const onData = chunk => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_BODY_BYTES) return fail(apiError('INPUT', 'O envio da questão com imagens excede o limite de 3 MB.', 413));
        chunks.push(bytes);
      };
      const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks)); };
      const onError = () => fail(apiError('INPUT', 'Não foi possível ler a consulta.'));
      const onAborted = () => fail(apiError('ABORTED', 'Consulta cancelada.', 408));
      const timer = setTimeout(() => fail(apiError('INPUT', 'O envio da consulta demorou demais.', 408)), 10000);
      req.on('data', onData);
      req.once('end', onEnd);
      req.once('error', onError);
      req.once('aborted', onAborted);
      if (req.aborted) onAborted();
      else if (req.readableEnded) onEnd();
    });
  }
  let raw;
  try { raw = Buffer.isBuffer(value) ? value.toString('utf8') : typeof value === 'string' ? value : JSON.stringify(value); }
  catch { throw apiError('INPUT', 'O corpo da consulta precisa ser JSON válido.'); }
  // Vercel may supply an already parsed body; check Content-Length above and
  // the actual raw buffer when available, then also bound its parsed form.
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw apiError('INPUT', 'O envio da questão com imagens excede o limite de 3 MB.', 413);
  }
  const rawSize = Math.max(Buffer.byteLength(raw, 'utf8'), Number(length) || 0);
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch {
    if (rawSize > MAX_TEXT_BODY_BYTES) throw apiError('INPUT', 'O corpo da consulta sem imagens excede o limite de 48 KB.', 413);
    throw apiError('INPUT', 'O corpo da consulta precisa ser JSON válido.');
  }
  // The larger upload budget is reserved for image attachments. Keep the
  // original bound for text-only requests, including parsed Vercel bodies.
  if (rawSize > MAX_TEXT_BODY_BYTES && !(Array.isArray(parsed?.question?.images) && parsed.question.images.length > 0)) {
    throw apiError('INPUT', 'O corpo da consulta sem imagens excede o limite de 48 KB.', 413);
  }
  return parsed;
}

function validateBody(body, env) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || !body.question || typeof body.question !== 'object' || Array.isArray(body.question)) {
    throw apiError('INPUT', 'Envie uma questão com enunciado e campos de resposta.');
  }
  const question = body.question;
  if (typeof question.prompt !== 'string' || !question.prompt.trim() || question.prompt.length > 20000) {
    throw apiError('INPUT', 'A questão precisa ter um enunciado legível de até 20000 caracteres.');
  }
  const cleanOptions = (options, minimum = 2, maximum = 30, maxTextLength = 4000) => {
    if (!Array.isArray(options) || options.length < minimum || options.length > maximum) {
      throw apiError('INPUT', `Cada grupo precisa ter de ${minimum} a ${maximum} alternativas.`);
    }
    return options.map(option => {
      if (!option || typeof option !== 'object' || Array.isArray(option)
          || typeof option.text !== 'string' || !option.text.trim() || option.text.length > maxTextLength) {
        throw apiError('INPUT', `Cada alternativa precisa ter texto legível de até ${maxTextLength} caracteres.`);
      }
      return { text: option.text };
    });
  };
  let cleanQuestion;
  const kind = question.kind === undefined ? 'choice' : question.kind;
  if (kind === 'choice') {
    if (typeof question.multiple !== 'boolean') throw apiError('INPUT', 'A questão de alternativas precisa indicar multiple booleano.');
    // Preserve the existing wire shape for old and explicit choice requests.
    cleanQuestion = { prompt: question.prompt, multiple: question.multiple, options: cleanOptions(question.options) };
  } else if (kind === 'blanks') {
    if (!Array.isArray(question.fields) || question.fields.length < 1 || question.fields.length > 20) {
      throw apiError('INPUT', 'Uma questão de lacunas precisa ter de 1 a 20 campos.');
    }
    const fields = question.fields.map(field => {
      if (!field || typeof field !== 'object' || Array.isArray(field)
          || typeof field.label !== 'string' || field.label.length > 1000) {
        throw apiError('INPUT', 'Cada lacuna precisa ter um rótulo de até 1000 caracteres.');
      }
      return { label: field.label, options: cleanOptions(field.options, 1) };
    });
    cleanQuestion = { kind, prompt: question.prompt, fields };
  } else if (kind === 'order') {
    cleanQuestion = { kind, prompt: question.prompt, options: cleanOptions(question.options, 2, 60, 1000) };
  } else if (kind === 'text') {
    const maxLength = question.maxLength === undefined ? 3000 : question.maxLength;
    const minLength = question.minLength === undefined ? 0 : question.minLength;
    if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 8000
        || !Number.isInteger(minLength) || minLength < 0 || minLength > maxLength) {
      throw apiError('INPUT', 'Os limites da resposta de texto precisam ser inteiros entre 0 e 8000, com máximo maior que zero.');
    }
    cleanQuestion = { kind, prompt: question.prompt, maxLength, minLength };
  } else throw apiError('INPUT', 'Este tipo de questão não é suportado.');
  let images;
  try { images = cleanQuestionImages(question.images); }
  catch { throw apiError('INPUT', 'As imagens da questão são inválidas. Use até 3 imagens PNG, JPEG ou WebP dentro do limite permitido.'); }
  if (images?.length) cleanQuestion.images = images;
  if (questionTextSize(cleanQuestion) > 32000) throw apiError('INPUT', 'A questão é longa demais. Reduza o texto capturado.');
  const configuredModel = env.GROQ_MODEL || 'openai/gpt-oss-120b';
  if (!MODELS.has(configuredModel)) throw apiError('CONFIG', 'O serviço está com um modelo indisponível na configuração.', 503);
  let model = body.model === undefined ? configuredModel : body.model;
  if (typeof model !== 'string' || !MODELS.has(model)) throw apiError('MODEL', 'Escolha um dos modelos permitidos nos ajustes do hub.');
  if (images?.length) {
    const visionModel = env.GROQ_VISION_MODEL || VISION_MODEL;
    if (visionModel !== VISION_MODEL) throw apiError('CONFIG', 'O serviço está com um modelo de imagens indisponível na configuração.', 503);
    model = visionModel;
  }
  return { question: cleanQuestion, model };
}

function projectAnswer(answer, question) {
  const invalid = () => apiError('FORMAT', 'O serviço retornou uma resposta inválida. Nenhum campo foi preenchido.', 502);
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)
      || typeof answer.explanation !== 'string' || !answer.explanation.trim() || answer.explanation.length > 3000
      || !['high', 'medium', 'low'].includes(answer.confidence)) throw invalid();
  const common = { explanation: answer.explanation.trim(), confidence: answer.confidence };
  if (question.kind === 'text') {
    if (typeof answer.text !== 'string') throw invalid();
    const text = answer.text.trim();
    if (text.length > question.maxLength || (text.length > 0 && text.length < question.minLength)) throw invalid();
    return { text, ...common };
  }
  if (question.kind === 'blanks') {
    if (!Array.isArray(answer.selections)
        || (answer.selections.length !== 0 && answer.selections.length !== question.fields.length)
        || answer.selections.some((index, field) => !Number.isInteger(index) || index < 0 || index >= question.fields[field].options.length)) throw invalid();
    return { selections: [...answer.selections], ...common };
  }
  if (question.kind === 'order') {
    if (!Array.isArray(answer.order)
        || (answer.order.length !== 0 && answer.order.length !== question.options.length)
        || new Set(answer.order).size !== answer.order.length
        || answer.order.some(index => !Number.isInteger(index) || index < 0 || index >= question.options.length)) throw invalid();
    return { order: [...answer.order], ...common };
  }
  if (!Array.isArray(answer.indices) || new Set(answer.indices).size !== answer.indices.length
      || answer.indices.some(index => !Number.isInteger(index) || index < 0 || index >= question.options.length)
      || (!question.multiple && answer.indices.length > 1)) throw invalid();
  return { indices: [...answer.indices], ...common };
}

function publicFailure(error) {
  if (error?.[LOCAL_ERROR]) {
    return { status: error.status, code: error.code, message: error.message };
  }
  const known = {
    AUTH: [401, 'O BatataHub não conseguiu autenticar no serviço de IA. Verifique a configuração do servidor.'],
    RATE_LIMIT: [429, 'Limite de consultas atingido. Aguarde um pouco e tente novamente.'],
    TIMEOUT: [504, 'O BatataHub demorou demais para responder. Tente novamente.'],
    NETWORK: [502, 'O BatataHub não conseguiu conectar ao serviço de IA. Tente novamente.'],
    FORMAT: [502, 'O serviço de IA retornou uma resposta inválida. Nenhuma alternativa foi marcada.'],
    INPUT: [400, 'A questão enviada não pôde ser processada. Confira o enunciado e as alternativas.'],
    IMAGE: [422, 'Não foi possível ler as imagens desta questão. Confira se elas carregaram e tente novamente.'],
    MODEL: [400, 'O modelo selecionado está indisponível. Tente o outro modelo permitido.'],
    ABORTED: [408, 'Consulta cancelada.'],
  };
  const [status, message] = known[error?.code] || [502, 'Não foi possível consultar o serviço de IA do BatataHub. Tente novamente.'];
  const retryAfter = error?.code === 'RATE_LIMIT'
    ? (Number.isFinite(error.retryAfter) && error.retryAfter > 0 ? Math.min(86400, Math.ceil(error.retryAfter)) : 60)
    : undefined;
  return { status, code: known[error?.code] ? error.code : 'API', message, retryAfter };
}

export function createSolveHandler({ env = process.env, client = createGroqClient(), now = Date.now } = {}) {
  const limiter = createRequestLimiter({ now });
  // Best effort within a warm function instance, never a distributed quota.
  // Store only the exact request digest and its validated public answer.
  const answers = new Map();
  const pending = new Map();
  const cooldowns = new Map();
  const cacheTtl = 30 * 60 * 1000;
  const cancelled = () => Object.assign(new Error('Consulta cancelada.'), { code: 'ABORTED' });
  const limited = seconds => Object.assign(new Error('Limite de consultas atingido.'), { code: 'RATE_LIMIT', retryAfter: seconds });

  function prune(current) {
    for (const [key, entry] of answers) {
      if (current < entry.createdAt || current >= entry.expiresAt) answers.delete(key);
    }
    for (const [model, entry] of cooldowns) {
      if (current < entry.startedAt || current >= entry.until) cooldowns.delete(model);
    }
  }

  function hasAnswer(answer, question) {
    if (question.kind === 'text') return Boolean(answer.text);
    if (question.kind === 'blanks') return answer.selections.length > 0;
    if (question.kind === 'order') return answer.order.length > 0;
    return answer.indices.length > 0;
  }

  async function sharedSolve({ question, model, signal }) {
    if (signal.aborted) throw cancelled();
    const current = now();
    prune(current);
    const key = createHash('sha256').update(JSON.stringify({ model, question })).digest('hex');
    const cached = answers.get(key);
    if (cached) {
      answers.delete(key);
      answers.set(key, cached);
      return cached.answer;
    }

    let entry = pending.get(key);
    if (entry?.controller.signal.aborted) {
      pending.delete(key);
      entry = undefined;
    }
    if (!entry) {
      const cooldown = cooldowns.get(model);
      if (cooldown) throw limited(Math.max(1, Math.ceil((cooldown.until - current) / 1000)));
      // Upstream calls normally time out after 35 seconds. Bound outstanding
      // work too, including clients that fail to honor that timeout.
      if (pending.size >= 64) throw limited(60);
      entry = { controller: new AbortController(), waiters: 0, settled: false, promise: null };
      pending.set(key, entry);
      const work = entry;
      work.promise = Promise.resolve().then(async () => {
        if (work.controller.signal.aborted) throw cancelled();
        const raw = await client.solve({ apiKey: env.GROQ_API_KEY, question, model, signal: work.controller.signal });
        if (work.controller.signal.aborted) throw cancelled();
        const answer = projectAnswer(raw, question);
        if (work.waiters > 0 && hasAnswer(answer, question)) {
          const completedAt = now();
          prune(completedAt);
          answers.delete(key);
          answers.set(key, { answer, createdAt: completedAt, expiresAt: completedAt + cacheTtl });
          while (answers.size > 64) answers.delete(answers.keys().next().value);
        }
        return answer;
      }).catch(error => {
        if (error?.code === 'RATE_LIMIT') {
          const startedAt = now();
          const seconds = publicFailure(error).retryAfter;
          const previous = cooldowns.get(model);
          cooldowns.set(model, { startedAt, until: Math.max(previous?.until || 0, startedAt + seconds * 1000) });
        }
        throw error;
      }).finally(() => {
        work.settled = true;
        if (pending.get(key) === work) pending.delete(key);
      });
    }

    // A disconnected visitor releases only its own waiter. Other visitors
    // awaiting this exact request keep the single upstream call alive.
    const work = entry;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (settle, value) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', onAbort);
        work.waiters--;
        if (work.waiters === 0 && !work.settled) {
          work.controller.abort();
          if (pending.get(key) === work) pending.delete(key);
        }
        settle(value);
      };
      const onAbort = () => finish(reject, cancelled());
      work.waiters++;
      work.promise.then(value => finish(resolve, value), error => finish(reject, error));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }

  return async function solveHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      res.statusCode = status;
      if (body === undefined) return res.end();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    const reject = (status, code, message) => send(status, { error: { code, message } });
    const origin = header(req, 'origin');
    const allowed = origin && originValue(origin) === origin && allowedOrigins(env).has(origin);
    if ((origin && !allowed) || (req.headers?.origin && typeof req.headers.origin !== 'string')) {
      return reject(403, 'ORIGIN', 'Esta origem não está autorizada a usar o serviço.');
    }
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS.join(', '));
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    }
    const method = String(req.method || '').toUpperCase();
    if (method === 'OPTIONS') {
      if (!allowed) return reject(403, 'ORIGIN', 'Uma origem autorizada é necessária para esta solicitação.');
      const requestedMethod = header(req, 'access-control-request-method');
      const requestedHeaders = header(req, 'access-control-request-headers').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if ((requestedMethod && requestedMethod.toUpperCase() !== 'POST') || requestedHeaders.some(value => !CORS_HEADER_NAMES.has(value))) {
        return reject(403, 'ORIGIN', 'Esta solicitação de acesso não é permitida.');
      }
      res.setHeader('Access-Control-Max-Age', '600');
      return send(204);
    }
    if (method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return reject(405, 'METHOD', 'Use POST para enviar uma questão.');
    }
    const publicHub = env.PUBLIC_HUB === 'true';
    if (typeof env.GROQ_API_KEY !== 'string' || !env.GROQ_API_KEY.trim()
        || (!publicHub && (typeof env.HUB_ACCESS_TOKEN !== 'string' || !env.HUB_ACCESS_TOKEN))) {
      return reject(503, 'CONFIG', 'O serviço ainda não está configurado.');
    }
    if (!publicHub && !authenticated(req, env.HUB_ACCESS_TOKEN)) return reject(401, 'UNAUTHORIZED', 'Acesso não autorizado.');
    const contentType = header(req, 'content-type');
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*["']?utf-8["']?)?\s*$/i.test(contentType)) {
      return reject(415, 'INPUT', 'Envie o corpo com Content-Type: application/json.');
    }
    const budget = limiter.consume(requesterIp(req));
    if (!budget.allowed) {
      res.setHeader('Retry-After', String(budget.retryAfter));
      return reject(429, 'RATE_LIMIT', 'Limite de consultas atingido. Aguarde um minuto e tente novamente.');
    }
    const controller = new AbortController();
    const onAborted = () => controller.abort();
    const onClosed = () => { if (!res.writableEnded) controller.abort(); };
    req.once?.('aborted', onAborted);
    res.once?.('close', onClosed);
    if (req.aborted) controller.abort();
    try {
      const { question, model } = validateBody(await readBody(req), env);
      const answer = await sharedSolve({ question, model, signal: controller.signal });
      return send(200, answer);
    } catch (error) {
      const safe = publicFailure(error);
      if (safe.retryAfter) res.setHeader('Retry-After', String(safe.retryAfter));
      return reject(safe.status, safe.code, safe.message);
    } finally {
      req.removeListener?.('aborted', onAborted);
      res.removeListener?.('close', onClosed);
    }
  };
}

export default createSolveHandler();
