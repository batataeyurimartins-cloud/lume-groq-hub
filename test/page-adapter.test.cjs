const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
let browser;
const source=readFileSync(path.join(__dirname,'../src/page-adapter.js'),'utf8').replace('export function createPageAdapter','window.createPageAdapter = function createPageAdapter');
before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();});
async function pageWith(html){const page=await browser.newPage();await page.setContent(html);await page.addScriptTag({content:source});return page;}
test('native linked labels, hidden inputs, form/name boundaries, exact selection and undo',async()=>{
 const page=await pageWith('<form id="one"><fieldset><legend>Quanto é dois mais dois?</legend><input style="display:none" type="radio" name="same" id="a"><label for="a">Quatro</label><input style="display:none" type="radio" name="same" id="b"><label for="b">Cinco</label></fieldset></form><form id="two"><fieldset><legend>Quanto é três mais três?</legend><label><input type="radio" name="same">Seis</label><label><input type="radio" name="same">Sete</label></fieldset></form>');
 try{const result=await page.evaluate(async()=>{const a=createPageAdapter();const {questions}=a.scan();const marked=await a.apply(questions[0],[0]);const selected=document.querySelector('#a').checked;const undone=await marked.undo();return {count:questions.length,text:questions[0].options.map(x=>x.text),marked:marked.selected,selected,restored:undone.restored,none:!document.querySelector('input:checked')};});assert.deepEqual(result,{count:2,text:['Quatro','Cinco'],marked:true,selected:true,restored:true,none:true});}finally{await page.close();}
});
test('same-node SPA prompt or option replacement prevents clicks',async()=>{
 const page=await pageWith('<fieldset><legend>Escolha uma resposta.</legend><label><input type="radio" name="a">A</label><label><input type="radio" name="a">B</label></fieldset>');
 try{const result=await page.evaluate(async()=>{const a=createPageAdapter();const q=a.scan().questions[0];document.querySelector('legend').textContent='Agora é uma outra pergunta.';const current=a.isCurrent(q);const applied=await a.apply(q,[1]);return {current,selected:applied.selected,checked:!!document.querySelector('input:checked')};});assert.deepEqual(result,{current:false,selected:false,checked:false});}finally{await page.close();}
});
test('checkboxes restore original mixed state, and reject undo after external changes',async()=>{
 const page=await pageWith('<fieldset><legend>Escolha números primos.</legend><label><input checked type="checkbox">2</label><label><input type="checkbox">4</label><label><input type="checkbox">7</label></fieldset>');
 try{const result=await page.evaluate(async()=>{const a=createPageAdapter();const q=a.scan().questions[0];const mark=await a.apply(q,[0,2]);const marked=Array.from(document.querySelectorAll('input')).map(e=>e.checked);const undo=await mark.undo();const original=Array.from(document.querySelectorAll('input')).map(e=>e.checked);const mark2=await a.apply(q,[0,2]);document.querySelectorAll('input')[1].click();return {multiple:q.multiple,marked,restored:undo.restored,original,protected:!(await mark2.undo()).restored};});assert.deepEqual(result,{multiple:true,marked:[true,false,true],restored:true,original:[true,false,false],protected:true});}finally{await page.close();}
});
test('ARIA controls require confirmed state and malformed selector is nonfatal',async()=>{
 const page=await pageWith('<div role="radiogroup" aria-labelledby="prompt"><p id="prompt">Qual palavra é um substantivo?</p><div role="radio" aria-checked="false">Mesa</div><div role="radio" aria-checked="false">Correr</div></div>');
 try{const result=await page.evaluate(async()=>{const a=createPageAdapter();const q=a.scan().questions[0];const mark=await a.apply(q,[0]);return {prompt:q.prompt,selected:mark.selected,count:a.scan({containerSelector:'['}).questions.length,checked:!!document.querySelector('[aria-checked="true"]')};});assert.deepEqual(result,{prompt:'Qual palavra é um substantivo?',selected:false,count:0,checked:false});}finally{await page.close();}
});

// These shapes follow the publicly served Sala SINGLE and MULTI components:
// empty FormControlLabel/Checkbox icons, then a separate rich-text statement div.
function salaChoice({kind,name='',id,text,checked=false,hidden=false,label=true}) {
 const input=`<span class="MuiButtonBase-root Mui${kind==='radio'?'Radio':'Checkbox'}-root"><input type="${kind}" ${name?`name="${name}"`:''} id="${id}" ${checked?'checked':''} ${hidden?'style="display:none"':''}><svg aria-hidden="true"><path d="M0 0"></path></svg></span>`;
 return `<div class="MuiBox-root option-card"><div class="MuiBox-root option-row">${label?`<label class="MuiFormControlLabel-root">${input}</label>`:input}<div style="padding:10px;width:100%"><div class="main"><p>${text}</p></div></div></div></div>`;
}
function salaQuestion({id,kind,prompt,labels=true,hidden=false,image=false}) {
 const texts=kind==='radio'?['A primeira alternativa','A segunda alternativa']:['Dois','Quatro','Sete'];
 const choices=texts.map((text,index)=>salaChoice({kind,id:`${id}-${index}`,text,hidden,label:labels,checked:kind==='checkbox'&&index===0})).join('');
 // Several wrappers separate the options from the enunciado; the previous
 // three-level climb and normal-label extraction both missed this layout.
 const group=kind==='radio'?`<div class="MuiFormGroup-root MuiRadioGroup-root" role="radiogroup">${choices}</div>`:`<div class="MuiBox-root checkbox-list">${choices}</div>`;
 return `<article id="${id}"><div class="main"><p>${prompt}</p>${image?'<img alt="gráfico da questão" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">':''}</div><div class="MuiBox-root"><div class="MuiBox-root"><div class="MuiBox-root"><div class="MuiBox-root">${group}</div></div></div></div></article>`;
}

test('Sala MUI empty labels and sibling rich statements scan separate SINGLE/MULTI questions',async()=>{
 const page=await pageWith(salaQuestion({id:'single-one',kind:'radio',prompt:'Qual alternativa completa a primeira questão?',hidden:true})+salaQuestion({id:'multi-one',kind:'checkbox',prompt:'Quais números são primos?',labels:false,hidden:true})+salaQuestion({id:'single-two',kind:'radio',prompt:'Qual alternativa completa a segunda questão?'})+salaQuestion({id:'multi-two',kind:'checkbox',prompt:'Selecione os números pedidos.',labels:true}));
 try{
  const result=await page.evaluate(()=>{const adapter=createPageAdapter();const first=adapter.scan();const second=adapter.scan();return {count:first.questions.length,prompts:first.questions.map(q=>q.prompt),options:first.questions.map(q=>q.options.map(o=>o.text)),multiple:first.questions.map(q=>q.multiple),stable:first.questions.every((q,i)=>q.id===second.questions[i].id&&q.fingerprint===second.questions[i].fingerprint),warnings:first.warnings};});
  assert.deepEqual(result,{count:4,prompts:['Qual alternativa completa a primeira questão?','Quais números são primos?','Qual alternativa completa a segunda questão?','Selecione os números pedidos.'],options:[['A primeira alternativa','A segunda alternativa'],['Dois','Quatro','Sete'],['A primeira alternativa','A segunda alternativa'],['Dois','Quatro','Sete']],multiple:[false,true,false,true],stable:true,warnings:[]});
 }finally{await page.close();}
});

test('Sala MUI native clicks update controlled-like state and undo original radio/checkbox choices',async()=>{
 const page=await pageWith(salaQuestion({id:'single',kind:'radio',prompt:'Escolha uma alternativa.'})+salaQuestion({id:'multi',kind:'checkbox',prompt:'Escolha os números primos.',labels:false}));
 try{
  const result=await page.evaluate(async()=>{
   let changes=0;const controlled={};
   document.addEventListener('change',event=>{if(!event.target.matches('input'))return;changes++;const article=event.target.closest('article');controlled[article.id]=Array.from(article.querySelectorAll('input')).map(e=>e.checked);for(const input of article.querySelectorAll('input'))input.closest('.MuiButtonBase-root').classList.toggle('Mui-checked',input.checked);});
   const adapter=createPageAdapter();const [single,multi]=adapter.scan().questions;
   const first=await adapter.apply(single,[1]);const singleMarked=controlled.single;const undoSingle=await first.undo();
   const second=await adapter.apply(multi,[0,2]);const multiMarked=controlled.multi;const undoMulti=await second.undo();
   return {first:first.selected,singleMarked,singleRestored:undoSingle.restored,singleOriginal:controlled.single,second:second.selected,multiMarked,multiRestored:undoMulti.restored,multiOriginal:controlled.multi,changes};
  });
  assert.equal(result.first,true);assert.deepEqual(result.singleMarked,[false,true]);assert.equal(result.singleRestored,true);assert.deepEqual(result.singleOriginal,[false,false]);assert.equal(result.second,true);assert.deepEqual(result.multiMarked,[true,false,true]);assert.equal(result.multiRestored,true);assert.deepEqual(result.multiOriginal,[true,false,false]);assert.ok(result.changes>=4);
 }finally{await page.close();}
});

test('Sala sibling statement mutation invalidates pending answer and image context is warned',async()=>{
 const page=await pageWith(salaQuestion({id:'single',kind:'radio',prompt:'Observe o gráfico e escolha uma alternativa.',image:true}));
 try{
  const result=await page.evaluate(async()=>{const adapter=createPageAdapter();const {questions,warnings}=adapter.scan();const question=questions[0];document.querySelector('#single .option-row .main p').textContent='Esta alternativa mudou durante a consulta.';const outcome=await adapter.apply(question,[1]);return {current:adapter.isCurrent(question),marked:outcome.selected,checked:document.querySelectorAll('input:checked').length,warned:warnings.some(w=>/imagens|visual/i.test(w))};});
  assert.deepEqual(result,{current:false,marked:false,checked:0,warned:true});
 }finally{await page.close();}
});
