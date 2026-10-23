import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createGroqClient } from '../src/groq-client.js';

const MAX_BODY_BYTES = 48 * 1024;
const MODELS = new Set(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
const DEFAULT_ORIGIN = 'https://saladofuturo.educacao.sp.gov.br';
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
  const origins = new Set((configured ? configured.split(',') : [DEFAULT_ORIGIN])
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
    throw apiError('INPUT', 'O corpo da consulta excede o limite de 48 KB.', 413);
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
        if (size > MAX_BODY_BYTES) return fail(apiError('INPUT', 'O corpo da consulta excede o limite de 48 KB.', 413));
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
    throw apiError('INPUT', 'O corpo da consulta excede o limite de 48 KB.', 413);
  }
  try { return JSON.parse(raw); }
  catch { throw apiError('INPUT', 'O corpo da consulta precisa ser JSON válido.'); }
}

function validateBody(body, env) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || !body.question || typeof body.question !== 'object' || Array.isArray(body.question)) {
    throw apiError('INPUT', 'Envie uma questão com enunciado e alternativas.');
  }
  const question = body.question;
  if (typeof question.prompt !== 'string' || !question.prompt.trim() || question.prompt.length > 20000
      || typeof question.multiple !== 'boolean' || !Array.isArray(question.options)
      || question.options.length < 2 || question.options.length > 30) {
    throw apiError('INPUT', 'A questão precisa ter um enunciado válido, multiple booleano e de 2 a 30 alternativas.');
  }
  const options = question.options.map(option => {
    if (!option || typeof option.text !== 'string' || !option.text.trim() || option.text.length > 4000) {
      throw apiError('INPUT', 'Cada alternativa precisa ter texto legível de até 4000 caracteres.');
    }
    return { text: option.text };
  });
  const cleanQuestion = { prompt: question.prompt, multiple: question.multiple, options };
  if (JSON.stringify(cleanQuestion).length > 32000) throw apiError('INPUT', 'A questão é longa demais. Reduza o texto capturado.');
  const configuredModel = env.GROQ_MODEL || 'openai/gpt-oss-120b';
  if (!MODELS.has(configuredModel)) throw apiError('CONFIG', 'O serviço está com um modelo indisponível na configuração.', 503);
  const model = body.model === undefined ? configuredModel : body.model;
  if (typeof model !== 'string' || !MODELS.has(model)) throw apiError('MODEL', 'Escolha um dos modelos permitidos: openai/gpt-oss-120b ou openai/gpt-oss-20b.');
  return { question: cleanQuestion, model };
}

function publicFailure(error) {
  if (error?.[LOCAL_ERROR]) {
    return { status: error.status, code: error.code, message: error.message };
  }
  const known = {
    AUTH: [401, 'O serviço não conseguiu autenticar na Groq. Verifique a configuração do servidor.'],
    RATE_LIMIT: [429, 'Limite de consultas atingido. Aguarde um pouco e tente novamente.'],
    TIMEOUT: [504, 'A Groq demorou demais para responder. Tente novamente.'],
    NETWORK: [502, 'O serviço não conseguiu conectar à Groq. Tente novamente.'],
    FORMAT: [502, 'A Groq retornou uma resposta inválida. Nenhuma alternativa foi marcada.'],
    INPUT: [400, 'A questão enviada não pôde ser processada. Confira o enunciado e as alternativas.'],
    MODEL: [400, 'O modelo selecionado está indisponível. Tente o outro modelo permitido.'],
    ABORTED: [408, 'Consulta cancelada.'],
  };
  const [status, message] = known[error?.code] || [502, 'Não foi possível consultar a Groq. Tente novamente.'];
  return { status, code: known[error?.code] ? error.code : 'API', message };
}

export function createSolveHandler({ env = process.env, client = createGroqClient(), now = Date.now } = {}) {
  const limiter = createRequestLimiter({ now });

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
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
    const method = String(req.method || '').toUpperCase();
    if (method === 'OPTIONS') {
      if (!allowed) return reject(403, 'ORIGIN', 'Uma origem autorizada é necessária para esta solicitação.');
      const requestedMethod = header(req, 'access-control-request-method');
      const requestedHeaders = header(req, 'access-control-request-headers').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if ((requestedMethod && requestedMethod.toUpperCase() !== 'POST') || requestedHeaders.some(value => !['authorization', 'content-type'].includes(value))) {
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
      const answer = await client.solve({ apiKey: env.GROQ_API_KEY, question, model, signal: controller.signal });
      return send(200, { indices: answer.indices, explanation: answer.explanation, confidence: answer.confidence });
    } catch (error) {
      const safe = publicFailure(error);
      return reject(safe.status, safe.code, safe.message);
    } finally {
      req.removeListener?.('aborted', onAborted);
      res.removeListener?.('close', onClosed);
    }
  };
}

export default createSolveHandler();
