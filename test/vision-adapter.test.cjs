const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {salaOrderActivity}=require('./fixtures/sala-order.cjs');
const source=readFileSync(path.join(__dirname,'../src/page-adapter.js'),'utf8').replace('export function createPageAdapter','window.createPageAdapter = function createPageAdapter');
let browser,png,otherPng;
before(async()=>{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  [png,otherPng]=await page.evaluate(()=>['#e83d40','#3671e8'].map(color=>{
    const canvas=document.createElement('canvas');canvas.width=420;canvas.height=220;
    const context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,420,220);
    context.fillStyle='#fff';context.font='36px sans-serif';context.fillText('42',170,125);
    return canvas.toDataURL('image/png');
  }));
  await page.close();
});
after(async()=>{await browser?.close();});
async function pageWith(html,{imageHeaders={},imageUrl='https://images.example.com/chart.png'}={}) {
  const page=await browser.newPage();page.setDefaultTimeout(5000);
  await page.route('https://activity.example.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  await page.route(imageUrl,route=>route.fulfill({contentType:'image/png',headers:imageHeaders,body:Buffer.from(png.split(',')[1],'base64')}));
  await page.goto('https://activity.example.com/atividade/123');
  await page.addScriptTag({content:source});
  return page;
}
const choices=(image='')=>`<fieldset><legend>Observe o gráfico e escolha uma alternativa.</legend>${image}<label><input type="radio" name="answer">Quarenta e dois</label><label><input type="radio" name="answer">Vinte e um</label></fieldset>`;

test('unnamed Sala MUI SINGLE and MULTI image-only option rows remain a complete answer group',async()=>{
  for(const kind of ['radio','checkbox']){
    const row=(url,index)=>`<div class="MuiBox-root option-card"><div class="MuiBox-root option-row"><label class="MuiFormControlLabel-root"><span class="MuiButtonBase-root Mui${kind==='radio'?'Radio':'Checkbox'}-root"><input type="${kind}" value="${index}"><svg aria-hidden="true" width="16" height="16"><path d="M0 0"></path></svg></span></label><div class="MuiBox-root"><div class="main"><img alt="Figura ${index+1}" src="${url}"></div></div></div></div>`;
    const page=await pageWith(`<article class="MuiPaper-root MuiPaper-elevation3"><div class="main"><p>Selecione a figura vermelha.</p></div><div class="MuiBox-root choice-list">${row(otherPng,0)}${row(png,1)}</div></article>`);
    try{
      const result=await page.evaluate(async()=>{const adapter=createPageAdapter();const {questions,warnings}=adapter.scan();const question=questions[0];if(!question)return {count:questions.length,warnings};const prepared=await adapter.prepareQuestion(question);const marked=await adapter.apply(question,[1]);return {count:questions.length,warnings,multiple:question.multiple,options:question.options.map(option=>option.text),labels:prepared.images.map(image=>image.label),marked:marked.selected,selected:[...document.querySelectorAll('input:checked')].map(input=>input.value)};});
      assert.equal(result.count,1);assert.deepEqual(result.warnings,[]);assert.equal(result.multiple,kind==='checkbox');
      assert.deepEqual(result.options,['[Imagem da alternativa 1]','[Imagem da alternativa 2]']);
      assert.deepEqual(result.labels,['Alternativa 1 · imagem 1: Figura 1','Alternativa 2 · imagem 1: Figura 2']);
      assert.equal(result.marked,true);assert.deepEqual(result.selected,['1']);
    }finally{await page.close();}
  }
});

test('question image and image-only alternatives retain their labels and prepare actual pixels without unrelated images',async()=>{
  const page=await pageWith(`<img alt="Logo fora da questão" src="${png}"><div role="presentation"><article class="MuiPaper-root MuiPaper-elevation3"><h6>Questão 01 de 01</h6><div class="main"><p>Escolha a figura vermelha.</p></div><img class="MuiCardMedia-root" alt="Gráfico do enunciado" src="${png}"><div class="MuiFormGroup-root" role="radiogroup"><label><input type="radio" name="a"><img alt="Figura azul" src="${otherPng}"></label><label><input type="radio" name="a"><img alt="Figura vermelha" src="${png}"></label></div><div class="MuiAvatar-root"><img alt="Avatar" src="${png}"></div></article></div>`);
  try{
    const result=await page.evaluate(async()=>{
      const adapter=createPageAdapter();const {questions,warnings}=adapter.scan();const question=questions[0];
      const prepared=await adapter.prepareQuestion(question);
      const selected=await adapter.apply(question,[1]);
      return {count:questions.length,warnings,options:question.options.map(option=>option.text),labels:prepared.images.map(image=>image.label),
        pixels:prepared.images.map(image=>({keys:Object.keys(image).sort(),png:image.url.startsWith('data:image/png;base64,'),size:image.url.length})),
        current:adapter.isCurrent(question),selected:selected.selected,checked:document.querySelectorAll('input:checked').length};
    });
    assert.equal(result.count,1);assert.deepEqual(result.warnings,[]);
    assert.deepEqual(result.options,['[Imagem da alternativa 1]','[Imagem da alternativa 2]']);
    assert.deepEqual(result.labels,['Imagem do enunciado 1: Gráfico do enunciado','Alternativa 1 · imagem 1: Figura azul','Alternativa 2 · imagem 1: Figura vermelha']);
    assert.ok(result.pixels.every(image=>image.png&&image.size>100&&image.size<=700000));
    assert.ok(result.pixels.every(image=>JSON.stringify(image.keys)===JSON.stringify(['label','url'])));
    assert.equal(result.current,true);assert.equal(result.selected,true);assert.equal(result.checked,1);
  }finally{await page.close();}
});

test('an image-only enunciado becomes a readable image question and source/alt changes invalidate pending marking',async()=>{
  const page=await pageWith(`<fieldset><div data-question-text><img alt="Enunciado fotografado" src="${png}"></div><label><input type="radio" name="q">A</label><label><input type="radio" name="q">B</label></fieldset>`);
  try{
    const result=await page.evaluate(async replacement=>{
      const adapter=createPageAdapter();const question=adapter.scan().questions[0];const prepared=await adapter.prepareQuestion(question);
      document.querySelector('img').alt='Outra fotografia';
      const altChanged=!adapter.isCurrent(question);const next=adapter.scan().questions[0];
      document.querySelector('img').src=replacement;
      return {prompt:prepared.prompt,images:prepared.images.length,altChanged,sourceChanged:!adapter.isCurrent(next),marked:(await adapter.apply(next,[0])).selected};
    },otherPng);
    assert.match(result.prompt,/imagem do enunciado/i);assert.equal(result.images,1);assert.equal(result.altChanged,true);assert.equal(result.sourceChanged,true);assert.equal(result.marked,false);
  }finally{await page.close();}
});

test('text, blank and CLOUD questions attach images and reject changed visual context',async()=>{
  const html=`<div class="question" id="text"><p data-question-text>Descreva o número da imagem.</p><img alt="Número" src="${png}"><textarea placeholder="Responder"></textarea></div><div class="question" id="blanks"><p data-question-text>Complete o número da imagem: <select><option>42</option><option>21</option></select>.</p><img alt="Número" src="${png}"></div>`;
  const page=await pageWith(html);
  try{
    const result=await page.evaluate(async()=>{
      const adapter=createPageAdapter();await adapter.prepare();const questions=adapter.scan().questions;
      const results=[];
      for(const question of questions){const prepared=await adapter.prepareQuestion(question);question.element.querySelector('img').alt+=' alterado';results.push({kind:question.kind,images:prepared.images.length,current:adapter.isCurrent(question),selected:(await adapter.apply(question,question.kind==='text'?'O número é42.':[0])).selected});}
      return results;
    });
    assert.deepEqual(result,[{kind:'text',images:1,current:false,selected:false},{kind:'blanks',images:1,current:false,selected:false}]);
  }finally{await page.close();}
  const cloud=await pageWith(salaOrderActivity().replace('<div class="main">',`<img alt="Contexto da frase" src="${png}"><div class="main">`));
  try{
    const result=await cloud.evaluate(async()=>{const adapter=createPageAdapter();const question=adapter.scan().questions[0];const prepared=await adapter.prepareQuestion(question);question.element.querySelector('img').alt='Outro contexto';return {kind:question.kind,images:prepared.images.length,current:adapter.isCurrent(question),marked:(await adapter.apply(question,[0,1,2,3,4,5,6,7])).selected};});
    assert.deepEqual(result,{kind:'order',images:1,current:false,marked:false});
  }finally{await cloud.close();}
});

test('a tainted loaded image can be encoded via fetch, or keep its public HTTPS URL when browser fetch is blocked',async()=>{
  for(const cors of [true,false]){
    const imageUrl='https://images.example.com/chart.png';
    const page=await pageWith(choices(`<img alt="Gráfico" src="${imageUrl}">`),{imageUrl,imageHeaders:cors?{'Access-Control-Allow-Origin':'https://activity.example.com'}:{}});
    try{
      // Route interception is not a reliable test of Chromium's CORS policy.
      // Exercise the two observable browser API failures explicitly instead.
      await page.evaluate(cors=>{
        const original=HTMLCanvasElement.prototype.toDataURL;let first=true;
        HTMLCanvasElement.prototype.toDataURL=function(...args){if(first){first=false;throw new DOMException('Tainted test image','SecurityError');}return original.apply(this,args);};
        if(!cors)window.fetch=()=>Promise.reject(new TypeError('CORS blocked in test'));
      },cors);
      const result=await page.evaluate(async()=>{const adapter=createPageAdapter();const question=adapter.scan().questions[0];const prepared=await adapter.prepareQuestion(question);return {url:prepared.images[0].url,current:adapter.isCurrent(question),warnings:adapter.scan().warnings};});
      assert.equal(result.current,true);assert.deepEqual(result.warnings,[]);
      if(cors)assert.ok(result.url.startsWith('data:image/png;base64,'));else assert.equal(result.url,imageUrl);
    }finally{await page.close();}
  }
});

test('broken images, unsupported visuals and more than three images stop preparation rather than drop visual input',async()=>{
  for(const media of [
    '<img alt="Imagem quebrada" src="data:image/png;base64,AAAA">',
    '<img alt="Imagem SVG" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22/%3E">',
    '<canvas width="100" height="100"></canvas>',
    '<svg width="240" height="140" aria-label="Gráfico vetorial"><path d="M0 100 L100 0"></path><text x="10" y="20">42</text></svg>',
    Array.from({length:4},(_,index)=>`<img alt="Imagem ${index+1}" src="${png}">`).join(''),
  ]){
    const page=await pageWith(choices(media));
    try{
      const result=await page.evaluate(async()=>{const adapter=createPageAdapter();const question=adapter.scan().questions[0];try{await adapter.prepareQuestion(question);return {accepted:true};}catch(error){return {code:error.code,message:error.message,checked:!!document.querySelector('input:checked')};}});
      assert.equal(result.code,'IMAGE');assert.ok(result.message.length>15);assert.equal(result.checked,false);
    }finally{await page.close();}
  }
});

test('cancellation interrupts an image load before preparing or marking any answer',async()=>{
  const page=await pageWith(choices(`<img alt="Gráfico" src="${png}">`));
  try{
    const result=await page.evaluate(async()=>{
      const image=document.querySelector('img');Object.defineProperty(image,'complete',{get:()=>false});
      const adapter=createPageAdapter(),question=adapter.scan().questions[0],controller=new AbortController();
      const began=performance.now();setTimeout(()=>controller.abort(),40);
      try{await adapter.prepareQuestion(question,{signal:controller.signal});return {accepted:true};}
      catch(error){return {code:error.code,elapsed:performance.now()-began,checked:!!document.querySelector('input:checked')};}
    });
    assert.equal(result.code,'ABORTED');assert.ok(result.elapsed<500);assert.equal(result.checked,false);
  }finally{await page.close();}
});

test('oversized image downloads are stopped at the byte limit and private literal addresses are never forwarded',async()=>{
  const imageUrl='https://127.0.0.1:8443/chart.png';
  const page=await pageWith(choices(`<img alt="Gráfico" src="${imageUrl}">`),{imageUrl});
  try{
    const result=await page.evaluate(async()=>{
      window.downloadCanceled=false;window.downloadBytes=0;
      window.fetch=async()=>new Response(new ReadableStream({pull(controller){const chunk=new Uint8Array(1024*1024);window.downloadBytes+=chunk.length;controller.enqueue(chunk);},cancel(){window.downloadCanceled=true;}}),{headers:{'Content-Type':'image/png'}});
      const adapter=createPageAdapter();const question=adapter.scan().questions[0];
      try{await adapter.prepareQuestion(question);return {accepted:true};}
      catch(error){return {code:error.code,canceled:window.downloadCanceled,bytes:window.downloadBytes,checked:!!document.querySelector('input:checked')};}
    });
    assert.equal(result.code,'IMAGE');assert.equal(result.canceled,true);assert.ok(result.bytes<=11*1024*1024);assert.equal(result.checked,false);
  }finally{await page.close();}
});

test('large locally readable images are resized to at most 2000 pixels and the encoded output stays bounded',async()=>{
  const page=await pageWith(choices());
  try{
    const result=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=4200;canvas.height=2400;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,4200,2400);context.fillStyle='#222';context.font='100px sans-serif';context.fillText('Gráfico 42',200,300);
      const image=document.createElement('img');image.alt='Gráfico grande';image.src=canvas.toDataURL();document.querySelector('fieldset').append(image);await image.decode();
      const adapter=createPageAdapter();const prepared=await adapter.prepareQuestion(adapter.scan().questions[0]);
      const encoded=new Image();encoded.src=prepared.images[0].url;await encoded.decode();
      return {width:encoded.naturalWidth,height:encoded.naturalHeight,length:prepared.images[0].url.length,keys:Object.keys(prepared.images[0]).sort()};
    });
    assert.equal(result.width,2000);assert.ok(result.height<=2000);assert.ok(result.length<=700000);assert.deepEqual(result.keys,['label','url']);
  }finally{await page.close();}
});
