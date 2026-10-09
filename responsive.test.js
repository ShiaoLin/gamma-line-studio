const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync(__dirname+'/responsive.js','utf8');

// Small DOM adapter for layout-independent state transitions; no market data.
function setup(){
  const events={},windows={},elements={};let change;
  const media={matches:true,addEventListener:(_,fn)=>change=fn};
  const document={activeElement:null,body:{classList:{add(){},remove(){}}},getElementById:element,addEventListener:(n,f)=>events[n]=f};
  function element(id){return elements[id]??={id,hidden:false,attrs:{},events:{},scrollLeft:0,open:false,
    setAttribute(n,v){this.attrs[n]=v;},contains(el){return el?.parent===this;},focus(){document.activeElement=this;},scrollIntoView(){},
    addEventListener(n,f){this.events[n]=f;},append(child){child.parent=this;},showModal(){this.open=true;}};}
  const state={data:null,gammaError:'',tableError:''},weeks=[{start:'2026-10-05',end:'2026-10-09'}];
  let draws=0;
  vm.runInNewContext(script,{document,window:{matchMedia:()=>media,addEventListener:(n,f)=>windows[n]=f},GammaStudio:{state,visibleWeeks:()=>state.data?weeks:[],renderPreview(){draws++;}}});
  return {element,state,events,windows,document,draws:()=>draws,resize(n){media.matches=n;change();},load(){state.data={symbol:'TEST',asOf:'2026-10-05'};events['gamma-loaded']();}};
}
test('imports collapse compact settings, preserve selection through rotation, and desktop always shows settings',()=>{
  const h=setup();assert.equal(h.element('settingsBody').hidden,false);h.load();
  assert.equal(h.element('settingsBody').hidden,true);assert.match(h.element('settingsSummary').textContent,/TEST.*2026-10-05.*1 週/);
  h.resize(false);assert.equal(h.element('settingsBody').hidden,false);
  h.resize(true);assert.equal(h.element('settingsBody').hidden,true);
  h.element('settingsToggle').onclick();h.resize(false);h.resize(true);
  assert.equal(h.element('settingsBody').hidden,false);
});
test('import errors expose controls without repeatedly reopening a manually collapsed panel',()=>{
  const h=setup();h.load();h.state.tableError='Different date';h.events['gamma-render']();
  assert.equal(h.element('settingsBody').hidden,false);
  h.element('settingsToggle').onclick();h.events['gamma-render']();assert.equal(h.element('settingsBody').hidden,true);
  h.state.tableError='';h.events['table-applied']();h.events['gamma-render']();
  h.state.tableError='Different date';h.events['gamma-render']();assert.equal(h.element('settingsBody').hidden,false);
});
test('collapsing after Table import moves focus out of hidden controls',()=>{
  const h=setup();h.load();h.element('settingsToggle').onclick();h.document.activeElement={parent:h.element('settingsBody')};
  h.events['table-applied']();assert.equal(h.document.activeElement,h.element('settingsToggle'));
  assert.equal(h.element('settingsToggle').attrs['aria-expanded'],'false');
});
test('expanded preview reuses the chart, preserves horizontal position and restores focus on close',()=>{
  const h=setup();h.load();const chart=h.element('chartWrap'),dialog=h.element('previewDialog');chart.scrollLeft=175;
  h.element('expandPreview').onclick();assert.equal(chart.parent,h.element('previewDialogChart'));assert.equal(chart.scrollLeft,175);
  const prior=h.draws();h.windows.resize();assert.equal(h.draws(),prior+1);
  chart.scrollLeft=300;dialog.open=false;dialog.events.close();
  assert.equal(chart.parent,h.element('previewChartSlot'));assert.equal(chart.scrollLeft,300);
  assert.equal(h.document.activeElement,h.element('expandPreview'));h.windows.resize();assert.equal(h.draws(),prior+2);
});
