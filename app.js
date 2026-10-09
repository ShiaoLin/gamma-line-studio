(function () {
  'use strict';
  const C = GammaCore, $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const price = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 });
  const compact = v => { const a = Math.abs(v); return (v < 0 ? '−' : '+') + (a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(0)); };
  const uid = () => 'l' + (++nextId); let nextId = 0, toastTimer;
  const state = { data: null, weeks: [], from: '', to: '', selected: '', options: { ...C.DEFAULT_OPTIONS }, ceRows: [], cePolicy: 'last', tableMeta: null, levelText: '', inspection: { expiry: 'all', allPrices: false, price: null }, gammaError: '', tableError: '', busy: false };
  function toast(s) { $('toast').textContent = s; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3300); }
  function notice(s, error = false) { $('notice').textContent = s; $('notice').hidden = !s; $('notice').classList.toggle('error', error); }
  function activeWeek() { return state.weeks.find(w => w.id === state.selected); }
  function visibleWeeks() { return state.weeks.filter(w => w.start >= state.from && w.start <= state.to); }
  function snapshot() { return { data: state.data, weeks: state.weeks, from: state.from, to: state.to, selected: state.selected, options: state.options, ceRows: state.ceRows, cePolicy: state.cePolicy, tableMeta: state.tableMeta, levelText: state.levelText, inspection: state.inspection }; }
  function optionsSync() {
    for (const k of ['topN', 'threshold', 'range', 'gap']) if(k!=='gap'||document.activeElement!==$('gap')) $(k).value = state.options[k];
    if ($('cePolicy')) $('cePolicy').value = state.cePolicy;
    if (document.activeElement !== $('levelText')) $('levelText').value = state.levelText;
    $('topNOut').textContent = state.options.topN;
    $('thresholdOut').textContent = state.options.threshold + '%';
    $('rangeOut').textContent = state.options.range ? state.options.range + '%' : '全部';
  }
  function regenerate() {
    if (!state.data) return;
    for (const w of state.weeks) {
      const manual = (w.drawings || []).filter(l => l.source !== 'auto' && l.source !== 'html-flip');
      const auto = C.selectLevels(w, state.data.spot, state.options).filter(l => !manual.some(m => m.kind === l.kind && Math.abs(m.price - l.price) < 1e-7));
      w.drawings = [...auto.map(l => ({ ...l, id: uid() })), ...manual];
    }
    render();
  }
  function loadData(data, session) {
    const groups=C.groupWeeks(data);
    if (!groups.length) throw new Error('所有到期日都早於資料日期，沒有可畫的結算週。');
    state.data = data;
    state.weeks = groups.map(w => ({ ...w, drawings: [] }));
    state.ceRows = []; state.cePolicy = 'last'; state.tableMeta = null; state.levelText = '';
    state.options = { ...C.DEFAULT_OPTIONS }; state.inspection = { expiry: 'all', allPrices: false, price: null };
    state.gammaError = ''; state.tableError = ''; $('lineWidth').value = '3';
    state.from = state.weeks[0].start; state.to = C.addDays(state.from, 21); state.selected = state.from;
    if (session) {
      Object.assign(state, { from: session.from, to: session.to, selected: session.selected, options: { ...session.options }, ceRows: session.ceRows || [], cePolicy: session.cePolicy || 'last', tableMeta: session.tableMeta || null, levelText: session.levelText || '', inspection: { ...state.inspection, ...session.inspection } });
      for (const w of state.weeks) w.drawings = (session.weeks.find(x => x.id === w.id)?.drawings || []).filter(l=>l.source!=='html-flip').map(l => ({ ...l, id: uid() }));
      render();
    } else regenerate();
    fillSelectors(); optionsSync(); render(); notice(data.warnings.join('\n'));
    document.dispatchEvent(new Event('gamma-loaded'));
  }
  function fillSelectors() {
    const opts = state.weeks.map(w => `<option value="${w.start}">${w.end.slice(5)}${w.monthly ? ' 月結' : ''} · ${C.weekDTE(state.data,w).label}</option>`).join('');
    $('fromWeek').innerHTML = opts; $('toWeek').innerHTML = opts;
    const vs = visibleWeeks(); if (!vs.length) { state.from = state.weeks[0].start; state.to = state.weeks[0].start; }
    $('fromWeek').value = state.from; $('toWeek').value = visibleWeeks().at(-1).start;
    document.querySelectorAll('[data-horizon]').forEach(b => b.classList.toggle('active', state.from === state.weeks[0].start && (b.dataset.horizon === 'all' ? state.to === state.weeks.at(-1).start : state.to === C.addDays(state.from, (Number(b.dataset.horizon)-1)*7))));
  }
  function renderStatus() {
    const output = $('workflowStatus');
    output.dataset.state = !state.data ? 'empty' : 'gamma-ready';
    if (state.busy) { output.dataset.state='loading'; output.textContent='正在讀取 Gamma，請稍候…'; return; }
    const error = state.gammaError || state.tableError;
    if (error) { output.dataset.state='error'; output.textContent='匯入失敗：'+error+(state.data?' 目前保留先前畫面供核對，匯出已停用；請重新匯入有效檔案。':' 請重新選取有效檔案。'); return; }
    if (!state.data) { output.textContent='尚未載入資料。先匯入 Gamma HTML，再匯入相同 ticker 的 Table HTML。'; return; }
    const dates=[...new Set(state.ceRows.map(r=>r.asOf).filter(Boolean))];
    const vs=visibleWeeks(), mapped=C.weeklyCE(vs,state.ceRows,state.cePolicy), missing=mapped.filter(w=>!w.rows.length).map(w=>vs.find(v=>v.id===w.id).expiries.at(-1));
    const today=new Date(), todayDate=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    const age=Math.round((Date.parse(todayDate)-Date.parse(state.data.asOf))/86400000);
    const parts=[`Gamma 已載入：${state.data.symbol} · ${state.data.timestamp || state.data.asOf}`];
    if (age>7) parts.push(`資料日期距今 ${age} 個曆日，請核對是否為你要研究的快照。`);
    if (age<0) parts.push('Gamma 資料日期晚於本機今天日期，請核對。');
    if (!state.ceRows.length) parts.push('Table 尚未匯入；目前可匯出 Gamma 線。');
    else {
      parts.push(`Table 已配對：${state.tableMeta?.filename || state.data.symbol} · ${dates.join(' / ') || '日期未記錄'}`);
      if (dates.some(d=>d!==state.data.asOf)) parts.push('已接受 Gamma / Table 跨日配對，Pine 會標示兩份日期。');
      parts.push(missing.length?`所選範圍缺少 Table CE：${missing.join('、')}（${state.cePolicy==='last'?'最後到期日':'該週無有效值'}）；不會自動補值。`:'所選結算週的 Table CE 已齊全。');
      output.dataset.state=missing.length?'partial':'ready';
    }
    output.textContent=parts.join('\n');
  }
  function render() {
    const loaded=!!state.data;
    $('loadedContent').hidden=!loaded; $('emptyState').hidden=loaded;
    $('analysisControls').disabled=!loaded || state.busy;
    $('saveProject').disabled=!loaded || state.busy;
    $('exportBtn').disabled=!loaded || state.busy || !!state.gammaError || !!state.tableError;
    $('uploadBtn').disabled=state.busy; $('emptyUpload').disabled=state.busy;
    optionsSync(); renderStatus();
    if (!loaded) return;
    const data = state.data, weeks = visibleWeeks();
    if (!weeks.some(w => w.id === state.selected)) state.selected = weeks[0]?.id;
    const lines = weeks.flatMap(w => w.drawings.filter(l => l.enabled));
    $('symbolMetric').textContent = data.symbol; $('dateMetric').textContent = data.asOf;
    $('spotMetric').textContent = price(data.spot);
    $('weeksMetric').textContent = `${weeks.reduce((s,w) => s + w.expiries.length, 0)} → ${weeks.length}`;
    $('rangeMetric').textContent = weeks.length ? `${weeks[0].start.slice(5)} — ${weeks.at(-1).end.slice(5)}` : '尚未選取';
    $('linesMetric').textContent = lines.length;
    $('linesDetail').textContent = `正 ${lines.filter(l=>l.kind==='positive').length} / 負 ${lines.filter(l=>l.kind==='negative').length} / CE ${lines.filter(l=>l.kind==='flip').length}`;
    $('loadStatus').textContent = `${data.symbol} 已載入`;
    $('fileInfo').textContent = `${data.filename || data.symbol + '_Gamma.html'}\n${data.timestamp || data.asOf}`;
    const ceDates=[...new Set(state.ceRows.map(r=>r.asOf).filter(Boolean))];
    $('ceInfo').textContent=state.ceRows.length?`Table ${ceDates.join(' / ')} · ${state.ceRows.length} 個到期日${ceDates.some(d=>d!==data.asOf)?' · 與 Gamma 日期不同':''}`:'尚未匯入 Table。CE 與 Level 價位一律以 Table 為準。';
    $('chartCaption').textContent = `資料 ${data.asOf} · ${lines.length} 條線 · 價位示意（非 K 線）`;
    $('weekTabs').innerHTML = weeks.map(w => `<button data-week="${w.id}" title="${esc(C.weekDTE(data,w).rows.map(r=>r.date+': '+r.days+' 天'+(r.source==='date'?'（依資料日期計算）':'（HTML）')).join('；'))}" class="${w.id === state.selected ? 'active' : ''}" aria-pressed="${w.id === state.selected}">${w.end.slice(5)}${w.monthly ? ' 月結' : ''}<small>DTE ${C.weekDTE(data,w).label}</small></button>`).join('');
    renderPreview(); renderDetails(); optionsSync(); document.dispatchEvent(new Event('gamma-render'));
    $('exportBtn').disabled ||= !lines.length;
  }
  function renderPreview() {
    if (!state.data) return;
    const weeks = visibleWeeks(), data = state.data, svg = $('preview'), wrap = $('chartWrap');
    const all = weeks.flatMap(w => w.drawings.filter(l => l.enabled).map(l => l.price));
    if (data.spot) all.push(data.spot);
    if (!all.length) all.push(0, 100);
    const min = Math.min(...all), max = Math.max(...all), pad = Math.max((max-min)*.14, max*.015, 1);
    const axis = C.integerPriceAxis(min-pad, max+pad);
    const fit = window.matchMedia('(min-width: 1024px)').matches;
    const available = wrap.clientWidth - (wrap.parentElement.id === 'previewDialogChart' ? 0 : 16);
    const longest = Math.max(...all.map(p => price(p).length), 5);
    const grid = C.previewLayout(weeks.length, available, fit, Math.max(110, longest * 9 + 28));
    const W = grid.width, enlarged = $('previewDialog').open;
    const rowHeight = enlarged && grid.rows === 1 ? Math.max(250, Math.min(520, $('previewDialogChart').clientHeight - 20)) : 480;
    const H = rowHeight * grid.rows, left = 24, right = W - 89;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.width = W + 'px'; svg.style.minWidth = W + 'px'; svg.style.height = H + 'px';
    const mode = fit ? (grid.rows > 1 ? `適寬總覽 · ${grid.rows} 排` : '適寬總覽') : '左右滑動查看各週';
    $('previewHint').textContent = `${mode}；新增與改價請使用價位編輯。`;
    if (enlarged) $('previewDialogContext').textContent = `${data.symbol} · ${data.asOf} · ${mode}`;
    let out = `<rect width="${W}" height="${H}" fill="#121922"/>`;
    for (let row = 0; row < grid.rows; row++) {
      const batch = weeks.slice(row * grid.columns, (row + 1) * grid.columns), offset = row * rowHeight;
      const top = offset + 48, bottom = offset + rowHeight - 45;
      const col = (right-left) / Math.max(batch.length, 1), y = p => bottom-(p-axis.low)/(axis.high-axis.low)*(bottom-top);
      for (const p of axis.ticks) {
        const yy = y(p);
        out += `<line class="grid" x1="${left}" x2="${right}" y1="${yy}" y2="${yy}"/><text class="axis price-axis" x="${right+10}" y="${yy+4}">${p.toLocaleString('en-US',{maximumFractionDigits:0})}</text>`;
      }
      batch.forEach((w,i) => {
        const x=left+i*col;
        out += `<rect x="${x}" y="${top}" width="${col}" height="${bottom-top}" fill="${w.id===state.selected?'#88dca909':'transparent'}"/><line class="grid" x1="${x}" x2="${x}" y1="${top}" y2="${bottom}"/><text data-week="${w.id}" class="svg-week" x="${x+col/2}" y="${offset+25}" fill="${w.id===state.selected?'#bcead0':'#b4c0d1'}" font-size="12" text-anchor="middle">${w.end.slice(5)}${w.monthly?' · 月結':''}</text><text class="axis" x="${x+col/2}" y="${offset+rowHeight-14}" text-anchor="middle">${w.start.slice(5)} — ${w.end.slice(5)}</text>`;
        const labelYs=[];
        w.drawings.filter(l=>l.enabled).sort((a,b)=>b.price-a.price).forEach(l=>{
          const yy=y(l.price), color=C.COLORS[l.kind], hideLabel=l.kind==='negative'&&w.drawings.some(other=>other.enabled&&other.kind==='flip'&&Math.abs(other.price-l.price)<1e-7);
          let ty=yy+18;
          if(!hideLabel){for(const old of labelYs)if(Math.abs(ty-old)<16)ty=old+16;labelYs.push(ty);}
          out+=`<g class="preview-line" data-line="${l.id}" data-week="${w.id}"><title>${esc(l.kind)} ${price(l.price)} · ${esc(l.source)}${C.gammaAtPrice(w,l.price)!==null?' · 整週淨 Gamma '+compact(C.gammaAtPrice(w,l.price)):''}</title><line class="visible-line" x1="${x+12}" x2="${x+col-12}" y1="${yy}" y2="${yy}" stroke="${color}" stroke-width="3" stroke-linecap="round"/><text visibility="${hideLabel?'hidden':'visible'}" x="${x+col/2}" y="${ty}" fill="${color}" text-anchor="middle" font-size="15" paint-order="stroke" stroke="#121922" stroke-width="4">${price(l.price)}</text></g>`;
        });
      });
      if(data.spot){const yy=y(data.spot);out+=`<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="#7c929f" stroke-dasharray="3 5" opacity=".7"/><rect x="${right+4}" y="${yy-10}" width="80" height="21" rx="3" fill="#30484b"/><text class="spot-price" x="${right+44}" y="${yy+4}" fill="#d6f2ed" font-size="11" text-anchor="middle">${price(data.spot)}</text>`;}
    }
    if(!weeks.some(w=>w.drawings.some(l=>l.enabled)))out+=`<text x="${W/2}" y="210" fill="#a4b2c4" font-size="14" text-anchor="middle">尚無符合條件的價位，可放寬篩選或手動加線</text>`;
    svg.innerHTML=out;
  }
  function gammaCell(w,l) {
    const gamma=C.gammaAtPrice(w,l.price);
    const sign=gamma>0?'pos':gamma<0?'neg':'';
    const title=gamma===null?'此週原始 Gamma 分布沒有此價位；不估算或沿用舊值。':`整週淨 Gamma：${gamma.toLocaleString('en-US',{maximumFractionDigits:20})}（同價位各到期日帶正負號加總）`;
    return `<details class="gamma-number"><summary class="gamma-value ${sign}" aria-label="${esc(title)}">${gamma===null?'—':gamma===0?'0':compact(gamma)}</summary><span class="gamma-exact">${gamma===null?'無對應原始價位':gamma.toLocaleString('en-US',{maximumFractionDigits:20})}</span></details>`;
  }
  function renderDetails() {
    const w=activeWeek();if(!w)return;
    if (!w.expiries.includes(state.inspection.expiry)) state.inspection.expiry='all';
    $('inspectExpiry').innerHTML='<option value="all">整週合併</option>'+w.expiries.map(d=>`<option value="${d}">${d} · DTE ${C.expiryDTE(state.data.expiries.find(e=>e.date===d),state.data.asOf).days} 天</option>`).join('');
    $('inspectExpiry').value=state.inspection.expiry; $('inspectAll').checked=state.inspection.allPrices;
    $('distributionTitle').textContent=`${w.end.slice(5)} 結算週 · Gamma 分布`;
    $('expiryCaption').textContent=state.inspection.expiry==='all'?'到期日 '+w.expiries.map(s=>s.slice(5)).join(' / '):'單一到期日 '+state.inspection.expiry+' · 僅切換觀察，輸出仍按週合併';
    const rows=w.drawings.slice().sort((a,b)=>b.price-a.price);
    const sourceName=l=>l.source==='auto'?'自動':l.source==='html-flip'?'整體 Flip':l.source.startsWith('table:')?'Table '+l.source.slice(6,16).slice(5):'手動';
    $('levelRows').innerHTML=rows.length?rows.map(l=>`<tr data-id="${l.id}"><td class="line-enabled"><label class="line-visibility"><input type="checkbox" data-action="enabled" aria-label="顯示 ${price(l.price)}" ${l.enabled?'checked':''}><span>顯示</span></label></td><td class="line-kind" data-label="類型"><select data-action="kind" aria-label="${price(l.price)} 線條類型"><option value="positive" ${l.kind==='positive'?'selected':''}>＋ Gamma</option><option value="negative" ${l.kind==='negative'?'selected':''}>− Gamma</option><option value="flip" ${l.kind==='flip'?'selected':''}>Flip / CE</option></select></td><td class="line-price" data-label="價位"><input type="number" inputmode="decimal" min="0.0001" step="any" value="${l.price}" data-action="price" aria-label="${price(l.price)} 價位"></td><td class="line-gamma" data-label="整週淨 Gamma">${gammaCell(w,l)}</td><td class="line-source" data-label="來源" title="${esc(l.source)}">${esc(sourceName(l))}</td><td class="line-remove"><button data-action="remove" class="remove" aria-label="移除 ${price(l.price)}">×</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-text">尚無價位，請按「加線」。</td></tr>';
    const ce=w.drawings.find(l=>l.kind==='flip');$('weekFlip').value=ce?.price??'';
    $('weekFlipNote').textContent=ce?`黃線來源：${sourceName(ce)}。手動套用會取代此週既有黃線。`:'此週尚無 CE。匯入 Lieta Table，或直接填入你確認的價位。';
    renderDistribution(w);
  }
  function inspectedLevels(w) {
    return C.inspectionLevels(w,state.inspection.expiry).filter(l=>state.inspection.allPrices||!state.data.spot||!state.options.range||Math.abs(l.price/state.data.spot-1)<=state.options.range/100+1e-10).slice().sort((a,b)=>b.price-a.price);
  }
  function renderContribution(w,levels) {
    if(!levels.some(l=>l.price===state.inspection.price)) state.inspection.price=levels.slice().sort((a,b)=>Math.abs(b.gamma)-Math.abs(a.gamma))[0]?.price ?? null;
    $('inspectPrice').innerHTML=levels.map(l=>`<option value="${l.price}">${price(l.price)} · ${compact(l.gamma)}</option>`).join('');
    $('inspectPrice').value=state.inspection.price??'';
    const weekly=w.levels.find(l=>l.price===state.inspection.price);
    $('toggleInspectLevel').disabled=!weekly || weekly.gamma===0;
    $('inspectPrice').disabled=!levels.length;
    if(!weekly){$('contributionDetails').textContent='此範圍沒有可觀察的價位。';return;}
    const selected=w.drawings.some(l=>l.enabled&&l.kind!=='flip'&&l.price===weekly.price);
    $('toggleInspectLevel').textContent=selected?'隱藏本週價位':'加入本週價位';
    $('contributionDetails').innerHTML=`<table><caption>${price(weekly.price)} · 各到期日貢獻</caption><thead><tr><th>到期日</th><th>Gamma</th></tr></thead><tbody>`+w.expiries.map(d=>{
      const parts=weekly.contributions.filter(c=>c.expiry===d),sum=parts.reduce((s,c)=>s+c.gamma,0);
      return `<tr><td>${d}</td><td class="${sum>0?'pos':sum<0?'neg':''}">${parts.length?compact(sum):'—'}</td></tr>`;
    }).join('')+`<tr><td>整週淨 Gamma</td><td class="${weekly.gamma>0?'pos':weekly.gamma<0?'neg':''}">${compact(weekly.gamma)}</td></tr></tbody></table>`+(weekly.gamma===0?'<p class="hint">整週正負抵銷為 0，不加入 Gamma 線。</p>':'');
  }
  function renderDistribution(w){
    const levels=inspectedLevels(w);
    const height=Math.max(350,levels.length*16+50), mid=242,max=Math.max(...levels.map(l=>Math.abs(l.gamma)),1), dy=(height-48)/Math.max(levels.length,1);
    $('distribution').setAttribute('viewBox',`0 0 460 ${height}`);
    let out=`<line x1="${mid}" x2="${mid}" y1="25" y2="${height-20}" stroke="#4b596a"/><text x="105" y="16" class="axis">− Gamma</text><text x="322" y="16" class="axis">+ Gamma</text>`;
    levels.forEach((l,i)=>{const yy=30+i*dy,len=Math.abs(l.gamma)/max*155,positive=l.gamma>=0,chosen=w.drawings.some(d=>d.enabled&&d.kind!=='flip'&&Math.abs(d.price-l.price)<1e-7);out+=`<g class="distribution-bar" data-price="${l.price}" opacity="${chosen?1:.52}"><title>${price(l.price)}：${compact(l.gamma)}${chosen?'（已選）':''}</title><rect x="55" y="${yy-7}" width="360" height="${Math.max(dy,14)}" fill="transparent"/><text x="48" y="${yy+4}" fill="${chosen?'#f1f5fa':'#a3b3c6'}" font-size="11" text-anchor="end">${price(l.price)}</text><rect x="${positive?mid:mid-len}" y="${yy-5}" width="${Math.max(1,len)}" height="${Math.min(10,dy-3)}" rx="2" fill="${positive?C.COLORS.positive:C.COLORS.negative}"/><text x="${positive?mid+len+5:mid-len-5}" y="${yy+3}" fill="${positive?C.COLORS.positive:C.COLORS.negative}" font-size="9" text-anchor="${positive?'start':'end'}">${chosen?'●':''}</text></g>`;});
    if(!levels.length)out+='<text x="230" y="180" text-anchor="middle" class="axis">此範圍沒有 Gamma 資料</text>';
    $('distribution').innerHTML=out;
    $('distributionScope').textContent=(state.inspection.allPrices||!state.options.range?'全部履約價':`快照現價 ±${state.options.range}%`)+` · ${levels.length} 個價位。觀察設定不改動選線；加入時採整週淨 Gamma。`;
    renderContribution(w,levels);
  }
  function download(name, content, type='text/plain;charset=utf-8'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  let copyAttempt=0;
  function selectPineCode(){const field=$('pineCode');field.focus();field.select();field.setSelectionRange(0,field.value.length);}
  function makeExport(){
    copyAttempt++;$('copyPine').textContent='複製 Pine Script';
    try{if(!state.data||state.busy||state.gammaError||state.tableError)throw new Error('請先成功載入並核對資料。');const code=C.exportPine({...state.data,symbol:$('symbolInput').value},visibleWeeks(),{width:Number($('lineWidth').value)});$('pineCode').value=code;$('exportStatus').textContent='已產生 Pine Script v6';$('copyPine').disabled=false;$('downloadPine').disabled=false;$('exportSummary').textContent=`${visibleWeeks().length} 個結算週 · ${visibleWeeks().flatMap(w=>w.drawings.filter(l=>l.enabled)).length} 條線 · 資料 ${state.data.asOf}`;}
    catch(e){$('pineCode').value='';$('exportStatus').textContent=e.message;$('copyPine').disabled=true;$('downloadPine').disabled=true;}
  }
  function validateProject(p){
    if(p.app!=='Gamma Line Studio'||p.version!==1||!p.session)throw new Error('這不是 Gamma Line Studio 工作檔。');
    const s=p.session,d=s.data;
    if(!d||!C.dateValid(d.asOf)||!Array.isArray(d.expiries)||d.expiries.length>500||!Array.isArray(d.warnings)||typeof d.symbol!=='string')throw new Error('工作檔的資料格式無效。');
    for(const e of d.expiries)if(!C.dateValid(e.date)||!Array.isArray(e.levels)||e.levels.length>50000||e.levels.some(l=>!Number.isFinite(l.price)||l.price<=0||!Number.isFinite(l.gamma)))throw new Error('工作檔含無效 Gamma 數據。');
    if(!Array.isArray(s.weeks)||s.weeks.length>500||!C.dateValid(s.from)||!C.dateValid(s.to)||s.from>s.to)throw new Error('工作檔的結算範圍無效。');
    for(const w of s.weeks)if(!C.dateValid(w.id)||!Array.isArray(w.drawings)||w.drawings.length>500||w.drawings.some(l=>!Number.isFinite(l.price)||l.price<=0||!C.COLORS[l.kind]||typeof l.source!=='string'||typeof l.enabled!=='boolean'))throw new Error('工作檔含無效線條。');
    for(const [k,min,max]of[['topN',1,8],['threshold',0,100],['range',0,50],['gap',0,1e9]])if(!Number.isFinite(s.options?.[k])||s.options[k]<min||s.options[k]>max)throw new Error('工作檔的篩選值無效。');
    if(s.cePolicy && !['last','all'].includes(s.cePolicy))throw new Error('工作檔的 CE 取值方式無效。');
    if(s.levelText !== undefined && (typeof s.levelText !== 'string' || s.levelText.length > 50000))throw new Error('工作檔的 Level 文字格式無效或超過 50,000 字元。');
    if(s.inspection && (typeof s.inspection.allPrices!=='boolean'||(s.inspection.expiry!=='all'&&!C.dateValid(s.inspection.expiry))||(s.inspection.price!==null&&(!Number.isFinite(s.inspection.price)||s.inspection.price<=0))))throw new Error('工作檔的觀察設定無效。');
    if(s.ceRows && (!Array.isArray(s.ceRows)||s.ceRows.length>500||s.ceRows.some(r=>!C.dateValid(r.date)||(r.flip!==null&&(!Number.isFinite(r.flip)||r.flip<=0))||(r.asOf&&!C.dateValid(r.asOf)))))throw new Error('工作檔的 Table CE 格式無效。');
    return s;
  }
  async function importFiles(files){
    if(state.busy || !files.length)return;
    if(files.length!==1){notice('一次請載入一份 Gamma HTML 或工作檔；目前工作區只處理一個 ticker。',true);return;}
    const file=files[0];state.busy=true;render();notice('');
    try{if(file.size>35*1024*1024)throw new Error('檔案超過 35 MB');const text=await file.text();if(/\.json$/i.test(file.name)){const s=validateProject(JSON.parse(text));loadData(s.data,s);}else loadData(C.parseHTML(text,file.name));toast(`已載入 ${state.data.symbol}${/\.json$/i.test(file.name)?' 工作檔':'，篩選已恢復預設'}`);}
    catch(e){state.gammaError=file.name+'：'+e.message;notice(state.gammaError,true);}
    finally{state.busy=false;$('files').value='';render();}
  }
  $('uploadBtn').onclick=()=>$('files').click();$('files').onchange=e=>importFiles(e.target.files);
  $('emptyUpload').onclick=()=>$('files').click();
  $('levelText').oninput=()=>{state.levelText=$('levelText').value;};
  $('uploadBtn').ondragover=e=>{e.preventDefault();$('uploadBtn').classList.add('drag-over');};$('uploadBtn').ondragleave=()=>$('uploadBtn').classList.remove('drag-over');$('uploadBtn').ondrop=e=>{e.preventDefault();$('uploadBtn').classList.remove('drag-over');importFiles(e.dataTransfer.files);};
  for(const id of ['fromWeek','toWeek'])$(id).onchange=()=>{state.from=$('fromWeek').value;state.to=$('toWeek').value;if(state.from>state.to){if(id==='fromWeek')state.to=state.from;else state.from=state.to;}fillSelectors();render();document.querySelectorAll('[data-horizon]').forEach(b=>b.classList.remove('active'));};
  document.querySelectorAll('[data-horizon]').forEach(b=>b.onclick=()=>{state.from=state.weeks[0].start;state.to=b.dataset.horizon==='all'?state.weeks.at(-1).start:C.addDays(state.from,(Number(b.dataset.horizon)-1)*7);fillSelectors();render();document.querySelectorAll('[data-horizon]').forEach(x=>x.classList.toggle('active',x===b));});
  for(const id of ['topN','threshold','range','gap'])$(id).onchange=()=>{const n=Number($(id).value);if(!Number.isFinite(n)||n<0){$(id).value=state.options[id];return;}state.options[id]=n;regenerate();};
  for(const id of ['topN','threshold','range'])$(id).oninput=()=>{$(id+'Out').textContent=$(id).value+(id==='topN'?'':'%');};
  $('gap').oninput=()=>{const raw=$('gap').value,n=Number(raw);if(raw!==''&&Number.isFinite(n)&&n>=0){state.options.gap=n;regenerate();}};
  $('resetAuto').onclick=()=>{regenerate();toast('已更新自動線，手動調整已保留');};
  $('resetDefaults').onclick=()=>{
    state.options={...C.DEFAULT_OPTIONS};
    state.weeks=C.resetDrawings(state.weeks,state.data.spot,state.ceRows,state.cePolicy).map(w=>({...w,drawings:w.drawings.map(l=>({...l,id:uid()}))}));
    render();toast('已恢復 3 / 20% / ±30% / 0，清除手動線並依 Table 重建 CE');
  };
  $('weekTabs').onclick=e=>{const b=e.target.closest('[data-week]');if(b){state.selected=b.dataset.week;render();}};
  $('preview').onclick=e=>{const target=e.target.closest('.svg-week');if(target){state.selected=target.dataset.week;render();}};
  function togglePrice(p){const w=activeWeek(),l=w.levels.find(x=>x.price===p);state.inspection.price=p;if(!l||l.gamma===0){toast('此價位整週淨 Gamma 為 0，不加入線條');renderDetails();return;}const existing=w.drawings.find(x=>x.kind!=='flip'&&x.price===p);if(existing)existing.enabled=!existing.enabled;else w.drawings.push({...l,id:uid(),kind:l.gamma>0?'positive':'negative',source:'manual',enabled:true});render();}
  $('distribution').onclick=e=>{const g=e.target.closest('[data-price]');if(g)togglePrice(Number(g.dataset.price));};
  $('inspectExpiry').onchange=()=>{state.inspection.expiry=$('inspectExpiry').value;state.inspection.price=null;renderDetails();};
  $('inspectAll').onchange=()=>{state.inspection.allPrices=$('inspectAll').checked;renderDetails();};
  $('inspectPrice').onchange=()=>{state.inspection.price=Number($('inspectPrice').value);renderContribution(activeWeek(),inspectedLevels(activeWeek()));};
  $('toggleInspectLevel').onclick=()=>togglePrice(state.inspection.price);
  let addLevelWeek=null;
  function validateNewLevel(showError=false){
    const input=$('newLevelPrice'),raw=input.value.trim(),value=Number(raw);
    const valid=raw!==''&&Number.isFinite(value)&&value>0;
    if(showError){$('newLevelError').textContent=valid?'':'請輸入大於 0 的有效價格。';input.setAttribute('aria-invalid',String(!valid));}
    return valid;
  }
  $('addLevel').onclick=()=>{
    const w=activeWeek();if(!w)return;
    addLevelWeek=w.id;$('addLevelForm').reset();$('newLevelError').textContent='';$('newLevelPrice').removeAttribute('aria-invalid');
    $('addLevelContext').textContent=`${state.data.symbol} · ${w.end} 結算週`;
    $('addLevelDialog').showModal();$('newLevelPrice').focus();
  };
  $('newLevelPrice').onblur=()=>validateNewLevel(true);
  $('newLevelPrice').oninput=()=>{if($('newLevelPrice').getAttribute('aria-invalid')==='true')validateNewLevel(true);};
  $('addLevelForm').onsubmit=e=>{
    e.preventDefault();if(!validateNewLevel(true)){$('newLevelPrice').focus();return;}
    const w=state.weeks.find(w=>w.id===addLevelWeek),kind=$('newLevelKind').value;
    if(!w||!Object.hasOwn(C.COLORS,kind))return;
    const value=Number($('newLevelPrice').value);
    w.drawings.push({id:uid(),price:value,kind,source:'manual',enabled:true});
    $('addLevelDialog').close();render();toast(`已加入 ${price(value)}，來源為手動`);
  };
  $('addLevelDialog').addEventListener('close',()=>{addLevelWeek=null;$('addLevel').focus();});
  $('levelRows').onchange=e=>{const row=e.target.closest('[data-id]');if(!row)return;const l=activeWeek().drawings.find(x=>x.id===row.dataset.id),action=e.target.dataset.action;if(action==='enabled')l.enabled=e.target.checked;else if(action==='price'){const n=Number(e.target.value);if(!Number.isFinite(n)||n<=0){toast('請輸入大於 0 的有效價位');renderDetails();return;}l.price=n;l.source='manual';}else if(action==='kind'){l.kind=e.target.value;l.source='manual';}render();};
  $('levelRows').oninput=e=>{if(e.target.dataset.action!=='price')return;const n=Number(e.target.value),row=e.target.closest('[data-id]');if(!row||!Number.isFinite(n)||n<=0)return;const w=activeWeek(),l=w.drawings.find(x=>x.id===row.dataset.id);l.price=n;l.source='manual';row.querySelector('.line-source').textContent='手動';row.querySelector('.line-source').title='manual';row.querySelector('.line-gamma').innerHTML=gammaCell(w,l);renderPreview();};
  $('levelRows').onclick=e=>{if(e.target.dataset.action!=='remove')return;const id=e.target.closest('[data-id]').dataset.id;activeWeek().drawings=activeWeek().drawings.filter(l=>l.id!==id);render();};
  $('setFlip').onclick=()=>{const p=Number($('weekFlip').value);if(!Number.isFinite(p)||p<=0){toast('請填入有效的 Flip / CE 價位');return;}const w=activeWeek();w.drawings=w.drawings.filter(l=>l.kind!=='flip');w.drawings.push({id:uid(),kind:'flip',price:p,source:'manual',enabled:true});render();};
  $('exportBtn').onclick=()=>{$('symbolInput').value=state.data.symbol;makeExport();$('exportDialog').showModal();};$('symbolInput').oninput=makeExport;$('lineWidth').onchange=makeExport;
  $('copyPine').onclick=async()=>{
    const code=$('pineCode').value,attempt=++copyAttempt;
    if(!code)return;
    $('copyPine').disabled=true;$('copyPine').textContent='複製中…';
    $('exportStatus').textContent='正在複製 Pine Script…';
    const copied=await GammaClipboard.copy(code,{
      writeText:typeof navigator.clipboard?.writeText==='function'?text=>navigator.clipboard.writeText(text):undefined
    });
    if(attempt!==copyAttempt||!$('exportDialog').open)return;
    $('copyPine').disabled=false;
    $('copyPine').textContent=copied?'已複製 ✓':'重試複製';
    if(copied)$('exportStatus').textContent='已複製，貼到 TradingView 的 Pine 編輯器即可';
    else{selectPineCode();$('exportStatus').textContent='瀏覽器未完成自動複製，已全選程式碼。手機／平板請長按選取文字並選「拷貝」；電腦按 Ctrl+C（Mac：⌘C）複製，或下載 .pine。';}
  };
  $('selectPine').onclick=()=>{copyAttempt++;selectPineCode();$('copyPine').disabled=!$('pineCode').value;$('copyPine').textContent='複製 Pine Script';$('exportStatus').textContent='已全選程式碼，手機／平板請長按選取文字並選「拷貝」；電腦按 Ctrl+C（Mac：⌘C）複製';};
  $('exportDialog').addEventListener('close',()=>{copyAttempt++;});
  $('downloadPine').onclick=()=>download(`${$('symbolInput').value.replace(/[^A-Z0-9._-]/gi,'_')}_${state.data.asOf}_Gamma.pine`,$('pineCode').value);
  $('saveProject').onclick=()=>download(`${state.data.symbol}_${state.data.asOf}_Gamma工作檔.json`,JSON.stringify({app:'Gamma Line Studio',version:1,session:snapshot()},null,2),'application/json');
  $('helpBtn').onclick=()=>$('helpDialog').showModal();document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  // CE import is wired after the data-only table parser is loaded.
  window.GammaStudio = { state, loadData, render, renderPreview, notice, toast, uid, activeWeek, visibleWeeks, validateProject };
  render();
})();
