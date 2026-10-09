(function(){
  'use strict';
  const C=GammaCore,S=GammaStudio,$=id=>document.getElementById(id);let pending=null,reading=false,readId=0;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function preview(){
    if(!pending||!S.state.data||S.state.busy){$('applyCE').disabled=true;return;}
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
    try{
      pending=C.parseTable(text,name);$('ceSymbol').value=pending.symbol||'';$('ceSymbol').readOnly=!!pending.symbol;$('ceDate').value=pending.asOf||'';$('ceDate').readOnly=!!pending.asOf;$('allowMismatch').checked=false;
      $('ceFields').hidden=false;$('applyCE').hidden=false;preview();
      if(!$('applyCE').disabled)commitTable();
      else{S.state.tableError='Table 尚未套用，請在載入區下方核對代號、日期與結算週。';S.render();}
    }
    catch(e){fail(e.message);}
  }
  function fail(message){pending=null;$('ceReview').hidden=false;$('ceFields').hidden=true;$('cePreview').textContent=message;$('applyCE').disabled=true;$('applyCE').hidden=true;$('mismatchChoice').hidden=true;S.state.tableError=message;S.render();}
  function commitTable(){
    preview();if($('applyCE').disabled)return;
    S.state.ceRows=pending.rows.map(r=>({...r,asOf:$('ceDate').value}));
    S.state.tableMeta={filename:pending.filename||'Table HTML',symbol:$('ceSymbol').value.trim().toUpperCase(),asOf:$('ceDate').value};
    S.state.tableError='';pending=null;$('applyCE').disabled=true;$('ceReview').hidden=true;
    applyRows();document.dispatchEvent(new Event('table-applied'));S.toast('已載入 Table，更新 CE 與 Levels，保留手動黃線');
  }
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
  function clearPending(){readId++;reading=false;pending=null;$('importCE').disabled=false;$('tableFile').value='';$('ceReview').hidden=true;$('ceFields').hidden=true;$('ceSymbol').value='';$('ceDate').value='';$('ceSymbol').readOnly=false;$('ceDate').readOnly=false;$('allowMismatch').checked=false;$('mismatchChoice').hidden=true;$('cePreview').textContent='尚未載入 Table。';$('applyCE').disabled=true;$('applyCE').hidden=true;}
  function pickTable(){if(!S.state.data||S.state.busy||reading)return;clearPending();$('tableFile').click();}
  async function importTable(files){
    const selected=Array.from(files);
    if(!selected.length||reading||S.state.busy)return;
    if(!S.state.data){S.toast('請先載入 Gamma HTML，再匯入相同 ticker 的 Table。');return;}
    clearPending();$('ceReview').hidden=false;
    if(selected.length!==1){fail('一次請載入一份 Table HTML。');return;}
    const f=selected[0],request=++readId,gamma=S.state.data;reading=true;
    $('cePreview').textContent='正在讀取 Table…';$('importCE').disabled=true;
    try{
      if(!/\.html?$/i.test(f.name))throw new Error('Table 僅接受 HTML 檔案。');
      if(f.size>35*1024*1024)throw new Error('Table 檔案上限為 35 MB。');
      const text=await f.text();
      if(request!==readId||gamma!==S.state.data||S.state.busy)return;
      parse(text,f.name);
    }catch(error){if(request===readId&&gamma===S.state.data&&!S.state.busy)fail(error.message);}
    finally{if(request===readId){reading=false;$('importCE').disabled=false;$('tableFile').value='';}}
  }
  $('importCE').onclick=pickTable;
  $('tableFile').onchange=e=>importTable(e.target.files);
  $('importCE').ondragover=e=>{e.preventDefault();if(S.state.data&&!S.state.busy&&!reading)$('importCE').classList.add('drag-over');};
  $('importCE').ondragleave=()=>$('importCE').classList.remove('drag-over');
  $('importCE').ondrop=e=>{e.preventDefault();$('importCE').classList.remove('drag-over');return importTable(e.dataTransfer.files);};
  for(const id of ['ceSymbol','ceDate','allowMismatch'])$(id).oninput=preview;
  $('applyCE').onclick=commitTable;
  $('cePolicy').onchange=()=>{S.state.cePolicy=$('cePolicy').value;applyRows();};
  document.addEventListener('gamma-render',renderReference);renderReference();
  document.addEventListener('gamma-loaded',clearPending);
})();
