const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {salaOrderActivity}=require('./fixtures/sala-order.cjs');
const source=readFileSync(path.join(__dirname,'../src/page-adapter.js'),'utf8').replace('export function createPageAdapter','window.createPageAdapter = function createPageAdapter');
let browser;
before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();});
async function setup(){const page=await browser.newPage();await page.setContent(salaOrderActivity());await page.addScriptTag({content:source});return page;}

test('CLOUD preserves repeated word identities, fills once and undoes by removing local word buttons',async()=>{
 const page=await setup();
 try {
  const result=await page.evaluate(async()=>{
   const adapter=createPageAdapter();const q=adapter.scan().questions.find(q=>q.kind==='order');
   const original=q.options.map(o=>o.text),fingerprint=q.fingerprint;
   const outcome=await adapter.apply(q,[1,5,6,4,2,3,7,0]);
   const selected=[...__cloudFixture.selected];const current=adapter.isCurrent(q);
   const stable=adapter.scan().questions.find(q=>q.kind==='order').fingerprint===fingerprint;
   const undo=await outcome.undo();adapter.destroy();
   return {original,selected,current,stable,marked:outcome.selected,message:outcome.message,restored:undo.restored,empty:__cloudFixture.selected.length===0,clears:__cloudFixture.clearClicks,removed:__cloudFixture.removeClicks};
  });
  assert.deepEqual(result.original,['vida','a','luz','sustentam','a','água','e','a']);
  assert.equal(result.marked,true,result.message);assert.deepEqual(result.selected,[1,5,6,4,2,3,7,0]);
  assert.equal(result.current,true);assert.equal(result.stable,true);assert.equal(result.restored,true);assert.equal(result.empty,true);assert.equal(result.clears,0);assert.equal(result.removed,8);
 }finally{await page.close();}
});

test('CLOUD undo restores the original partial answer including the selected duplicate occurrence',async()=>{
 const page=await setup();
 try {
  const result=await page.evaluate(async()=>{
   const bank=document.querySelector('.MuiGrid-container').children[1];bank.children[4].click();bank.children[5].click();
   const adapter=createPageAdapter();const q=adapter.scan().questions.find(q=>q.kind==='order');
   const outcome=await adapter.apply(q,[1,5,6,4,2,3,7,0]);const marked=outcome.selected;
   const undo=await outcome.undo();return {marked,restored:undo.restored,selected:__cloudFixture.selected,clears:__cloudFixture.clearClicks};
  });
  assert.deepEqual(result,{marked:true,restored:true,selected:[4,5],clears:0});
 }finally{await page.close();}
});

test('CLOUD manual edits, invalid permutations and disposal prevent automatic overwrites',async()=>{
 const page=await setup();
 try {
  const result=await page.evaluate(async()=>{
   const adapter=createPageAdapter();const q=adapter.scan().questions.find(q=>q.kind==='order');
   const bank=document.querySelector('.MuiGrid-container').children[1];bank.children[1].click();
   const stale=adapter.isCurrent(q),blocked=await adapter.apply(q,[1,5,6,4,2,3,7,0]);
   const fresh=adapter.scan().questions.find(q=>q.kind==='order');const invalid=await adapter.apply(fresh,[0,0,1,2,3,4,5,6]);
   adapter.destroy();const disposed=await adapter.apply(fresh,[1,5,6,4,2,3,7,0]);
   return {stale,blocked:blocked.selected,invalid:invalid.selected,disposed:disposed.selected,selected:__cloudFixture.selected};
  });
  assert.deepEqual(result,{stale:false,blocked:false,invalid:false,disposed:false,selected:[1]});
 }finally{await page.close();}
});

test('CLOUD cancellation after a click leaves a reversible partial answer and never selects the next block',async()=>{
 const page=await setup();
 try {
  const result=await page.evaluate(async()=>{
   const adapter=createPageAdapter();const q=adapter.scan().questions.find(q=>q.kind==='order');
   const controller=new AbortController();document.querySelector('.MuiGrid-container').children[1].addEventListener('click',()=>controller.abort(),{once:true});
   const outcome=await adapter.apply(q,[1,5,6,4,2,3,7,0],{signal:controller.signal});const selected=[...__cloudFixture.selected];
   const undo=await outcome.undo();return {marked:outcome.selected,selected,restored:undo.restored,empty:__cloudFixture.selected.length===0};
  });
  assert.deepEqual(result,{marked:false,selected:[1],restored:true,empty:true});
 }finally{await page.close();}
});
