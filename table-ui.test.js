const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('./core');
const tableScript=fs.readFileSync(__dirname+'/table.js','utf8');
const appScript=fs.readFileSync(__dirname+'/app.js','utf8');
// Invented data only: the same file must follow identical checks via picker and drop.
const html='<script>Plotly.newPlot("test",'+JSON.stringify([{type:'table',header:{values:['Expiration','dte','Gamma_Flip']},cells:{values:[['2026-10-07','2026-10-09'],[2,4],[99,100]]}}])+',{"title":"TEST Table"});</script>';
const file=(name='TEST_Table.html')=>({name,size:html.length,text:async()=>html});
function setup(){
  const events={},elements={};let counter=0;
  function element(id){return elements[id]??={value:'',disabled:false,open:false,clicks:0,classList:{add(){},remove(){}},click(){this.clicks++;},showModal(){this.open=true;},close(){this.open=false;}};}
  const state={data:{symbol:'TEST',asOf:'2026-10-05'},weeks:[{id:'2026-10-05',start:'2026-10-05',end:'2026-10-09',expiries:['2026-10-07','2026-10-09'],drawings:[]}],ceRows:[],cePolicy:'last',tableError:'',busy:false};
  vm.runInNewContext(tableScript,{GammaCore:C,GammaStudio:{state,activeWeek(){},render(){},toast(){},uid:()=>String(++counter)},document:{getElementById:element,addEventListener:(name,fn)=>{events[name]=fn;}}});
  return {state,element,events,drop:files=>element('importCE').ondrop({preventDefault(){},dataTransfer:{files}}),choose:files=>element('tableFile').onchange({target:{files}})};
}
test('Table click opens the picker directly; cancelling leaves existing lines alone',()=>{
  const h=setup();h.state.weeks[0].drawings=[{price:101,kind:'positive',source:'manual',enabled:true}];
  h.element('importCE').onclick();assert.equal(h.element('tableFile').clicks,1);assert.equal(h.element('ceReview').hidden,true);
  assert.equal(h.state.weeks[0].drawings[0].price,101);assert.equal(h.state.tableError,'');
});
test('matching Table applies immediately from picker or drop; both CE policies remain',async()=>{
  for(const route of ['choose','drop']){
    const h=setup();await h[route]([file()]);
    assert.equal(h.element('ceReview').hidden,true);assert.equal(h.state.ceRows.length,2);assert.equal(h.state.tableError,'');
    assert.equal(h.state.weeks[0].drawings.length,1);assert.equal(h.state.weeks[0].drawings[0].price,100);
    h.element('cePolicy').value='all';h.element('cePolicy').onchange();assert.equal(h.state.weeks[0].drawings.length,2);
  }
});
test('Table drops reject multiple files, CSV and oversized files without replacing applied data',async()=>{
  for(const files of [[file(),file()],[file('TEST_Table.csv')],[{...file(),size:35*1024*1024+1}]]){
    const h=setup();h.state.ceRows=[{date:'2026-10-09',flip:105}];await h.drop(files);
    assert.equal(h.element('applyCE').disabled,true);assert.ok(h.state.tableError);assert.equal(h.state.ceRows[0].flip,105);
  }
});
test('clearing a live file input does not erase the selected file before reading',async()=>{
  const h=setup(),files=[file()];
  Object.defineProperty(h.element('tableFile'),'value',{get:()=>'',set:()=>{files.length=0;}});
  await h.choose(files);
  assert.equal(files.length,0);assert.equal(h.state.ceRows.length,2);assert.equal(h.element('ceReview').hidden,true);
});
test('Table mismatch checks still apply after drop and explicit cross-date consent is required',async()=>{
  const h=setup();h.state.data.asOf='2026-10-04';await h.drop([file()]);
  assert.equal(h.element('ceReview').hidden,false);assert.equal(h.state.ceRows.length,0);assert.ok(h.state.tableError);
  assert.equal(h.element('applyCE').disabled,true);h.element('allowMismatch').checked=true;h.element('allowMismatch').oninput();
  assert.equal(h.element('applyCE').disabled,false);
  h.element('applyCE').onclick();assert.equal(h.state.ceRows[0].asOf,'2026-10-05');assert.equal(h.state.tableError,'');assert.equal(h.element('ceReview').hidden,true);
  const other=setup();other.state.data.symbol='OTHER';await other.drop([file()]);assert.equal(other.element('applyCE').disabled,true);
});
test('missing metadata can be completed inline; unrelated weeks cannot be auto-applied',async()=>{
  const h=setup();const noMeta=html.replace(',"dte"','').replace('[2,4],','').replace('TEST Table','');
  await h.drop([{name:'Table.html',size:noMeta.length,text:async()=>noMeta}]);
  assert.equal(h.state.ceRows.length,0);assert.equal(h.element('ceFields').hidden,false);
  h.element('ceSymbol').value='TEST';h.element('ceDate').value='2026-10-05';h.element('ceDate').oninput();h.element('applyCE').onclick();
  assert.equal(h.state.ceRows.length,2);
  const other=setup();other.state.weeks[0].start='2026-11-02';other.state.weeks[0].end='2026-11-06';await other.drop([file()]);
  assert.equal(other.state.ceRows.length,0);assert.equal(other.element('applyCE').disabled,true);
});
test('auto-import replaces Table lines but preserves manual CE and never opens a dialog',async()=>{
  const h=setup();h.state.weeks[0].drawings=[{price:101,kind:'flip',source:'manual',enabled:true},{price:98,kind:'flip',source:'table:old',enabled:true}];
  await h.drop([file()]);assert.equal(h.state.weeks[0].drawings.length,1);assert.equal(h.state.weeks[0].drawings[0].price,101);
  assert.doesNotMatch(tableScript,/showModal|ceDialog/);assert.doesNotMatch(fs.readFileSync(__dirname+'/shell.html','utf8'),/id="ceDialog"/);
});
test('a pending Table read cannot populate a newly loaded Gamma session',async()=>{
  const h=setup();let finish;
  const loading=h.drop([{...file(),text:()=>new Promise(resolve=>{finish=resolve;})}]);
  assert.equal(h.element('importCE').disabled,true);
  h.state.data={symbol:'OTHER',asOf:'2026-10-05'};h.events['gamma-loaded']();finish(html);await loading;
  assert.equal(h.element('applyCE').disabled,true);assert.equal(h.element('ceSymbol').value,'');assert.equal(h.state.ceRows.length,0);assert.equal(h.element('importCE').disabled,false);
});
test('Level text round-trips verbatim in workspaces, clears on new Gamma, and is never Pine content',()=>{
  const data={symbol:'TEST',asOf:'2026-10-05',warnings:[],expiries:[{date:'2026-10-09',levels:[{price:105,gamma:10}]}]};
  const weeks=C.groupWeeks(data);weeks[0].drawings=[{price:105,kind:'positive',source:'manual',enabled:true}];
  const text='<script>alert("inert")</script>\nCall Wall: 110; Put Wall: 90';
  const state={data,weeks,from:weeks[0].start,to:weeks[0].start,selected:weeks[0].start,options:{...C.DEFAULT_OPTIONS},levelText:text};
  const context=vm.createContext({C,state,uid:()=>1,render(){},regenerate(){},fillSelectors(){},optionsSync(){},notice(){},$:()=>({}),document:{dispatchEvent(){}},Event:class{}});
  const extract=(start,end)=>appScript.slice(appScript.indexOf(start),appScript.indexOf(end));
  vm.runInContext(extract('  function snapshot()','  function optionsSync()')+extract('  function validateProject(','  async function importFiles(')+extract('  function loadData(','  function fillSelectors('),context);
  vm.runInContext('saved=JSON.parse(JSON.stringify({app:"Gamma Line Studio",version:1,session:snapshot()})); restored=validateProject(saved); loadData(restored.data,restored);',context);
  assert.equal(state.levelText,text);assert.equal(context.restored.levelText,text);
  assert.doesNotMatch(C.exportPine(data,weeks),/inert|Call Wall/);
  vm.runInContext('loadData(state.data)',context);assert.equal(state.levelText,'');
  for(const invalid of [{value:'object'},'x'.repeat(50001)]){context.saved.session.levelText=invalid;assert.throws(()=>vm.runInContext('validateProject(saved)',context),/Level/);}
  delete context.saved.session.levelText;assert.doesNotThrow(()=>vm.runInContext('validateProject(saved)',context));
});
