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
