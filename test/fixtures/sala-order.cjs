// Public CLOUD component (chunk 4509, module 0xd4ed): plain clickable Boxes in
// the second Grid item; used words remain there with display:none. The first
// Grid item holds the answer, a local clear button, and removable word buttons.
function salaOrderActivity() {
  const words=['vida','a','luz','sustentam','a','água','e','a'];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    .MuiPaper-elevation3{margin:20px;padding:16px;box-shadow:0 2px 5px #ccc}.MuiGrid-container{display:flex;flex-wrap:wrap;gap:16px}.MuiGrid-item{width:100%}.css-qb6yjh{display:flex;justify-content:space-between}.css-1ydeh3u{display:flex;flex-wrap:wrap;min-height:42px}.css-12g5loc{display:inline-flex;cursor:pointer;border:1px solid #aaa;border-radius:16px;padding:5px 10px;margin:4px}.css-1pum5xt{cursor:pointer;display:none}.css-n4qbv5{display:none}.css-wotv2n{display:inline-flex;border:1px solid #aaa;padding:3px;margin:4px}.css-70qvj9{display:flex;align-items:center}.css-a33llz{border:0;background:none;border-radius:16px;padding:6px;cursor:pointer}.css-dsvxm6{display:none}.css-wotv2n:hover .css-dsvxm6{display:inline-flex}.MuiSvgIcon-root{width:18px;height:18px}
  </style></head><body><main><div id="cloud-order-card" class="MuiPaper-root MuiPaper-elevation MuiPaper-elevation3"><h6 class="MuiTypography-root">Questão 01</h6><div class="main"><p>Organize as palavras para formar uma frase sobre a importância da água e da luz.</p></div><div class="MuiGrid-root MuiGrid-container MuiGrid-spacing-xs-2 css-2csr8t"><div class="MuiGrid-root MuiGrid-item MuiGrid-grid-xs-12 css-1tc82b7"><div class="MuiBox-root css-qb6yjh"><p class="MuiTypography-root MuiTypography-body1">Resposta do Aluno</p><button class="MuiButtonBase-root MuiButton-root MuiButton-outlined css-n4qbv5" tabindex="0" type="button">Limpar<span class="MuiButton-icon MuiButton-endIcon"><svg class="MuiSvgIcon-root" focusable="false" aria-hidden="true" viewBox="0 0 24 25" data-testid="LixeiraIcon"><title>Lixeira</title><path d="M7 4h10v17H7z"></path></svg></span><span class="MuiTouchRipple-root"></span></button></div><div class="MuiBox-root css-1ydeh3u"></div></div><div class="MuiGrid-root MuiGrid-item MuiGrid-grid-xs-12 css-1xs0zn6">${words.map(word=>`<div class="MuiBox-root css-12g5loc" variant="" style="transform:none;transition:transform 225ms cubic-bezier(0.4,0,0.2,1)">${word}</div>`).join('')}</div></div></div></main><script>
    (()=>{
      const words=${JSON.stringify(words)};
      const grid=document.querySelector('.MuiGrid-container');
      const answer=grid.children[0].children[1];
      const bank=Array.from(grid.children[1].children);
      const clear=grid.children[0].querySelector('button');
      const state=window.__cloudFixture={selected:[],bankClicks:[],clearClicks:0,removeClicks:0,moves:0};
      const buttonClass='MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeMedium';
      function arrow(direction,position){
        const button=document.createElement('button');
        button.type='button';button.tabIndex=0;button.className=buttonClass+' css-dsvxm6';
        button.innerHTML='<svg class="MuiSvgIcon-root" aria-hidden="true" focusable="false" viewBox="0 0 24 24" data-testid="Chevron'+(direction<0?'Left':'Right')+'Icon"><path d="M10 6l6 6-6 6"></path></svg><span class="MuiTouchRipple-root"></span>';
        button.addEventListener('click',()=>{
          const other=position+direction;
          [state.selected[position],state.selected[other]]=[state.selected[other],state.selected[position]];
          state.moves++;render();
        });
        return button;
      }
      function render(){
        clear.className='MuiButtonBase-root MuiButton-root MuiButton-outlined '+(state.selected.length?'css-1iwm3vq':'css-n4qbv5');
        bank.forEach((element,index)=>{
          const used=state.selected.includes(index);
          element.className='MuiBox-root '+(used?'css-1pum5xt':'css-12g5loc');
          element.setAttribute('variant',used?'outlined':'');
        });
        answer.replaceChildren();
        state.selected.forEach((index,position)=>{
          const outer=document.createElement('div');outer.className='MuiBox-root css-wotv2n';
          outer.style.transform='none';outer.style.transition='transform 225ms cubic-bezier(0.4,0,0.2,1)';
          const inner=document.createElement('div');inner.className='MuiBox-root css-70qvj9';
          if(position>0)inner.append(arrow(-1,position));
          const word=document.createElement('button');word.type='button';word.tabIndex=0;word.className=buttonClass+' css-a33llz';
          word.textContent=words[index];
          const ripple=document.createElement('span');ripple.className='MuiTouchRipple-root';word.append(ripple);
          word.addEventListener('click',()=>{state.selected.splice(position,1);state.removeClicks++;render();});
          inner.append(word);
          if(position<state.selected.length-1)inner.append(arrow(1,position));
          outer.append(inner);answer.append(outer);
        });
      }
      bank.forEach((element,index)=>element.addEventListener('click',()=>{
        if(state.selected.includes(index))return;
        state.selected.push(index);state.bankClicks.push(index);render();
      }));
      clear.addEventListener('click',()=>{state.selected=[];state.clearClicks++;render();});
      render();
    })();
  </script></body></html>`;
}

module.exports={salaOrderActivity};
