// Public bookmarks never contain credentials; the Groq key stays on the server.
export function createHostedClient({ endpoint, token, public: publicAccess = false, fetchImpl = globalThis.fetch, timeoutMs = 45000 } = {}) {
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('Endereço do servidor inválido. Copie o script novamente no instalador.'); }
  if (url.protocol !== 'https:' || url.pathname !== '/api/solve' || url.username || url.password || url.search || url.hash) {
    throw new Error('Endereço do servidor inválido. Copie o script novamente no instalador.');
  }
  function failure(code, message) { return Object.assign(new Error(message), { code }); }
  const messages = {
    AUTH: 'O código de acesso foi recusado. Gere o script novamente no instalador.',
    UNAUTHORIZED: 'O código de acesso foi recusado. Gere o script novamente no instalador.',
    CONFIG: 'A integração com a Groq ainda não foi configurada no servidor.',
    RATE_LIMIT: 'Limite de consultas atingido. Aguarde um pouco e inicie novamente.',
    MODEL: 'Modelo indisponível. Confira o modelo nos ajustes.',
    INPUT: 'Não foi possível ler esta questão. Confira os seletores nos ajustes.',
    FORMAT: 'O servidor não retornou uma resposta válida. Tente novamente.',
    TIMEOUT: 'A consulta demorou demais. Tente iniciar novamente.',
    ORIGIN: 'Este site não está autorizado a usar o hub hospedado.',
  };
  async function solve({ question, model = 'openai/gpt-oss-120b', signal } = {}) {
    if (signal?.aborted) throw failure('ABORTED', 'Consulta cancelada.');
    if ((!publicAccess && !token) || !question || typeof question.prompt !== 'string' || !Array.isArray(question.options)) throw failure('INPUT', messages.INPUT);
    const data = { question: { prompt: question.prompt, multiple: question.multiple === true, options: question.options.map(option => ({ text: option.text })) }, model };
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
        if (response.status === 429 && code === 'RATE_LIMIT') {
          const rawDelay = response.headers?.get?.('retry-after') || '';
          const seconds = /^\d+$/.test(rawDelay) ? Number(rawDelay) : NaN;
          const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, seconds) : undefined;
          const error = failure('RATE_LIMIT', delay
            ? `Limite de consultas atingido. Aguarde ${delay} s e inicie novamente.` : messages.RATE_LIMIT);
          if (delay) error.retryAfter = delay;
          throw error;
        }
        if (response.status === 401 && code === 'AUTH') throw failure('CONFIG', 'O servidor não conseguiu autenticar na Groq. Confira a configuração da integração.');
        if (response.status === 401) throw failure('AUTH', messages.AUTH);
        const knownCode = Object.hasOwn(messages, code);
        throw failure(knownCode ? code : 'API', knownCode ? messages[code] : 'O servidor não conseguiu responder. Tente novamente.');
      }
      if (!Array.isArray(answer?.indices) || new Set(answer.indices).size !== answer.indices.length ||
          answer.indices.some(index => !Number.isInteger(index) || index < 0 || index >= data.question.options.length) ||
          (!data.question.multiple && answer.indices.length > 1) || typeof answer.explanation !== 'string' ||
          !answer.explanation.trim() || answer.explanation.length > 3000 || !['high', 'medium', 'low'].includes(answer.confidence)) {
        throw failure('FORMAT', messages.FORMAT);
      }
      return { indices: answer.indices, explanation: answer.explanation.trim(), confidence: answer.confidence };
    } catch (error) {
      if (controller.signal.aborted) throw failure(timedOut ? 'TIMEOUT' : 'ABORTED', timedOut ? messages.TIMEOUT : 'Consulta cancelada.');
      if (error?.code && ['AUTH', 'UNAUTHORIZED', 'CONFIG', 'RATE_LIMIT', 'MODEL', 'INPUT', 'FORMAT', 'TIMEOUT', 'ORIGIN', 'API'].includes(error.code)) throw error;
      throw failure('NETWORK', 'Não foi possível conectar ao servidor. Confira a conexão; a página pode bloquear consultas externas (CSP/CORS).');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return { solve };
}
