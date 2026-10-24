// Shared wire validation. Images are forwarded to Groq, never fetched by the API.
export const VISION_MODEL = 'qwen/qwen3.8-27b';
export const MAX_QUESTION_IMAGES = 3;
export const MAX_IMAGE_URL_CHARS = 700000;

export function cleanQuestionImages(images) {
  if (images === undefined) return undefined;
  const invalid = message => { throw Object.assign(new Error(message), { code: 'INPUT' }); };
  if (!Array.isArray(images) || images.length > MAX_QUESTION_IMAGES) {
    invalid('Envie no máximo três imagens por questão.');
  }
  return Array.from(images, image => {
    if (!image || typeof image !== 'object' || Array.isArray(image)
        || typeof image.label !== 'string' || !image.label.trim() || image.label.length > 300
        || typeof image.url !== 'string' || !image.url || image.url.length > MAX_IMAGE_URL_CHARS) {
      invalid('Uma imagem está sem identificação ou excede o tamanho permitido.');
    }
    const { url } = image;
    if (url.startsWith('data:')) {
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
      if (!match || match[2].length % 4 !== 0) invalid('A imagem precisa ser PNG, JPEG ou WebP válido.');
      let prefix = '';
      try { prefix = atob(match[2].slice(0, 32)); } catch { invalid('Não foi possível ler os dados da imagem.'); }
      const format = match[1];
      const valid = format === 'png' ? prefix.startsWith('\x89PNG\r\n\x1a\n')
        : format === 'jpeg' ? prefix.startsWith('\xff\xd8\xff')
          : prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP';
      if (!valid) invalid('Os dados da imagem não correspondem ao formato informado.');
    } else {
      let parsed;
      try { parsed = new URL(url); } catch { invalid('O endereço da imagem é inválido.'); }
      const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
      if (url.length > 4096 || parsed.protocol !== 'https:' || parsed.username || parsed.password
          || (parsed.port && parsed.port !== '443') || parsed.hash
          || !/^[a-z0-9.-]+$/.test(hostname) || !hostname.includes('.')
          || /^[\d.]+$/.test(hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(hostname)
          || hostname === 'metadata.google.internal') {
        invalid('Use uma imagem HTTPS pública ou uma imagem incorporada válida.');
      }
    }
    return { url, label: image.label.trim() };
  });
}

// Keep the original text budget without charging encoded pixels as text tokens.
export function questionTextSize(question) {
  if (!question.images?.length) return JSON.stringify(question).length;
  return JSON.stringify({ ...question, images: question.images.map(({ url, label }) => ({
    label, url: url.startsWith('data:') ? '[dados da imagem]' : url,
  })) }).length;
}
