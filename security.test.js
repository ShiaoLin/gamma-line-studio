const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const vm=require('node:vm');
const C=require('./core');
const {createServer}=require('./server');
const plot=(data,layout={})=>'<html><script>Plotly.newPlot("fixture",'+JSON.stringify(data)+','+JSON.stringify(layout)+');</script></html>';
const table=(columns,headers=['Expiration','Gamma_Flip'])=>plot([{type:'table',header:{values:headers},cells:{values:columns}}]);
const validTable=table([['2026-10-09'],[100]]);
const validGamma=plot([{type:'bar',orientation:'h',name:'2026-10-09',x:[-5,10],y:[95,105]}],{title:'TEST Gamma'});

test('Table rejects object/string lengths before expanding columns',()=>{
  for(const column of [{length:1000},'x'.repeat(1000),null])
    assert.throws(()=>C.parseTable(table([column,column])),/必須是資料陣列/);
});
test('Table bounds real arrays by rows, columns and expanded cell count',()=>{
  assert.throws(()=>C.parseTable(table([Array(10001).fill('2026-10-09'),[100]])),/安全上限/);
  const headers=['Expiration','Gamma_Flip',...Array(63).fill('Extra')];
  assert.throws(()=>C.parseTable(table(headers.map(()=>[]),headers)),/安全上限/);
  const wide=['Expiration','Gamma_Flip',...Array(19).fill('Extra')];
  assert.throws(()=>C.parseTable(table(wide.map((_,i)=>i===0?Array(10000).fill('2026-10-09'):[]),wide)),/安全上限/);
});
test('ragged columns, missing CE, decorated headers and later figures stay supported',()=>{
  const html=plot([{type:'scatter',x:[1],y:[2]}])+table([['Total','2026-10-09','2026-10-16'],['',100],['','1,100','1,200']],['<b>Expiration</b>','<b>Gamma_Flip</b>','Call_Wall']);
  const result=C.parseTable(html.replace('Plotly.newPlot','Plotly.react'),'TEST_Table.HTML');
  assert.equal(result.rows[0].flip,100);assert.equal(result.rows[1].flip,null);assert.equal(result.rows[1].levels.Call_Wall,1200);
});
test('Table content and extension both enforce HTML-only input',()=>{
  for(const text of ['Expiration,Gamma_Flip\n2026-10-09,100','Expiration\tGamma_Flip\n2026-10-09\t100','<p>Expiration,Gamma_Flip\n2026-10-09,100</p>'])
    assert.throws(()=>C.parseTable(text,'renamed.html'),/HTML/);
  for(const ext of ['csv','tsv','txt','json'])assert.throws(()=>C.parseTable(validTable,'file.'+ext),/HTML/);
  assert.equal(C.parseTable(validTable,'file.htm').rows[0].flip,100);
  assert.equal(C.parseDelimited,undefined);
});
test('unnamed or missing Table columns remain compatible without bypassing size limits',()=>{
  assert.equal(C.parseTable(table([['2026-10-09'],[100],['unused']])).rows[0].flip,100);
  assert.equal(C.parseTable(table([['2026-10-09'],[100]],['Expiration','Gamma_Flip','Call_Wall'])).rows[0].levels.Call_Wall,undefined);
  assert.throws(()=>C.parseTable(table([['2026-10-09'],[100],...Array(63).fill([])])),/安全上限/);
});
test('unclosed HTML-like text is cleaned within a deadline, including Unicode-escaped input',()=>{
  const source=fs.readFileSync(__dirname+'/core.js','utf8');
  for(const method of ['parseHTML','parseTable'])for(const escaped of [false,true]){
    let text=method==='parseHTML'?plot([{type:'bar',name:'2026-10-09',x:[1],y:[100]}],{title:'<'.repeat(50000)}):table([['2026-10-09'],[100],['<'.repeat(50000)]],['Expiration','Gamma_Flip','Extra']);
    if(escaped)text=text.replaceAll('<','\\u003c');
    const context=vm.createContext({text,method});vm.runInContext(source,context);
    vm.runInContext('result=GammaCore[method](text)',context,{timeout:1000});
    assert.ok(context.result);
  }
  assert.equal(C.parseHTML(plot([{type:'bar',name:'2026-10-09',x:[1],y:[100]}],{title:'<b>TEST</b> Gamma <unclosed'})).title,'TEST Gamma <unclosed');
});
test('both parsers reject truncated, overly deep and excessive candidates within a VM deadline',()=>{
  const source=fs.readFileSync(__dirname+'/core.js','utf8');
  for(const method of ['parseHTML','parseTable'])for(const text of [
    'Plotly.newPlot("x",['.repeat(1000),
    'Plotly.newPlot("x",'+ '['.repeat(65)+'0'+']'.repeat(65)+',{});',
    'Plotly.newPlot("x",[],{});'.repeat(65)
  ]){
    const context=vm.createContext({text,method});vm.runInContext(source,context);
    vm.runInContext('try { GammaCore[method](text); } catch(e) { message=e.message; }',context,{timeout:1000});
    assert.match(context.message,/安全上限|截斷/);
  }
});
test('shared JSON scan budget stops overlapping retries and is not swallowed by optional Table layout',()=>{
  assert.throws(()=>C.readJSON('[1,2,3]',0,{remaining:2,figures:0}),/安全上限/);
  const payload=validTable.replace(',{});',','+'['.repeat(65)+'0'+']'.repeat(65)+');');
  assert.throws(()=>C.parseTable(payload),/安全上限/);
  assert.throws(()=>C.parseTable(validTable.replace(',{});',',{"title":')),/截斷/);
});
test('optional Table metadata, malformed unrelated figures and escaped JSON retain compatibility',()=>{
  const noLayout=validTable.replace(',{});',');');
  assert.equal(C.parseTable(noLayout).rows[0].flip,100);
  const prefix='Plotly.newPlot("irrelevant",notJSON);';
  assert.equal(C.parseTable(prefix+validTable).rows[0].flip,100);
  assert.equal(C.parseHTML(prefix+validGamma).expiries[0].levels[0].gamma,-5);
  const quoted=table([['2026-10-09'],[100],['quote \\" ] { text']],['Expiration','Gamma_Flip','Extra']);
  assert.equal(C.parseTable(quoted).rows.length,1);
});
test('Table core limits input size even without a file picker',()=>{
  assert.throws(()=>C.parseTable(' '.repeat(35*1024*1024+1)),/35 MB/);
});
test('ordinary HTML table fallback validates row and cell counts',()=>{
  const context=vm.createContext({DOMParser:class {parseFromString(){return{querySelectorAll(){return{length:10002}}}}},input:'<table></table>'});
  vm.runInContext(fs.readFileSync(__dirname+'/core.js','utf8'),context);
  assert.throws(()=>vm.runInContext('GammaCore.parseTable(input)',context),/安全上限/);
});
test('CSV controls/producers are removed while Pine and JSON paths remain wired',()=>{
  const shell=fs.readFileSync(__dirname+'/shell.html','utf8'),app=fs.readFileSync(__dirname+'/app.js','utf8'),tableUI=fs.readFileSync(__dirname+'/table.js','utf8');
  assert.doesNotMatch(shell+app+tableUI,/downloadCSV|pickTableCSV|tableText|otherTableImport|ceBookmark|grabTable|text\/csv/);
  assert.match(shell,/id="tableFile"[^>]*accept="\.html,\.htm"/);
  assert.match(app,/\$\('saveProject'\)\.onclick/);assert.match(app,/validateProject\(JSON.parse\(text\)\)/);
  assert.match(app,/\$\('downloadPine'\)\.onclick/);assert.match(app,/\$\('copyPine'\)\.onclick/);
  const elements=new Proxy({}, {get:(target,id)=>target[id]??=(id==='tableFile'?{value:'x'}:{value:'',click(){},showModal(){},close(){}})});
  const state={data:{},weeks:[]};
  vm.runInNewContext(tableUI,{GammaCore:C,GammaStudio:{state,activeWeek(){},render(){},toast(){},uid(){}},document:{getElementById:id=>elements[id],addEventListener(){}}});
  elements.importCE.onclick();assert.equal(elements.applyCE.disabled,true);
});
test('legacy JSON drawings round-trip without changing manual state or Pine',()=>{
  const app=fs.readFileSync(__dirname+'/app.js','utf8');
  const context=vm.createContext({C});
  vm.runInContext(app.slice(app.indexOf('  function validateProject('),app.indexOf('  async function importFiles(')),context);
  const data=C.parseHTML(validGamma,'TEST_Gamma.html'),weeks=C.groupWeeks(data);
  weeks[0].drawings=[{price:100,kind:'flip',source:'manual',enabled:true}];
  const session={data,weeks,from:weeks[0].start,to:weeks[0].start,options:{...C.DEFAULT_OPTIONS}};
  context.project=JSON.parse(JSON.stringify({app:'Gamma Line Studio',version:1,session}));
  const restored=vm.runInContext('validateProject(project)',context);
  assert.equal(JSON.stringify(restored),JSON.stringify(session));
  assert.equal(C.exportPine(restored.data,restored.weeks),C.exportPine(data,weeks));
});
test('invalid HTTP paths return 400 and the same loopback server keeps serving valid paths',async t=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=url=>new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port:server.address().port,path:url},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject);});
  for(const url of ['/%','/%FF','/%E0%A4%A','/%00','/file%00.html'])assert.equal((await request(url)).status,400,url);
  assert.equal((await request('/%2e%2e%2foutside.txt')).status,403);
  if(process.platform==='win32')assert.equal((await request('/%2e%2e%5coutside.txt')).status,403);
  assert.equal((await request('/')).status,200);
  assert.equal((await request('/'+encodeURIComponent('Gamma價位工作台.html'))).status,200);
});
