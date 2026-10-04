(function(){
  'use strict';
  const C=GammaCore,S=GammaStudio,$=id=>document.getElementById(id);let pending=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function preview(){
    if(!pending||!S.state.data)return;
    const symbol=$('ceSymbol').value.trim().toUpperCase(),date=$('ceDate').value,sameSymbol=symbol===S.state.data.symbol&&(!pending.symbol||pending.symbol===symbol),sameDate=date===S.state.data.asOf;
    const matches=C.weeklyCE(S.state.weeks,pending.rows,S.state.cePolicy),covered=matches.filter(w=>w.rows.length).length;
    const overlaps=pending.rows.some(r=>S.state.weeks.some(w=>r.date>=w.start&&r.date<=w.end));
    $('mismatchChoice').hidden=!date||sameDate;
    if(sameDate)$('allowMismatch').checked=false;
    const msgs=[`已讀取 ${pending.rows.length} 個到期日，可對應 ${covered} 個結算週。`,`Gamma：${S.state.data.symbol} / ${S.state.data.asOf}；Table：${symbol||'未辨識代號'} / ${date||'未辨識日期'}`];
    if(!sameSymbol)msgs.push('股票代號不一致：Table 必須和 Gamma 為同一股票。');
    if(!date)msgs.push('Table 缺少日期，請填寫資料實際日期。');
    else if(!sameDate)msgs.push('資料日期不同。若有意跨日比較，請勾選下方選項。');
    if(covered<S.state.weeks.length)msgs.push('未匹配到最後到期日的結算週會保持空白，不用較早的 CE 補上。');
    msgs.push(...pending.warnings);$('cePreview').textContent=msgs.join('\n');
    if(!overlaps)msgs.push('Table 與目前 Gamma 沒有重疊的結算週，無法套用。');
    $('cePreview').textContent=msgs.join('\n');
    $('applyCE').disabled=!(sameSymbol&&C.dateValid(date)&&overlaps&&(sameDate||$('allowMismatch').checked));
  }
  function parse(text,name=''){
    try{pending=C.parseTable(text,name);$('ceSymbol').value=pending.symbol||'';$('ceSymbol').readOnly=!!pending.symbol;$('ceDate').value=pending.asOf||'';$('ceDate').readOnly=!!pending.asOf;$('allowMismatch').checked=false;preview();}
    catch(e){fail(e.message);}
  }
  function fail(message){pending=null;$('cePreview').textContent=message;$('applyCE').disabled=true;$('mismatchChoice').hidden=true;S.state.tableError=message;S.render();}
  function applyRows(){
    const mapped=C.weeklyCE(S.state.weeks,S.state.ceRows,S.state.cePolicy);
    for(const w of S.state.weeks){w.drawings=w.drawings.filter(l=>!l.source.startsWith('table:'));if(w.drawings.some(l=>l.kind==='flip'&&l.source==='manual'))continue;
      const rows=mapped.find(x=>x.id===w.id).rows;
      for(const r of rows)w.drawings.push({id:S.uid(),kind:'flip',price:r.flip,enabled:true,source:`table:${r.date} / snapshot ${r.asOf||'unknown'}`});
    }
    S.render();
  }
  function renderReference(){
    const week=S.activeWeek();if(!week)return;
    const rows=S.state.ceRows.filter(r=>r.date>=week.start&&r.date<=week.end),last=week.expiries.at(-1);
    const fields=['Gamma_Flip','Gamma_Field','Key_Delta','Call_Wall','Put_Wall','Call_Dominate','Put_Dominate','Pos_1Sigma','Neg_1Sigma'];
    $('tableReferenceCaption').textContent=`${week.end.slice(5)} 結算週 · 黃線預設取 ${last} 的 Gamma_Flip · 其他欄位保留 Table 原值`;
    $('tableReference').innerHTML=rows.length?'<table><thead><tr><th>Expiration</th>'+fields.map(f=>'<th>'+f+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.date)+(r.date===last?' ●':'')+'</td>'+fields.map(f=>'<td class="'+(f==='Gamma_Flip'?'flip':'')+'">'+esc((f==='Gamma_Flip'?r.flip:r.levels?.[f])??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p class="empty-text">本週尚無 Table 資料，Level 價位保持空白。</p>';
  }
  function clearPending(){pending=null;$('tableText').value='';$('ceSymbol').value='';$('ceDate').value='';$('ceSymbol').readOnly=false;$('ceDate').readOnly=false;$('allowMismatch').checked=false;$('mismatchChoice').hidden=true;$('cePreview').textContent='尚未載入 Table。';$('applyCE').disabled=true;$('otherTableImport').open=false;}
  $('importCE').onclick=()=>{if(!S.state.data)return;clearPending();$('ceDialog').showModal();};
  $('pickTable').onclick=()=>{$('tableFile').accept='.html,.htm';$('tableFile').click();};
  $('pickTableCSV').onclick=()=>{$('tableFile').accept='.csv,.tsv,.txt';$('tableFile').click();};
  $('tableFile').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    pending=null;$('applyCE').disabled=true;$('cePreview').textContent='正在讀取 Table…';
    for(const id of ['pickTable','pickTableCSV','parseTable'])$(id).disabled=true;
    try{if(f.size>35*1024*1024)throw new Error('Table 檔案上限為 35 MB。');parse(await f.text(),f.name);}
    catch(error){fail(error.message);}
    finally{for(const id of ['pickTable','pickTableCSV','parseTable'])$(id).disabled=false;$('tableFile').value='';}
  };
  $('parseTable').onclick=()=>parse($('tableText').value);
  for(const id of ['ceSymbol','ceDate','allowMismatch'])$(id).oninput=preview;
  $('applyCE').onclick=()=>{preview();if($('applyCE').disabled)return;S.state.ceRows=pending.rows.map(r=>({...r,asOf:$('ceDate').value}));S.state.tableMeta={filename:pending.filename||'貼上的 Table',symbol:$('ceSymbol').value.trim().toUpperCase(),asOf:$('ceDate').value};S.state.tableError='';applyRows();$('ceDialog').close();S.toast('已套用 Table CE 與 Levels，保留手動黃線');};
  $('cePolicy').onchange=()=>{S.state.cePolicy=$('cePolicy').value;applyRows();};
  document.addEventListener('gamma-render',renderReference);renderReference();
  document.addEventListener('gamma-loaded',clearPending);
  function grabTable(){
    const cols=Array.from(document.querySelectorAll('g.y-column')).map(g=>({name:g.querySelector('[id="header"]')?.textContent,values:Array.from(g.querySelectorAll('[id="cells1"] .cell-text')).map(t=>t.textContent)})).filter(c=>c.name);
    if(!cols.some(c=>c.name==='Expiration')||!cols.some(c=>c.name==='Gamma_Flip')){alert('請先在 Lieta 選擇 Table 並查詢股票。');return;}
    const symbol=Array.from(document.querySelectorAll('input')).map(x=>x.value.trim()).find(x=>/^[A-Z][A-Z0-9.]{0,12}$/.test(x))||'';
    const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
    const csv=(symbol?'# symbol='+symbol+'\n':'')+cols.map(c=>quote(c.name)).join(',')+'\n'+cols[0].values.map((_,i)=>cols.map(c=>quote(c.values[i])).join(',')).join('\n');
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.href=url;a.download=(symbol||'Lieta')+'_Table.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  $('ceBookmark').href='javascript:('+grabTable.toString()+')();void(0)';
  $('ceBookmark').onclick=e=>{e.preventDefault();S.toast('請將連結拖到書籤列，再於 Lieta Table 頁面使用');};
})();
