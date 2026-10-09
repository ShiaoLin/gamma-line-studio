const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('./core');
// Entirely invented fixtures. No market snapshots or user workspaces are included.
const plot = (traces, layout) => '<!doctype html><script>Plotly.newPlot("fixture",' + JSON.stringify(traces) + ',' + JSON.stringify(layout) + ');</script>';
const dates = ['2026-10-02','2026-10-05','2026-10-07','2026-10-09','2026-10-12','2026-10-14','2026-10-16','2026-10-23','2026-10-30','2026-11-06','2026-11-13','2026-11-20','2026-11-27'];
const layout = (symbol, spot, flip) => ({title:{text:symbol+' Dealers Gamma'},annotations:[
  {text:'Spot Price ('+spot+')',y:spot},{text:'Gamma Flip',y:flip},{text:'2026-10-02 16:00:00'}
]});
const multiGammaHTML = plot(dates.map((date, i) => ({type:'bar',orientation:'h',name:date+(date==='2026-10-16'?' (m|fixture)':''),y:[95,100,105],x:[-20-i,i%2===0?10:-15,100+i]})), layout('TESTA',100,98));
const weeklyGammaHTML = plot(['2026-10-02','2026-10-09','2026-10-16'].map((date,i)=>({type:'bar',orientation:'v',name:date,x:[190,200,210],y:[-60-i,20,80+i]})), layout('TESTB',200,197.5));
const headers = ['Expiration','dte','Gamma_Flip','Gamma_Field','Key_Delta','Call_Wall','Put_Wall'];
const rows = [['Total','',98,105,95,110,90],...dates.slice(1).map(date=>[date,(Date.parse(date)-Date.parse('2026-10-04'))/86400000,date==='2026-10-16'?97.5:100,102.5,95,110,90])];
const tableHTML = plot([{type:'table',header:{values:headers},cells:{values:headers.map((_,i)=>rows.map(row=>row[i]))}}],{title:'TESTA Table'});


const multi=C.parseHTML(multiGammaHTML,'TESTA_Gamma.html');
const weekly=C.parseHTML(weeklyGammaHTML,'TESTB_Gamma.html');
const table=C.parseTable(tableHTML, 'TESTA_Table.html');
const tiny=(traces,layout={})=>'untrusted text; Plotly.newPlot("chart",'+JSON.stringify(traces)+','+JSON.stringify(layout)+');';
test('synthetic multi-expiry HTML metadata and 13 expiries',()=>{assert.equal(multi.symbol,'TESTA');assert.equal(multi.asOf,'2026-10-02');assert.equal(multi.spot,100);assert.equal(multi.flip,98);assert.equal(multi.expiries.length,13);});
test('synthetic vertical-bar HTML metadata',()=>{assert.equal(weekly.symbol,'TESTB');assert.equal(weekly.spot,200);assert.equal(weekly.flip,197.5);});
test('calendar week includes Monday Wednesday Friday, nine groups',()=>{const ws=C.groupWeeks(multi);assert.equal(ws.length,9);assert.deepEqual(ws[1].expiries,['2026-10-05','2026-10-07','2026-10-09']);assert.deepEqual(ws[2].expiries,['2026-10-12','2026-10-14','2026-10-16']);});
test('all synthetic weekly strike sums independently match expiry source',()=>{for(const data of [multi,weekly])for(const w of C.groupWeeks(data))for(const l of w.levels){let sum=0;for(const e of data.expiries)if(w.expiries.includes(e.date))for(const item of e.levels)if(item.price===l.price)sum+=item.gamma;assert.ok(Math.abs(l.gamma-sum)<1e-6);}});
test('signed net cancels, does not sum absolute gamma',()=>{const d={asOf:'2026-10-05',expiries:[{date:'2026-10-05',levels:[{price:100,gamma:100}]},{date:'2026-10-09',levels:[{price:100,gamma:-150}]}]};assert.equal(C.groupWeeks(d)[0].levels[0].gamma,-50);assert.equal(C.groupWeeks(d)[0].levels[0].gross,250);});
test('skip expired rows using snapshot date, not machine date',()=>{const d={asOf:'2026-10-07',expiries:[{date:'2026-10-05',levels:[{price:100,gamma:1}]},{date:'2026-10-09',levels:[{price:100,gamma:3}]}]};assert.deepEqual(C.groupWeeks(d)[0].expiries,['2026-10-09']);});
test('year boundary and Sunday dates',()=>{assert.equal(C.monday('2027-01-01'),'2026-12-28');assert.equal(C.monday('2026-10-04'),'2026-09-28');assert.equal(C.monday('2026-10-05'),'2026-10-05');});
test('sign is not inferred from price vs spot',()=>{const w={levels:[{price:110,gamma:-50},{price:90,gamma:80}]};assert.deepEqual(C.selectLevels(w,100).map(x=>x.kind),['negative','positive']);});
test('threshold each side, gap and price window',()=>{const w={levels:[{price:99,gamma:100},{price:100,gamma:90},{price:105,gamma:5},{price:101,gamma:-3},{price:102,gamma:-.1},{price:150,gamma:2000}]};const levels=C.selectLevels(w,100,{topN:3,threshold:20,range:10,gap:2});assert.deepEqual(levels.map(x=>x.price),[101,99]);});
test('zero gamma and empty signs handled',()=>{assert.deepEqual(C.selectLevels({levels:[{price:100,gamma:0}]},100),[]);});
test('parse nested quoted JSON without executing HTML',()=>{global.hacked=false;const html='<script>globalThis.hacked=true</script>'+tiny([{type:'bar',name:'2026-10-09',orientation:'h',x:[7],y:[10],customdata:[['a \\" } ]']]}],{title:'TEST Gamma'});assert.equal(C.parseHTML(html).expiries[0].levels[0].gamma,7);assert.equal(global.hacked,false);});
test('mismatched lengths fail instead of silently losing rows',()=>{assert.throws(()=>C.parseHTML(tiny([{type:'bar',name:'2026-10-09',x:[1,2],y:[100]}])),/數量不同/);});
test('NaN null data do not become zero',()=>{const d=C.parseHTML(tiny([{type:'bar',name:'2026-10-09',x:[null,2],y:[100,101]}]));assert.equal(d.expiries[0].levels.length,1);assert.match(d.warnings.join(),/略過/);});
test('typed Plotly binary arrays decode',()=>{const b=Buffer.alloc(16);b.writeDoubleLE(12.5,0);b.writeDoubleLE(-25,8);assert.deepEqual(C.numericArray({dtype:'f8',bdata:b.toString('base64')}),[12.5,-25]);});
test('synthetic Table preserves CE and other Levels',()=>{assert.deepEqual(C.parseTable(tableHTML).rows,table.rows);assert.equal(table.asOf,'2026-10-04');assert.equal(table.symbol,'TESTA');assert.equal(table.rows.length,12);const r=table.rows.find(r=>r.date==='2026-10-16');assert.equal(r.flip,97.5);assert.equal(r.levels.Call_Wall,110);assert.equal(r.levels.Key_Delta,95);assert.equal(r.levels.Gamma_Field,102.5);});
test('CE defaults to latest expiration, never weighted average',()=>{const mapped=C.weeklyCE(C.groupWeeks(multi),table.rows);assert.equal(mapped[1].rows.length,1);assert.equal(mapped[1].rows[0].date,'2026-10-09');assert.equal(mapped[1].rows[0].flip,100);assert.equal(mapped[2].rows[0].flip,97.5);assert.equal(mapped[0].rows.length,0);});
test('missing Friday CE never falls back to Wednesday',()=>{const rows=table.rows.filter(r=>r.date!=='2026-10-09');assert.equal(C.weeklyCE(C.groupWeeks(multi),rows)[1].rows.length,0);});
test('optional all-CE mode retains all three dates',()=>{assert.equal(C.weeklyCE(C.groupWeeks(multi),table.rows,'all')[1].rows.length,3);});
test('Plotly Table HTML imported as columns, headers stripped',()=>{const t={type:'table',header:{values:['<b>Expiration</b>','dte','<b>Gamma_Flip</b>','Call_Wall']},cells:{values:[['Total','2026-10-09'],['',5],[207.5,230],[240,235]]}};const d=C.parseTable(tiny([t]),'TESTA_Table.html');assert.equal(d.asOf,'2026-10-04');assert.equal(d.symbol,'TESTA');assert.equal(d.rows[0].levels.Call_Wall,235);});
test('Table rejects CSV and TSV even with an HTML filename',()=>{
  for(const text of ['Expiration,Gamma_Flip\n2026-10-09,1100','Expiration\tGamma_Flip\n2026-10-09\t1100','<html><body>Expiration,Gamma_Flip\n2026-10-09,1100</body></html>']) assert.throws(()=>C.parseTable(text,'TEST_Table.html'),/HTML/);
  assert.throws(()=>C.parseTable(tableHTML,'TEST_Table.csv'),/HTML/);
});
test('Table conflicting snapshots rejected',()=>{
  const html=rs=>plot([{type:'table',header:{values:['Expiration','dte','Gamma_Flip']},cells:{values:[0,1,2].map(i=>rs.map(r=>r[i]))}}],{});
  assert.throws(()=>C.parseTable(html([['2026-10-09',5,230],['2026-10-09',5,235]])),/兩個不同/);
  assert.throws(()=>C.parseTable(html([['2026-10-09',5,230],['2026-10-16',11,235]])),/不同資料日期/);
});
test('Pine uses absolute time, week spans and deletes prior render',()=>{const w=C.groupWeeks(multi)[1];w.drawings=[{price:230,kind:'flip',enabled:true,source:'table:2026-10-09'}];const p=C.exportPine(multi,[w]);assert.match(p,/\/\/@version=6/);assert.match(p,/xloc = xloc.bar_time/);assert.match(p,/2026, 10, 5, 9, 30/);assert.match(p,/2026, 10, 9, 16, 0/);assert.match(p,/line.delete/);assert.match(p,/America\/New_York/);assert.doesNotMatch(p,/extend.right/);});
test('Pine refuses invalid symbol and 481 drawings',()=>{const w={start:'2026-10-05',end:'2026-10-09',drawings:[{price:230,kind:'flip',enabled:true,source:'manual'}]};assert.throws(()=>C.exportPine({...multi,symbol:'x"\n injected'},[w]),/代號/);assert.throws(()=>C.exportPine(multi,[{...w,drawings:Array(481).fill(w.drawings[0])}]),/480/);});
test('Pine no data fails explicitly',()=>assert.throws(()=>C.exportPine(multi,[]),/至少/));
test('price lookup uses signed weekly net and distinguishes zero from missing',()=>{
  const [week]=C.groupWeeks({asOf:'2026-10-05',expiries:[
    {date:'2026-10-05',levels:[{price:100,gamma:1000},{price:101,gamma:50}]},
    {date:'2026-10-09',levels:[{price:100,gamma:-1400},{price:101,gamma:-50}]}
  ]});
  assert.equal(C.gammaAtPrice(week,100),-400);
  assert.equal(C.gammaAtPrice(week,101),0);
  assert.equal(C.gammaAtPrice(week,100.5),null);
  assert.equal(C.gammaAtPrice(week,NaN),null);
  assert.equal(C.gammaAtPrice({...week,levels:[{price:100,gamma:200}]},100),200);
});
test('Pine price labels default to Large',()=>{const w=C.groupWeeks(multi)[1];w.drawings=[{price:230,kind:'positive',enabled:true,source:'auto'}];assert.match(C.exportPine(multi,[w]),/labelSize = input\.string\("large", "字體大小"/);});
test('hidden lines excluded and decimal precision preserved',()=>{const w={start:'2026-10-05',end:'2026-10-09',drawings:[{price:937.5,kind:'flip',enabled:true,source:'manual'},{price:999,kind:'negative',enabled:false,source:'manual'}]};const p=C.exportPine(multi,[w]);assert.match(p,/, 937.5, flipColor/);assert.doesNotMatch(p,/, 999,/);});
test('default window includes large 25% away strike and preserves adjacent levels',()=>{
  const result=C.selectLevels({levels:[{price:125,gamma:100},{price:124.5,gamma:80},{price:135,gamma:1000},{price:110,gamma:10},{price:90,gamma:-40}]},100);
  assert.deepEqual(result.map(l=>l.price),[125,124.5,90]);
});
test('inspection preserves expiry signs without mutating weekly net or drawings',()=>{
  const w=C.groupWeeks({asOf:'2026-10-05',expiries:[{date:'2026-10-05',levels:[{price:100,gamma:40}]},{date:'2026-10-09',levels:[{price:100,gamma:-90},{price:110,gamma:20}]}]})[0];
  w.drawings=[{price:100,kind:'negative',source:'manual',enabled:true}];const before=JSON.stringify(w);
  assert.deepEqual(C.inspectionLevels(w,'2026-10-05').map(l=>[l.price,l.gamma]),[[100,40]]);
  assert.equal(C.inspectionLevels(w,'all')[0].gamma,-50);assert.equal(JSON.stringify(w),before);
});
test('full reset discards manual overrides, restores hidden auto and last-date Table CE',()=>{
  const w=C.groupWeeks(multi)[1];w.drawings=[{price:999,kind:'flip',source:'manual',enabled:true},{price:235,kind:'positive',source:'auto',enabled:false}];
  const restored=C.resetDrawings([w],multi.spot,table.rows.map(r=>({...r,asOf:table.asOf})))[0];
  assert.ok(restored.drawings.every(l=>l.enabled && l.source!=='manual'));
  assert.ok(restored.drawings.some(l=>l.price===105&&l.kind==='positive'));
  const ce=restored.drawings.filter(l=>l.kind==='flip');assert.equal(ce.length,1);assert.equal(ce[0].price,100);assert.match(ce[0].source,/snapshot 2026-10-04/);
  assert.equal(w.drawings[0].price,999);
});
test('reset with missing last-date CE does not substitute an earlier expiry',()=>{
  const w=C.groupWeeks(multi)[1];assert.equal(C.resetDrawings([w],multi.spot,table.rows.filter(r=>r.date!=='2026-10-09'))[0].drawings.filter(l=>l.kind==='flip').length,0);
});
test('nan expiry labels yield actionable error even when annotation dates exist',()=>{
  assert.throws(()=>C.parseHTML(tiny([{type:'bar',name:'nan',x:[1],y:[100]}],{annotations:[{text:'2026-10-09 +sigma'}]})),/到期日標籤為 nan/);
});

test('expiry DTE uses HTML labels, accepts zero, and falls back to snapshot date for old workspaces',()=>{
  assert.deepEqual(C.expiryDTE({date:'2026-10-09',name:'2026-10-09 (w|週) 0 dte GEX: 10'},'2026-10-09'),{days:0,source:'html'});
  assert.deepEqual(C.expiryDTE({date:'2026-10-16',name:'2026-10-16 (m|月) 7 dte'},'2026-10-09'),{days:7,source:'html'});
  assert.equal(C.expiryDTE({date:'2026-10-16',name:'2026-10-16 8 DTE'},'2026-10-09').days,8);
  assert.deepEqual(C.expiryDTE({date:'2026-10-16'},'2026-10-09'),{days:7,source:'date'});
  assert.equal(C.expiryDTE({date:'2027-01-01'},'2026-12-31').days,1);
  assert.equal(C.expiryDTE({date:'invalid'},'2026-10-09').days,null);
});
test('weekly DTE shows actual expiry ranges, including holiday weeks ending Thursday',()=>{
  const data={asOf:'2026-10-09',expiries:[{date:'2026-10-12',name:'2026-10-12 3 dte'},{date:'2026-10-14',name:'2026-10-14 5 dte'},{date:'2026-10-16',name:'2026-10-16 7 dte'}]};
  assert.equal(C.weekDTE(data,{expiries:data.expiries.map(e=>e.date)}).label,'3–7 天');
  assert.equal(C.weekDTE(data,{expiries:['2026-10-16']}).label,'7 天');
  assert.equal(C.weekDTE({asOf:'2026-11-23',expiries:[{date:'2026-11-26'}]},{expiries:['2026-11-26']}).label,'3 天');
});
test('price axes use uniform integer 1/2/5 steps, cover the requested range, and never round drawing prices',()=>{
  for(const [low,high] of [[.01,.9],[3.2,8.7],[92.35,114.65],[164.7,297.3],[840.25,1200.75],[6874.12,8137.5],[100,100]]){
    const a=C.integerPriceAxis(low,high);
    assert.ok(a.low<=low&&a.high>=high&&a.high>a.low);assert.ok(a.step>=1&&Number.isInteger(a.step));
    assert.ok(a.ticks.every(Number.isInteger));assert.ok(a.ticks.length>=2&&a.ticks.length<=10);
    assert.ok(a.ticks.slice(1).every((p,i)=>p-a.ticks[i]===a.step));
    assert.ok([1,2,5].includes(a.step/10**Math.floor(Math.log10(a.step))));
  }
  assert.deepEqual(C.integerPriceAxis(0,6).ticks,[0,1,2,3,4,5,6]);
  assert.equal(C.integerPriceAxis(0,70).step,10);assert.equal(C.integerPriceAxis(0,350).step,50);assert.equal(C.integerPriceAxis(0,700).step,100);
});
test('desktop fits all ten or twelve weeks; more weeks wrap into rows and mobile retains horizontal space',()=>{
  for(const n of [10,12]){const grid=C.previewLayout(n,1520,true);assert.equal(grid.width,1520);assert.equal(grid.rows,1);assert.equal(grid.columns,n);}
  const many=C.previewLayout(32,1520,true);assert.equal(many.width,1520);assert.ok(many.rows>1);assert.ok(many.columns*many.rows>=32);
  const mobile=C.previewLayout(12,358,false);assert.ok(mobile.width>358);assert.equal(mobile.rows,1);
  assert.equal(C.previewLayout(1,358,false).columns,1);
});
