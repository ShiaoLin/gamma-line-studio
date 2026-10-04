const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup({writeText=()=>new Promise(()=>{})}={}) {
  const source=fs.readFileSync(__dirname+'/app.js','utf8');
  const start=source.indexOf("  $('copyPine').onclick=");
  const end=source.indexOf("  $('downloadPine').onclick=",start);
  const elements={copyPine:{disabled:false,textContent:'複製 Pine Script'},pineCode:{value:'//@version=6\n測試 Pine',focus(){this.focused=true;},select(){this.selected=true;},setSelectionRange(){}},exportStatus:{textContent:'已產生 Pine Script v6'},exportDialog:{open:true,addEventListener(event,handler){this['on'+event]=handler;}},selectPine:{}};
  const context={navigator:{clipboard:{writeText}},$:id=>elements[id],copyAttempt:0,toast(){},setTimeout,clearTimeout,selectPineCode(){elements.pineCode.focus();elements.pineCode.select();}};
  context.GammaClipboard={copy:(text,options)=>require('./clipboard.js').copy(text,{...options,timeoutMs:10})};
  vm.runInNewContext(source.slice(start,end),context);
  return {elements,run:()=>elements.copyPine.onclick()};
}

test('copy click offers manual fallback when browser clipboard never settles',async()=>{
  const ui=setup();
  const result=await Promise.race([ui.run().then(()=> 'done'),new Promise(r=>setTimeout(()=>r('hung'),80))]);
  assert.equal(result,'done','copy handler must not stay pending behind a browser clipboard promise');
  assert.equal(ui.elements.pineCode.selected,true);
  assert.match(ui.elements.exportStatus.textContent,/Ctrl\+C/);
  assert.equal(ui.elements.copyPine.disabled,false);
});

test('successful browser write copies the exact generated Pine before success feedback',async()=>{
  let copied;const ui=setup({writeText:async text=>{copied=text;}});
  await ui.run();
  assert.equal(copied,ui.elements.pineCode.value);
  assert.match(ui.elements.exportStatus.textContent,/已複製/);
});

test('copy click immediately gives visible progress before waiting on browser clipboard',async()=>{
  let resolveWrite;const ui=setup({writeText:()=>new Promise(r=>resolveWrite=r)});
  const running=ui.run();
  try{assert.match(ui.elements.exportStatus.textContent,/複製中|正在複製/);assert.equal(ui.elements.copyPine.disabled,true);}
  finally{resolveWrite();await running;}
  assert.equal(ui.elements.copyPine.disabled,false);
});

test('browser rejection selects code and never reports false success',async()=>{
  const ui=setup({writeText:()=>Promise.reject(new Error('NotAllowedError'))});
  await ui.run();
  assert.equal(ui.elements.pineCode.selected,true);
  assert.match(ui.elements.exportStatus.textContent,/Ctrl\+C/);
  assert.doesNotMatch(ui.elements.exportStatus.textContent,/已複製/);
  assert.equal(ui.elements.copyPine.disabled,false);
});
test('manual selection invalidates an in-flight copy result',async()=>{
  let resolveWrite;const ui=setup({writeText:()=>new Promise(r=>resolveWrite=r)});
  const pending=ui.run();ui.elements.selectPine.onclick();
  const message=ui.elements.exportStatus.textContent;
  resolveWrite();await pending;
  assert.equal(ui.elements.exportStatus.textContent,message);
  assert.equal(ui.elements.copyPine.disabled,false);
});
test('closing the dialog invalidates an in-flight copy result',async()=>{
  let resolveWrite;const ui=setup({writeText:()=>new Promise(r=>resolveWrite=r)});
  const pending=ui.run();ui.elements.exportDialog.open=false;ui.elements.exportDialog.onclose();
  const message=ui.elements.exportStatus.textContent;
  resolveWrite();await pending;
  assert.equal(ui.elements.exportStatus.textContent,message);
});
const Clipboard=require('./clipboard.js');
test('stalled browser clipboard settles as fallback within the timeout',async()=>{
  let resolveWrite;
  const pending=Clipboard.copy('Pine',{writeText:()=>new Promise(r=>resolveWrite=r),timeoutMs:10});
  assert.equal(await pending,false);
  resolveWrite();
});
test('unsupported or throwing APIs return a manual-copy result',async()=>{
  assert.equal(await Clipboard.copy('Pine',{}),false);
  assert.equal(await Clipboard.copy('Pine',{writeText(){throw new Error('Blocked');}}),false);
  assert.equal(await Clipboard.copy('',{}),false);
});
