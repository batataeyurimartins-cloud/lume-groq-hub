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

function nativeBlanksFixture({ id='blanks', secondSelected='b' }={}) {
 const options=selected=>`<option value="" disabled ${selected===''?'selected':''}>Escolha...</option><option value="a" ${selected==='a'?'selected':''}>alpha</option><option value="b" ${selected==='b'?'selected':''}>beta</option>`;
 return `<div class="question" id="${id}"><p data-question-text>Complete a frase: <select aria-label="Primeira lacuna">${options('')}</select> vem antes de <select aria-label="Segunda lacuna">${options(secondSelected)}</select>.</p></div>`;
}
function nativeTextFixture({ id='discursive', value='Rascunho anterior.', min=10, max=160, input=false }={}) {
 const field=input?`<input type="text" aria-label="Resposta" value="${value}" minlength="${min}" maxlength="${max}">`:`<textarea aria-label="Resposta" minlength="${min}" maxlength="${max}">${value}</textarea>`;
 return `<div class="question" id="${id}"><p data-question-text>Explique por que a água é importante para os seres vivos.</p>${field}</div>`;
}

test('native fields coexist with choice groups and blanks retain positional placeholders',async()=>{
 const page=await pageWith('<fieldset><legend>Escolha a alternativa correta.</legend><label><input type="radio" name="choice">Primeira</label><label><input type="radio" name="choice">Segunda</label></fieldset>'+nativeBlanksFixture()+nativeTextFixture());
 try{
  const result=await page.evaluate(async()=>{const adapter=createPageAdapter();await adapter.prepare();const questions=adapter.scan().questions;const blanks=questions.find(q=>q.kind==='blanks');const text=questions.find(q=>q.kind==='text');return {count:questions.length,kinds:questions.map(q=>q.kind||'choice').sort(),prompt:blanks.prompt,fields:blanks.fields.map(field=>field.options.map(option=>option.text)),min:text.minLength,max:text.maxLength};});
  assert.equal(result.count,3);assert.deepEqual(result.kinds,['blanks','choice','text']);assert.match(result.prompt,/\[Lacuna\s*1\]/i);assert.match(result.prompt,/\[Lacuna\s*2\]/i);assert.deepEqual(result.fields,[['alpha','beta'],['alpha','beta']]);assert.equal(result.min,10);assert.equal(result.max,160);
 }finally{await page.close();}
});

test('native selects prepare without selection and mark through change events, then restore prior values',async()=>{
 const page=await pageWith(nativeBlanksFixture());
 try{
  const result=await page.evaluate(async()=>{let changes=0,submits=0;document.addEventListener('change',event=>{if(event.target.tagName==='SELECT')changes++;});document.addEventListener('submit',()=>submits++);const adapter=createPageAdapter();const initial=Array.from(document.querySelectorAll('select')).map(e=>e.value);await adapter.prepare();const prepared=Array.from(document.querySelectorAll('select')).map(e=>e.value);const question=adapter.scan().questions.find(q=>q.kind==='blanks');const marked=await adapter.apply(question,[1,0]);const selected=Array.from(document.querySelectorAll('select')).map(e=>e.value);const undone=await marked.undo();return {initial,prepared,marked:marked.selected,selected,restored:undone.restored,original:Array.from(document.querySelectorAll('select')).map(e=>e.value),changes,submits};});
  assert.deepEqual(result.initial,['','b']);assert.deepEqual(result.prepared,result.initial);assert.equal(result.marked,true);assert.deepEqual(result.selected,['b','a']);assert.equal(result.restored,true);assert.deepEqual(result.original,result.initial);assert.ok(result.changes>=4);assert.equal(result.submits,0);
 }finally{await page.close();}
});

test('native textarea writes emit application input/change events and undo restores its draft',async()=>{
 const page=await pageWith(nativeTextFixture());
 try{
  const result=await page.evaluate(async()=>{const events=[];document.addEventListener('input',event=>{if(event.target.tagName==='TEXTAREA')events.push('input');});document.addEventListener('change',event=>{if(event.target.tagName==='TEXTAREA')events.push('change');});const adapter=createPageAdapter();await adapter.prepare();const question=adapter.scan().questions.find(q=>q.kind==='text');const answer='A água participa das reações do organismo e ajuda no transporte de nutrientes.';const outcome=await adapter.apply(question,answer);const written=document.querySelector('textarea').value;const undone=await outcome.undo();return {marked:outcome.selected,written,answer,restored:undone.restored,original:document.querySelector('textarea').value,inputs:events.filter(x=>x==='input').length,changes:events.filter(x=>x==='change').length};});
  assert.equal(result.marked,true);assert.equal(result.written,result.answer);assert.equal(result.restored,true);assert.equal(result.original,'Rascunho anterior.');assert.ok(result.inputs>=2);assert.ok(result.changes>=2);
 }finally{await page.close();}
});

test('manual select and text edits while awaiting an answer are never overwritten',async()=>{
 const page=await pageWith(nativeBlanksFixture()+nativeTextFixture());
 try{
  const result=await page.evaluate(async()=>{const adapter=createPageAdapter();await adapter.prepare();const questions=adapter.scan().questions;const blanks=questions.find(q=>q.kind==='blanks'),text=questions.find(q=>q.kind==='text');const select=document.querySelector('select'),textarea=document.querySelector('textarea');select.value='a';textarea.value='Minha resposta digitada enquanto a consulta estava em andamento.';const currentBlanks=adapter.isCurrent(blanks),currentText=adapter.isCurrent(text);const blankOutcome=await adapter.apply(blanks,[1,0]),textOutcome=await adapter.apply(text,'Resposta automática suficientemente longa.');return {currentBlanks,currentText,blankMarked:blankOutcome.selected,textMarked:textOutcome.selected,select:select.value,text:textarea.value};});
  assert.deepEqual(result,{currentBlanks:false,currentText:false,blankMarked:false,textMarked:false,select:'a',text:'Minha resposta digitada enquanto a consulta estava em andamento.'});
 }finally{await page.close();}
});

test('field replacement, mutated select options, disabled fields and canceled runs prevent writes',async()=>{
 const page=await pageWith(nativeBlanksFixture()+nativeTextFixture());
 try{
  const result=await page.evaluate(async()=>{const adapter=createPageAdapter();await adapter.prepare();let questions=adapter.scan().questions;const staleBlanks=questions.find(q=>q.kind==='blanks');document.querySelector('select option[value="a"]').textContent='Alternativa substituída';const changedOptions=await adapter.apply(staleBlanks,[1,0]);questions=adapter.scan().questions;const staleText=questions.find(q=>q.kind==='text');const old=document.querySelector('textarea');old.replaceWith(old.cloneNode(true));const replaced=await adapter.apply(staleText,'Resposta que não deve ser escrita.');const freshText=adapter.scan().questions.find(q=>q.kind==='text');document.querySelector('textarea').disabled=true;const disabled=await adapter.apply(freshText,'Resposta que não deve ser escrita.');const freshBlanks=adapter.scan().questions.find(q=>q.kind==='blanks');const aborter=new AbortController();aborter.abort();const canceled=await adapter.apply(freshBlanks,[1,0],{signal:aborter.signal});return {changed:changedOptions.selected,replaced:replaced.selected,disabled:disabled.selected,canceled:canceled.selected,values:Array.from(document.querySelectorAll('select')).map(e=>e.value),draft:document.querySelector('textarea').value};});
  assert.deepEqual(result,{changed:false,replaced:false,disabled:false,canceled:false,values:['','b'],draft:'Rascunho anterior.'});
 }finally{await page.close();}
});

test('text length bounds and select indices reject invalid responses; undo preserves subsequent manual edits',async()=>{
 const page=await pageWith(nativeBlanksFixture()+nativeTextFixture({input:true,value:'Texto inicial.',min:5,max:25}));
 try{
  const result=await page.evaluate(async()=>{const adapter=createPageAdapter();await adapter.prepare();let questions=adapter.scan().questions;const blanks=questions.find(q=>q.kind==='blanks'),text=questions.find(q=>q.kind==='text');const short=await adapter.apply(text,'x'),long=await adapter.apply(text,'x'.repeat(26));const none=await adapter.apply(blanks,[]),invalid=await adapter.apply(blanks,[99,0]);const before=document.querySelector('input[type="text"]').value;const markedText=await adapter.apply(text,'Uma resposta válida.');document.querySelector('input[type="text"]').value='Minha edição posterior.';const undoText=await markedText.undo();const markedBlanks=await adapter.apply(blanks,[1,0]);document.querySelector('select').value='a';const undoBlanks=await markedBlanks.undo();return {short:short.selected,long:long.selected,none:none.selected,invalid:invalid.selected,before,textMarked:markedText.selected,textUndo:undoText.restored,manualText:document.querySelector('input[type="text"]').value,blanksMarked:markedBlanks.selected,blanksUndo:undoBlanks.restored,manualSelect:document.querySelector('select').value};});
  assert.deepEqual(result,{short:false,long:false,none:false,invalid:false,before:'Texto inicial.',textMarked:true,textUndo:false,manualText:'Minha edição posterior.',blanksMarked:true,blanksUndo:false,manualSelect:'a'});
 }finally{await page.close();}
});

function muiLazyFields() {
 const blank=index=>`<span style="display:inline-block"><div class="MuiInputBase-root"><div id="${index}-" class="MuiSelect-select" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="list-${index}" tabindex="0" data-index="${index}">&#8203;</div><input class="MuiSelect-nativeInput" aria-hidden="true" tabindex="-1" value=""></div></span>`;
 return `<div id="blanks" class="MuiPaper-root MuiPaper-elevation3"><p>Complete a frase.</p><div class="MuiPaper-root">As ${blank(0)} precisam de ${blank(1)}.</div><button id="global-clear">Limpar</button></div><div id="text" class="MuiPaper-root MuiPaper-elevation3"><p>Explique por que as plantas precisam de luz.</p><div class="MuiInputBase-root"><textarea placeholder="Responder"></textarea><textarea aria-hidden="true" tabindex="-1" readonly></textarea></div><p class="MuiTypography-root">N° mínimo de caracteres: 12</p><p class="MuiTypography-root" style="display:none">N° máximo de caracteres: 160</p><p class="MuiTypography-root" id="counter">0 caractere</p></div><script>
 (()=>{
  const controls=[...document.querySelectorAll('[role=combobox]')], words=['plantas','luz','rochas','fungos'];
  const state=window.testFields={values:['',''],opens:0,commits:0,clears:0,global:0,text:'',input:0};
  let portal,opened;
  function close(){const node=portal;if(!node)return;opened.setAttribute('aria-expanded','false');portal=null;opened=null;setTimeout(()=>{node.remove();for(const card of document.querySelectorAll('body>.MuiPaper-root'))card.removeAttribute('aria-hidden');},70);}
  function set(index,value){const control=controls[index];state.values[index]=value;control.id=index+'-'+value;control.textContent=value||'\u200b';control.nextElementSibling.value=value;const wrapper=control.closest('.MuiInputBase-root').parentElement;wrapper.querySelector('button')?.remove();if(value){const button=document.createElement('button');button.className='MuiIconButton-root';button.innerHTML='<svg aria-hidden="true"></svg>';button.addEventListener('click',()=>{state.clears++;set(index,'');});wrapper.append(button);}}
  function open(control){state.opens++;opened=control;control.setAttribute('aria-expanded','true');for(const card of document.querySelectorAll('body>.MuiPaper-root'))card.setAttribute('aria-hidden','true');portal=document.createElement('div');portal.className='MuiMenu-root';const ul=document.createElement('ul');ul.id=control.getAttribute('aria-controls');ul.setAttribute('role','listbox');const index=Number(control.dataset.index);for(const word of words.filter(word=>!state.values.some((value,other)=>other!==index&&value===word))){const li=document.createElement('li');li.setAttribute('role','option');li.setAttribute('data-value',word);li.textContent=word;li.addEventListener('click',()=>{state.commits++;set(index,word);close();});ul.append(li);}portal.append(ul);document.body.append(portal);}
  for(const control of controls)control.addEventListener('mousedown',event=>{if(event.button===0)open(control);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});document.querySelector('#global-clear').onclick=()=>state.global++;
  const textarea=document.querySelector('#text textarea'), descriptor=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');let tracker='';
  Object.defineProperty(textarea,'value',{configurable:true,get(){return descriptor.get.call(this);},set(value){tracker=String(value);descriptor.set.call(this,value);}});
  textarea.addEventListener('input',()=>{if(textarea.value===tracker)return;tracker=textarea.value;state.text=textarea.value;state.input++;document.querySelector('#counter').textContent=textarea.value.trim().length+' caracteres';});
 })();
 </script>`;
}

test('MUI lazy bank prepares without selection, handles modal aria-hidden and live option indices, and undo uses only local X',async()=>{
 const page=await pageWith(muiLazyFields());
 try{
  const result=await page.evaluate(async()=>{
   const adapter=createPageAdapter();await adapter.prepare();const q=adapter.scan().questions.find(q=>q.kind==='blanks');
   const prepared=structuredClone(testFields);const fingerprint=q.fingerprint;
   await adapter.prepare();const cachedOpens=testFields.opens;
   const marked=await adapter.apply(q,[0,1]);const filled=[...testFields.values];
   const stable=adapter.scan().questions.find(q=>q.kind==='blanks').fingerprint===fingerprint;
   const undo=await marked.undo();return {prepared,cachedOpens,marked:marked.selected,message:marked.message,filled,stable,restored:undo.restored,values:testFields.values,clears:testFields.clears,global:testFields.global,menus:document.querySelectorAll('[role=listbox]').length};
  });
  assert.deepEqual(result.prepared.values,['','']);assert.equal(result.prepared.commits,0);assert.equal(result.prepared.opens,2);assert.equal(result.cachedOpens,2);assert.equal(result.marked,true,result.message);assert.deepEqual(result.filled,['plantas','luz']);assert.equal(result.stable,true);assert.equal(result.restored,true);assert.deepEqual(result.values,['','']);assert.equal(result.clears,2);assert.equal(result.global,0);assert.equal(result.menus,0);
 }finally{await page.close();}
});

test('MUI text reads hidden Typography limits without concatenating the counter and bypasses a React-like value tracker',async()=>{
 const page=await pageWith(muiLazyFields());
 try{
  const result=await page.evaluate(async()=>{const adapter=createPageAdapter();const q=adapter.scan().questions.find(q=>q.kind==='text');const before={min:q.minLength,max:q.maxLength,fingerprint:q.fingerprint,prompt:q.prompt};const mark=await adapter.apply(q,'As plantas usam a energia da luz para produzir alimento.');const next=adapter.scan().questions.find(q=>q.kind==='text');const filled={selected:mark.selected,text:testFields.text,input:testFields.input,min:next.minLength,max:next.maxLength,stable:next.fingerprint===before.fingerprint};const undo=await mark.undo();return {before,filled,restored:undo.restored,empty:testFields.text===''};});
  assert.equal(result.before.min,12);assert.equal(result.before.max,160);assert.ok(!result.before.prompt.includes('caractere'));assert.equal(result.filled.selected,true);assert.ok(result.filled.input>0);assert.match(result.filled.text,/plantas/);assert.equal(result.filled.min,12);assert.equal(result.filled.max,160);assert.equal(result.filled.stable,true);assert.equal(result.restored,true);assert.equal(result.empty,true);
 }finally{await page.close();}
});

test('text scanner ignores search inputs in generic Papers and refuses impossible text limits',async()=>{
 const page=await pageWith('<div class="MuiPaper-root"><p>Busque uma atividade</p><input type="text" placeholder="Pesquisar"></div><div class="question"><p>Escreva um texto longo.</p><textarea placeholder="Responder"></textarea><p>N° mínimo de caracteres: 5000</p></div><div class="question"><p>Limites incompatíveis.</p><textarea placeholder="Responder"></textarea><p>N° mínimo de caracteres: 200</p><p>N° máximo de caracteres: 100</p></div>');
 try{const result=await page.evaluate(async()=>{const a=createPageAdapter();await a.prepare({containerSelector:'['});const {questions,warnings}=a.scan();return {count:questions.length,kind:questions[0]?.kind,min:questions[0]?.minLength,max:questions[0]?.maxLength,warned:warnings.some(w=>/limites/i.test(w))};});assert.deepEqual(result,{count:1,kind:'text',min:5000,max:5000,warned:true});}finally{await page.close();}
});

test('canceling while a lazy MUI menu mounts closes only that menu and makes no selection',async()=>{
 const page=await pageWith(muiLazyFields());
 try{
  const result=await page.evaluate(async()=>{
   const append=document.body.append.bind(document.body);
   document.body.append=(...nodes)=>{if(nodes.some(node=>node.classList?.contains('MuiMenu-root')))setTimeout(()=>append(...nodes),8);else append(...nodes);};
   const adapter=createPageAdapter(),controller=new AbortController();setTimeout(()=>controller.abort(),12);
   let code;try{await adapter.prepare({}, {signal:controller.signal});}catch(error){code=error.code;}
   await new Promise(resolve=>setTimeout(resolve,90));
   return {code,menus:document.querySelectorAll('[role=listbox]').length,values:testFields.values,commits:testFields.commits,hidden:document.querySelector('#blanks').getAttribute('aria-hidden')};
  });
  assert.deepEqual(result,{code:'ABORTED',menus:0,values:['',''],commits:0,hidden:null});
 }finally{await page.close();}
});
