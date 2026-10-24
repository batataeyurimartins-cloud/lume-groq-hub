import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuestionImages, questionTextSize, VISION_MODEL } from '../src/image-input.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1sAAAAASUVORK5CYII=';
const rejects = images => assert.throws(() => cleanQuestionImages(images), { code: 'INPUT' });

test('image projection preserves original bytes and strips DOM or credential fields', () => {
  assert.equal(VISION_MODEL, 'qwen/qwen3.8-27b');
  assert.equal(cleanQuestionImages(undefined), undefined);
  assert.deepEqual(cleanQuestionImages([]), []);
  assert.deepEqual(cleanQuestionImages([{ url: png, label: '  Imagem do enunciado 1 ', element: {}, apiKey: 'discarded' }]), [{ url: png, label: 'Imagem do enunciado 1' }]);
  const signed = 'https://cdn.example.com/chart.png?signature=question-only';
  assert.deepEqual(cleanQuestionImages([{ url: signed, label: 'Gráfico' }]), [{ url: signed, label: 'Gráfico' }]);
});

test('invalid or excessive image inputs cannot enter a provider request', () => {
  for (const images of [null, {}, [{ url: png }], [{ url: png, label: '' }],
    Array.from({ length: 4 }, () => ({ url: png, label: 'Imagem' })),
    [{ url: png, label: 'x'.repeat(301) }],
    [{ url: 'data:image/png;base64,' + 'A'.repeat(700000), label: 'Imagem' }]]) rejects(images);
  for (const url of ['http://cdn.example.com/chart.png', 'https://localhost/chart.png',
    'https://127.0.0.1/chart.png', 'https://2130706433/chart.png', 'https://[::1]/chart.png',
    'https://metadata.google.internal/x', 'https://cdn.local/x', 'https://example.test/x',
    'https://user:password@cdn.example.com/x', 'https://cdn.example.com:8443/x',
    'https://cdn.example.com/x#private', 'blob:https://example.com/id', 'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,AAAA',
    'data:image/jpeg;base64,iVBORw0KGgo=', 'data:image/png;base64,iVBORw0KGgo!']) {
    rejects([{ url, label: 'Imagem' }]);
  }
});

test('encoded pixels do not inflate the text budget while image labels and remote URLs do', () => {
  const small = { prompt: 'Leia o gráfico.', images: [{ url: png, label: 'Gráfico' }] };
  const large = { ...small, images: [{ url: png + 'A'.repeat(500000), label: 'Gráfico' }] };
  assert.equal(questionTextSize(small), questionTextSize(large));
  assert.equal(questionTextSize({ prompt: 'Texto' }), JSON.stringify({ prompt: 'Texto' }).length);
  assert.ok(questionTextSize({ ...small, images: [{ url: 'https://cdn.example.com/' + 'x'.repeat(500), label: 'Gráfico' }] }) > questionTextSize(small));
});
