const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const publicOrigin='https://lume-public.test';
const activityUrl='https://saladofuturo.educacao.sp.gov.br/lume-bookmarklet-test';
const simpleActivity='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><h1>Atividade de teste</h1><fieldset><legend>Quanto é dois mais dois?</legend><label><input type="radio" name="q" value="3">Três</label><label><input type="radio" name="q" value="4">Quatro</label></fieldset></body></html>';

function salaActivity() {
  const radioOption=(text,index)=>`<div class="MuiBox-root optionBox"><div class="MuiBox-root row"><label class="MuiFormControlLabel-root"><span class="MuiButtonBase-root MuiRadio-root"><input type="radio" value="${index}" class="MuiSwitchBase-input"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"></circle></svg></span></label><div class="MuiBox-root statement"><div class="ql-editor"><p>${text}</p></div></div></div></div>`;
  const checkboxOption=(text,index)=>`<div class="MuiBox-root optionBox"><div class="MuiBox-root row"><span class="MuiButtonBase-root MuiCheckbox-root"><input type="checkbox" value="${index}" class="MuiSwitchBase-input"><svg aria-hidden="true" width="16" height="16"><rect x="2" y="2" width="12" height="12"></rect></svg></span><div class="MuiBox-root statement"><div class="ql-editor"><p>${text}</p></div></div></div></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><main>
    <section id="sala-single-card" class="MuiPaper-root MuiBox-root"><div class="MuiBox-root"><h2>Questão 01 de 02</h2><div class="ql-editor"><p>Quanto é dois mais dois? Marque uma alternativa.</p></div></div><div class="MuiFormGroup-root" role="radiogroup">${['Dois','Quatro','Seis','Oito'].map(radioOption).join('')}</div></section>
    <section id="sala-multi-card" class="MuiPaper-root MuiBox-root"><div class="MuiBox-root"><h2>Questão 02 de 02</h2><div class="ql-editor"><p>Quais números são primos? Marque todas as alternativas corretas.</p></div></div><div class="MuiBox-root choice-list">${['2','4','7','9'].map(checkboxOption).join('')}</div></section>
  </main></body></html>`;
}

// Sala renders these controls inside ordinary MUI Papers. In particular, select
// options live in a lazy portal and text limits live in Typography, not attributes.
function mixedSalaActivity({choice=true,blanks=true,text=true}={}) {
  const radioOption=(label,index)=>`<div class="MuiBox-root optionBox"><div class="MuiBox-root row"><label class="MuiFormControlLabel-root"><span class="MuiButtonBase-root MuiRadio-root"><input type="radio" value="${index}" class="MuiSwitchBase-input"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"></circle></svg></span></label><div class="MuiBox-root statement"><div class="ql-editor"><p>${label}</p></div></div></div></div>`;
  const blank=index=>`<span style="display:inline-block"><div class="MuiInputBase-root MuiOutlinedInput-root"><div id="${index}-" class="MuiSelect-select MuiSelect-outlined MuiInputBase-input" role="combobox" tabindex="0" aria-haspopup="listbox" aria-controls="mui-lazy-${index}" aria-expanded="false" data-field="${index}"><span aria-hidden="true">&#8203;</span></div><input class="MuiSelect-nativeInput" aria-hidden="true" tabindex="-1" value="" style="opacity:0;position:absolute;width:1px"></div></span>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>.MuiPaper-elevation3{margin:20px;padding:16px;box-shadow:0 2px 5px #ccc}.MuiSelect-select{min-width:80px;min-height:20px;border:1px solid #888;padding:5px}.MuiMenu-root{position:fixed;inset:0;z-index:1300}.MuiBackdrop-root{position:fixed;inset:0}.MuiMenu-paper{position:relative;background:white;margin:50px;padding:12px;width:220px}.MuiMenuItem-root{padding:8px;cursor:pointer}</style></head><body><main>
    ${choice?`<div id="mixed-choice" class="MuiPaper-root MuiPaper-elevation MuiPaper-elevation3"><h6 class="MuiTypography-root">Questão 01</h6><div class="main"><p>Quanto é dois mais dois? Marque uma alternativa.</p></div><div class="MuiFormGroup-root" role="radiogroup">${['Dois','Quatro','Seis','Oito'].map(radioOption).join('')}</div></div>`:''}
    ${blanks?`<div id="mixed-blanks" class="MuiPaper-root MuiPaper-elevation MuiPaper-elevation3"><h6 class="MuiTypography-root">Questão 02</h6><div class="main"><p>Complete a frase sobre a fotossíntese com as palavras corretas.</p></div><div class="MuiPaper-root MuiPaper-elevation MuiPaper-elevation0"><span style="white-space:pre-wrap">As </span>${blank(0)}<span style="white-space:pre-wrap"> precisam de </span>${blank(1)}<span style="white-space:pre-wrap"> para realizar a fotossíntese.</span></div></div>`:''}
    ${text?`<div id="mixed-text" class="MuiPaper-root MuiPaper-elevation MuiPaper-elevation3"><h6 class="MuiTypography-root">Questão 03</h6><div class="main"><p>Explique por que as plantas precisam de luz para a fotossíntese.</p></div><div class="MuiFormControl-root"><div class="MuiInputBase-root MuiInputBase-multiline"><textarea class="MuiInputBase-input MuiInputBase-inputMultiline" placeholder="Responder" rows="4"></textarea><textarea class="MuiInputBase-input MuiInputBase-inputMultiline" aria-hidden="true" tabindex="-1" style="visibility:hidden;position:absolute;height:0" readonly></textarea></div></div><p class="MuiTypography-root" id="text-minimum">N° mínimo de caracteres: 12</p><p class="MuiTypography-root" id="text-maximum" style="display:none">N° máximo de caracteres: 160</p><p class="MuiTypography-root" id="text-counter">0 caractere</p><div class="MuiBox-root">Assistente de correção</div></div>`:''}
  </main><script>
    (() => {
      const words=['plantas','luz','rochas','fungos'];
      const controls=Array.from(document.querySelectorAll('[role="combobox"]'));
      const state=window.__salaFixture={values:controls.map(()=>''),menuOpens:0,selectionsCommitted:0,text:'',inputEvents:0};
      let portal=null;
      let opened=null;
      function closeMenu(){
        if(opened)opened.setAttribute('aria-expanded','false');
        if(portal)portal.remove();
        portal=null;opened=null;
      }
      function showMenu(control){
        closeMenu();
        const index=Number(control.dataset.field);
        state.menuOpens++;
        opened=control;
        control.setAttribute('aria-expanded','true');
        portal=document.createElement('div');
        portal.className='MuiPopover-root MuiMenu-root';
        const backdrop=document.createElement('div');
        backdrop.className='MuiBackdrop-root';
        backdrop.addEventListener('mousedown',closeMenu);
        portal.append(backdrop);
        const paper=document.createElement('div');
        paper.className='MuiPaper-root MuiMenu-paper';
        const list=document.createElement('ul');
        list.className='MuiList-root';
        list.setAttribute('role','listbox');
        list.id=control.getAttribute('aria-controls');
        for(const word of words.filter(word=>!state.values.some((value,other)=>other!==index&&value===word))){
          const option=document.createElement('li');
          option.className='MuiMenuItem-root';
          option.tabIndex=-1;
          option.setAttribute('role','option');
          option.setAttribute('data-value',word);
          option.setAttribute('aria-selected',String(state.values[index]===word));
          option.textContent=word;
          option.addEventListener('click',()=>{
            state.values[index]=word;
            state.selectionsCommitted++;
            control.id=index+'-'+word;
            control.textContent=word;
            control.nextElementSibling.value=word;
            closeMenu();
          });
          list.append(option);
        }
        paper.append(list);portal.append(paper);document.body.append(portal);
      }
      for(const control of controls){
        control.addEventListener('mousedown',event=>{if(event.button===0){event.preventDefault();showMenu(control);}});
        control.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='Enter'){event.preventDefault();showMenu(control);}});
      }
      document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
      const textarea=document.querySelector('textarea:not([aria-hidden="true"])');
      if(textarea)textarea.addEventListener('input',()=>{
        state.text=textarea.value;
        state.inputEvents++;
        const length=textarea.value.trim().length;
        document.querySelector('#text-counter').textContent=length+' '+(length>1?'caracteres':'caractere');
        document.querySelector('#text-minimum').style.display=length>=12?'none':'';
        document.querySelector('#text-maximum').style.display=length<=160?'none':'';
      });
    })();
  </script></body></html>`;
}
let browser;
before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();});

async function setup({scriptDelay=0,missingScript=false,activityHtml=simpleActivity,answerFor}={}) {
  const context=await browser.newContext();
  context.setDefaultTimeout(10000);
  const requests=[];
  let bundleRequests=0;
  let directGroqCalls=0;
  await context.route('https://api.groq.com/**',route=>{directGroqCalls++;return route.abort('blockedbyclient');});
  await context.route(`${publicOrigin}/**`,async route=>{
    const resource=new URL(route.request().url()).pathname;
    if(resource==='/api/solve') {
      if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':new URL(activityUrl).origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'}});
      requests.push({authorization:route.request().headers().authorization,payload:route.request().postDataJSON()});
      const question=requests[requests.length-1].payload.question;
      const answer=answerFor?await answerFor(question,requests.length):{indices:question.multiple?[0,2]:[1],explanation:'Resposta simulada para verificar a leitura e a marcação.',confidence:'high'};
      return route.fulfill({headers:{'Access-Control-Allow-Origin':new URL(activityUrl).origin},json:answer});
    }
    if(resource==='/bookmarklet.js') {
      bundleRequests++;
      if(scriptDelay)await new Promise(resolve=>setTimeout(resolve,scriptDelay));
      if(missingScript)return route.fulfill({status:404,body:'Not found'});
    }
    const filename=resource==='/'?'index.html':resource.slice(1);
    if(!['index.html','install.js','style.css','hub-groq.js','bookmarklet.js'].includes(filename))return route.fulfill({status:404,body:'Not found'});
    return route.fulfill({contentType:filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html',body:readFileSync(path.join(root,'dist',filename),'utf8')});
  });
  await context.route(activityUrl,route=>route.fulfill({contentType:'text/html; charset=utf-8',headers:{'Content-Security-Policy':"form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors *.educacao.sp.gov.br *.ip.tv; upgrade-insecure-requests"},body:activityHtml}));
  const installer=await context.newPage();
  await installer.goto(publicOrigin);
  const link=installer.locator('#bookmarklet-link');
  await link.waitFor();
  const href=await link.getAttribute('href');
  assert.ok(href?.startsWith('javascript:'),'The install link must be a real bookmarklet');
  assert.ok(href.length<3000,'The bookmarklet should remain a small loader');
  assert.equal(await installer.locator('#access-token').count(),0,'Public installation must not require access codes');
  assert.equal(await link.getAttribute('draggable'),'true');
  const activity=await context.newPage();
  await activity.goto(activityUrl);
  const invoke=()=>activity.evaluate(value=>{location.href=value;},href);
  return {context,installer,activity,href,invoke,requests,bundleCount:()=>bundleRequests,directCount:()=>directGroqCalls};
}

test('public bookmarklet loads the hosted hub, marks an answer, and leaves the activity open',async()=>{
  const fixture=await setup();
  const {activity,requests,invoke}=fixture;
  try {
    await invoke();
    await activity.waitForFunction(()=>document.querySelector('input[value="4"]').checked&&document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.toasts').textContent.includes('Respostas: 1'));
    assert.equal(activity.url(),activityUrl);
    assert.equal(fixture.bundleCount(),1);
    assert.equal(fixture.directCount(),0);
    assert.equal(requests.length,1);
    assert.equal(requests[0].authorization,undefined,'Public transport must send no bearer credential');
    assert.deepEqual(Object.keys(requests[0].payload).sort(),['model','question']);
    assert.ok(!JSON.stringify(requests[0].payload).includes('gsk_'));
    assert.equal(await activity.evaluate(()=>Object.hasOwn(window,'__LUME_HOSTED_CONFIG__')),false);
    await invoke();
    await activity.waitForTimeout(150);
    assert.equal(await activity.locator('#lume-groq-hub').count(),1);
    assert.equal(fixture.bundleCount(),1,'A second bookmark click should focus the existing hub');
    assert.equal(requests.length,1);
  } finally {await fixture.context.close();}
});

test('repeated bookmark clicks while loading share one pending bundle',async()=>{
  const fixture=await setup({scriptDelay:350});
  try {
    await fixture.invoke();
    await fixture.invoke();
    await fixture.activity.waitForFunction(()=>document.querySelector('input[value="4"]').checked);
    assert.equal(fixture.bundleCount(),1);
    assert.equal(fixture.requests.length,1);
    assert.equal(await fixture.activity.locator('#lume-groq-hub').count(),1);
  } finally {await fixture.context.close();}
});

test('a blocked or missing bookmarklet bundle gives an actionable alert and permits retry',async()=>{
  const fixture=await setup({missingScript:true});
  try {
    const dialogPromise=fixture.activity.waitForEvent('dialog');
    await fixture.invoke();
    const dialog=await dialogPromise;
    assert.match(dialog.message(),/Lume|favorit|instalador|bloque|carregar/i);
    await dialog.accept();
    await fixture.activity.waitForFunction(()=>!document.querySelector('#lume-bookmarklet-loader'));
    assert.equal(await fixture.activity.locator('#lume-groq-hub').count(),0);
    assert.equal(fixture.requests.length,0);
    assert.equal(fixture.activity.url(),activityUrl);
  } finally {await fixture.context.close();}
});

test('bookmarklet reads Sala MUI sibling statements and unnamed checkbox groups before selecting both question types',async()=>{
  const fixture=await setup({activityHtml:salaActivity()});
  const {activity,requests}=fixture;
  try {
    await fixture.invoke();
    await activity.waitForFunction(()=>document.querySelector('#sala-single-card input[value="1"]').checked && document.querySelector('#sala-multi-card input[value="2"]').checked && document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.toasts').textContent.includes('Respostas: 2'));
    assert.equal(requests.length,2,'Adjacent Sala cards must remain two separate questions');
    const single=requests.find(request=>!request.payload.question.multiple)?.payload.question;
    const multiple=requests.find(request=>request.payload.question.multiple)?.payload.question;
    assert.ok(single,'A radiogroup with an icon-only label must be detected');
    assert.ok(multiple,'Unnamed checkboxes outside a fieldset must form their own group');
    assert.match(single.prompt,/Quanto é dois mais dois/);
    assert.ok(!single.prompt.includes('números são primos'));
    assert.match(multiple.prompt,/Quais números são primos/);
    assert.ok(!multiple.prompt.includes('dois mais dois'));
    assert.deepEqual(single.options.map(option=>option.text),['Dois','Quatro','Seis','Oito']);
    assert.deepEqual(multiple.options.map(option=>option.text),['2','4','7','9']);
    assert.deepEqual(await activity.locator('#sala-single-card input:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['1']);
    assert.deepEqual(await activity.locator('#sala-multi-card input:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['0','2']);
    assert.equal(requests.every(request=>request.authorization===undefined),true);
    assert.equal(fixture.directCount(),0);
    assert.equal(fixture.bundleCount(),1);
    assert.equal(activity.url(),activityUrl);
  } finally {await fixture.context.close();}
});

test('bookmarklet answers choice, lazy Sala blanks, and a bounded textarea once on the same page',async()=>{
  const responseText='A luz fornece energia para as plantas transformarem água e gás carbônico em alimento.';
  let beforeBlanks;
  let fixture;
  fixture=await setup({activityHtml:mixedSalaActivity(),answerFor:async question=>{
    if(question.kind==='blanks') {
      beforeBlanks=await fixture.activity.evaluate(()=>structuredClone(window.__salaFixture));
      return {selections:[0,1],explanation:'EXPLICACAO_NAO_PREENCHER',confidence:'high'};
    }
    if(question.kind==='text')return {text:responseText,explanation:'EXPLICACAO_NAO_PREENCHER',confidence:'high',notes:'METADADO_NAO_PREENCHER'};
    return {indices:[1],explanation:'Quatro é a alternativa correta.',confidence:'high'};
  }});
  const {activity,requests}=fixture;
  try {
    assert.equal(await activity.locator('[role="option"]').count(),0,'Sala select options must initially exist only in a lazy portal');
    await fixture.invoke();
    await activity.waitForFunction(expected=>{
      const state=window.__salaFixture;
      return document.querySelector('#mixed-choice input[value="1"]').checked &&
        state.values[0]==='plantas'&&state.values[1]==='luz'&&state.text===expected&&
        document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.toasts').textContent.includes('Respostas: 3');
    },responseText);
    assert.equal(requests.length,3,'Each of the three cards must be sent once: '+JSON.stringify(requests.map(({payload:{question}})=>({kind:question.kind||'choice',minLength:question.minLength,maxLength:question.maxLength}))));
    const questions=requests.map(request=>request.payload.question);
    const choice=questions.find(question=>question.kind===undefined);
    const blanks=questions.find(question=>question.kind==='blanks');
    const text=questions.find(question=>question.kind==='text');
    assert.ok(choice,'Existing choice questions must retain the legacy contract');
    assert.deepEqual(choice.options.map(option=>option.text),['Dois','Quatro','Seis','Oito']);
    assert.ok(blanks,'The lazy comboboxes must form a fill-in-blanks question');
    assert.match(blanks.prompt,/fotossíntese/);
    assert.match(blanks.prompt,/\[Lacuna\s*1\]/i);
    assert.match(blanks.prompt,/\[Lacuna\s*2\]/i);
    assert.equal(blanks.fields.length,2);
    for(const field of blanks.fields)assert.deepEqual(field.options.map(option=>option.text),['plantas','luz','rochas','fungos']);
    assert.ok(beforeBlanks.menuOpens>=2,'Preparing both fields must open their lazy menus');
    assert.equal(beforeBlanks.selectionsCommitted,0,'Discovering options must not select a word before the model responds');
    assert.deepEqual(beforeBlanks.values,['','']);
    assert.ok(text,'The visible multiline answer must be detected');
    assert.match(text.prompt,/Explique por que as plantas precisam de luz/);
    assert.equal(text.minLength,12,'The minimum comes from Sala Typography rather than an HTML attribute');
    assert.equal(text.maxLength,160,'The maximum comes from Sala Typography rather than an HTML attribute');
    const state=await activity.evaluate(()=>structuredClone(window.__salaFixture));
    assert.deepEqual(state.values,['plantas','luz'],'The second option index must resolve against its prepared text after the shared bank shrinks');
    assert.equal(state.selectionsCommitted,2);
    assert.ok(state.inputEvents>=1,'The text answer must emit an input event for the controlled form');
    assert.equal(state.text,responseText,'Only answer text may be written, without explanation or extra metadata');
    assert.equal(await activity.locator('textarea[aria-hidden="true"]').inputValue(),'','The autosize helper must remain untouched');
    assert.equal(await activity.locator('#mixed-text textarea:not([aria-hidden="true"])').getAttribute('maxlength'),null);
    assert.deepEqual(await activity.locator('#mixed-blanks input.MuiSelect-nativeInput').evaluateAll(inputs=>inputs.map(input=>input.value)),['plantas','luz']);
    await activity.waitForFunction(()=>document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.status-text').textContent.includes('Concluído'));
    await activity.evaluate(()=>{document.querySelector('#text-counter').textContent+=' ';});
    await activity.waitForTimeout(950);
    assert.equal(requests.length,3,'Changed select IDs, selected labels, counters, and hidden limit labels must not cause duplicate answers');
    assert.equal(fixture.bundleCount(),1);
    assert.equal(fixture.directCount(),0);
    assert.equal(requests.every(request=>request.authorization===undefined),true);
    assert.equal(activity.url(),activityUrl);
  } finally {await fixture.context.close();}
});

test('bookmarklet undo restores a Sala textarea through its input event and reduces the response count',async()=>{
  const responseText='A luz fornece a energia necessária para a fotossíntese.';
  const fixture=await setup({activityHtml:mixedSalaActivity({choice:false,blanks:false}),answerFor:()=>({text:responseText,explanation:'Isto não pertence ao campo.',confidence:'high'})});
  const {activity}=fixture;
  try {
    await fixture.invoke();
    await activity.waitForFunction(expected=>window.__salaFixture.text===expected&&document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.undo').disabled===false,responseText);
    await activity.locator('#lume-groq-hub').locator('.undo').click();
    await activity.waitForFunction(()=>window.__salaFixture.text===''&&document.querySelector('#lume-groq-hub')?.shadowRoot.querySelector('.toasts').textContent.includes('Respostas: 0'));
    assert.equal(await activity.locator('#mixed-text textarea:not([aria-hidden="true"])').inputValue(),'');
    assert.equal(await activity.locator('textarea[aria-hidden="true"]').inputValue(),'');
    assert.ok(await activity.evaluate(()=>window.__salaFixture.inputEvents>=2),'Fill and undo must both update the controlled form');
    assert.equal(fixture.requests.length,1);
    assert.equal(fixture.requests[0].payload.question.kind,'text');
    assert.match(await activity.locator('#lume-groq-hub').locator('.status-text').textContent(),/pausado/i);
  } finally {await fixture.context.close();}
});
