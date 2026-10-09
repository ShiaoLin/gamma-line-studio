(function (root) {
  'use strict';
  const DAY = 86400000;
  const MAX_TEXT = 35 * 1024 * 1024;
  const TABLE_LIMITS = { columns: 64, rows: 10000, cells: 200000 };
  class ImportError extends Error {}
  function parseBudget(text) {
    if (typeof text !== 'string' || text.length > MAX_TEXT) throw new ImportError('單一 HTML 上限為 35 MB。');
    return { remaining: text.length * 2 + 1024, figures: 0 };
  }
  function spend(budget, amount = 1) {
    budget.remaining -= amount;
    if (budget.remaining < 0) throw new ImportError('HTML 解析超過安全上限，請重新下載完整檔案。');
  }
  function nextFigure(budget) {
    if (++budget.figures > 64) throw new ImportError('HTML 圖表數量超過安全上限。');
  }
  function checkTableSize(columns, rows) {
    if (columns > TABLE_LIMITS.columns || rows > TABLE_LIMITS.rows || columns * rows > TABLE_LIMITS.cells)
      throw new ImportError('Table 超過安全上限：最多 64 欄、10,000 列及 200,000 個儲存格。');
  }
  const DEFAULT_OPTIONS = Object.freeze({ topN: 3, threshold: 20, range: 30, gap: 0 });
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  function cleanText(value) {
    const text = String(value ?? ''), parts = []; let cursor = 0, start;
    // Advance past each complete tag; an unmatched '<' suffix is scanned only once.
    while ((start = text.indexOf('<', cursor)) !== -1) {
      const end = text.indexOf('>', start + 1);
      if (end === -1) break;
      parts.push(text.slice(cursor, start)); cursor = end + 1;
    }
    parts.push(text.slice(cursor)); return parts.join('').trim();
  }
  function dateValid(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; }
  function addDays(s, n) { return new Date(Date.parse(s + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10); }
  function monday(s) { const d = new Date(s + 'T00:00:00Z').getUTCDay(); return addDays(s, -(d + 6) % 7); }
  function readJSON(text, offset, budget = parseBudget(text)) {
    let i = offset; while (i < text.length && /[\s,]/.test(text[i])) { spend(budget); i++; }
    const start = i, stack = []; let quoted = false, escaped = false;
    if (!['[', '{'].includes(text[i])) throw new Error('Plotly 資料不是可解析的 JSON。');
    for (; i < text.length; i++) {
      spend(budget);
      const c = text[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') quoted = true;
      else if (c === '[' || c === '{') { if (stack.length >= 64) throw new ImportError('HTML JSON 巢狀層數超過安全上限。'); stack.push(c); }
      else if (c === ']' || c === '}') { if ((stack.pop() === '[' ? ']' : '}') !== c) throw new Error('JSON 括號不完整。'); if (!stack.length) return { value: JSON.parse(text.slice(start, i + 1)), end: i + 1 }; }
    }
    throw new ImportError('HTML 資料被截斷，請重新匯出完整檔案。');
  }
  function numericArray(value) {
    if (Array.isArray(value)) return value.map(v => typeof v === 'number' ? v : NaN);
    if (!value || typeof value.bdata !== 'string') throw new Error('不支援的 Plotly 數值陣列。');
    const type = String(value.dtype).replace(/^[<>=|]/, '');
    const types = { f8: [8, 'getFloat64'], f4: [4, 'getFloat32'], i4: [4, 'getInt32'], u4: [4, 'getUint32'], i2: [2, 'getInt16'], u2: [2, 'getUint16'], i1: [1, 'getInt8'], u1: [1, 'getUint8'] };
    if (!types[type]) throw new Error('不支援的 Plotly dtype：' + type);
    const bytes = Uint8Array.from(atob(value.bdata), x => x.charCodeAt(0)), [size, method] = types[type];
    if (bytes.length % size) throw new Error('Plotly 二進位資料長度不完整。');
    const view = new DataView(bytes.buffer), result = [];
    for (let i = 0; i < bytes.length; i += size) result.push(view[method](i, !String(value.dtype).startsWith('>')));
    return result;
  }
  function parseHTML(text, filename = '') {
    const budget = parseBudget(text);
    const re = /Plotly\.(?:newPlot|react)\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*/g;
    let match, lastError;
    while ((match = re.exec(text))) {
      nextFigure(budget);
      try {
        const data = readJSON(text, re.lastIndex, budget), layout = readJSON(text, data.end, budget);
        re.lastIndex = layout.end;
        if (!Array.isArray(data.value)) continue;
        if (!data.value.some(t => t.type === 'bar' && /\d{4}-\d{2}-\d{2}/.test(t.name || ''))) {
          if (data.value.some(t => t.type === 'bar' && /^nan$/i.test(t.name || ''))) lastError = new Error('Gamma 長條的到期日標籤為 nan，無法可靠分週。請重新下載 Gamma HTML；不會用舊檔或其他日期代替。');
          continue;
        }
        return normalize(data.value, layout.value, filename);
      } catch (e) { if (e instanceof ImportError) throw e; lastError = e; }
    }
    throw lastError || new Error('找不到按結算日排列的 Plotly Gamma 長條資料。請載入 Lieta Gamma HTML。');
  }
  function normalize(traces, layout, filename) {
    const title = cleanText(layout.title?.text || layout.title || '');
    const symbol = (title.match(/^([A-Za-z0-9.^!:_/-]+)\s+(?:Dealers|Gamma|GEX)/i)?.[1] || filename.match(/(?:^|_)([A-Z][A-Z0-9.]{0,11})_Gamma/i)?.[1] || 'UNKNOWN').toUpperCase();
    let spot = null, flip = null, timestamp = '';
    for (const a of layout.annotations || []) {
      const txt = cleanText(a.text);
      if (/Spot Price/i.test(txt)) { const m = txt.match(/\(([\d,.]+)\)/); spot = m ? Number(m[1].replaceAll(',', '')) : a.y; }
      if (/Flip/i.test(txt) && finite(a.y)) flip = a.y;
      const time = txt.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/); if (time) timestamp = time[0];
    }
    const expiries = [], warnings = []; let invalid = 0;
    for (const t of traces) {
      if (t.type !== 'bar') continue;
      const expiry = (t.name || '').match(/\d{4}-\d{2}-\d{2}/)?.[0]; if (!expiry || !dateValid(expiry)) continue;
      const horizontal = t.orientation !== 'v';
      const prices = numericArray(horizontal ? t.y : t.x), gamma = numericArray(horizontal ? t.x : t.y);
      if (prices.length !== gamma.length) throw new Error(expiry + ' 的價格與 Gamma 數量不同。');
      const levels = [];
      for (let i = 0; i < prices.length; i++) { if (finite(prices[i]) && prices[i] > 0 && finite(gamma[i])) levels.push({ price: prices[i], gamma: gamma[i] }); else invalid++; }
      if (!levels.length) throw new Error(expiry + ' 沒有有效數值。');
      expiries.push({ date: expiry, name: cleanText(t.name), monthly: /\(m\|/i.test(t.name || ''), levels });
    }
    if (!expiries.length) throw new Error('沒有可用的 Gamma 分布。');
    expiries.sort((a, b) => a.date.localeCompare(b.date));
    let asOf = timestamp.slice(0, 10) || filename.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!dateValid(asOf || '')) { asOf = expiries[0].date; warnings.push('未找到資料日期，暫用第一個到期日；請核對。'); }
    if (!finite(spot) || spot <= 0) { spot = null; warnings.push('未找到現價；現價範圍篩選停用。'); }
    if (invalid) warnings.push(`已略過 ${invalid} 個非數字資料點。`);
    if (symbol === 'UNKNOWN') warnings.push('未辨識股票代號，請在匯出前填寫。');
    return { schema: 1, symbol, filename, title, asOf, timestamp, spot, flip, expiries, warnings };
  }
  function groupWeeks(data) {
    const groups = new Map();
    for (const expiry of data.expiries) {
      if (expiry.date < data.asOf) continue;
      const start = monday(expiry.date);
      if (!groups.has(start)) groups.set(start, { id: start, start, end: addDays(start, 4), expiries: [], levels: new Map(), monthly: false });
      const group = groups.get(start); group.expiries.push(expiry.date); group.monthly ||= expiry.monthly;
      for (const l of expiry.levels) { const key = Number(l.price.toFixed(8)); const old = group.levels.get(key) || { price: key, gamma: 0, gross: 0, contributions: [] }; old.gamma += l.gamma; old.gross += Math.abs(l.gamma); old.contributions.push({ expiry: expiry.date, gamma: l.gamma }); group.levels.set(key, old); }
    }
    return [...groups.values()].sort((a, b) => a.start.localeCompare(b.start)).map(g => ({ ...g, expiries: [...new Set(g.expiries)].sort(), levels: [...g.levels.values()].sort((a, b) => a.price - b.price) }));
  }
  function expiryDTE(expiry, asOf) {
    const match = String(expiry.name || '').match(/(?:^|\s)(\d+)\s*dte\b/i);
    const days = match ? Number(match[1]) : NaN;
    if (Number.isSafeInteger(days) && days >= 0) return { days, source: 'html' };
    if (!dateValid(expiry.date) || !dateValid(asOf)) return { days: null, source: 'unknown' };
    return { days: Math.round((Date.parse(expiry.date) - Date.parse(asOf)) / DAY), source: 'date' };
  }
  function weekDTE(data, week) {
    const rows = data.expiries.filter(e => week.expiries.includes(e.date)).map(e => ({ date: e.date, ...expiryDTE(e, data.asOf) }));
    const days = rows.map(r => r.days).filter(Number.isFinite);
    const min = Math.min(...days), max = Math.max(...days);
    return { rows, label: days.length ? `${min === max ? min : min + '–' + max} 天` : 'DTE 未知' };
  }
  function integerPriceAxis(low, high, intervals = 7) {
    if (!finite(low) || !finite(high)) throw new Error('無效的價格軸範圍。');
    low = Math.max(0, low); high = Math.max(high, low + 1);
    const rough = Math.max(1, (high - low) / Math.max(1, intervals));
    const power = 10 ** Math.floor(Math.log10(rough));
    const step = Math.max(1, [1, 2, 5, 10].find(n => n * power >= rough) * power);
    const start = Math.floor(low / step), end = Math.ceil(high / step);
    const ticks = Array.from({ length: Math.min(32, end - start + 1) }, (_, i) => (start + i) * step);
    return { low: start * step, high: end * step, step, ticks };
  }
  function previewLayout(count, availableWidth, fit, minimumColumn = 110) {
    const available = Math.max(280, Math.floor(availableWidth));
    const width = fit ? available : Math.max(available, 360, count * 180 + 100);
    const columns = fit ? Math.max(1, Math.min(count || 1, Math.floor((width - 113) / minimumColumn))) : Math.max(1, count);
    return { width, columns, rows: Math.max(1, Math.ceil(count / columns)) };
  }
  function selectLevels(week, spot, options = {}) {
    const { topN = DEFAULT_OPTIONS.topN, threshold = DEFAULT_OPTIONS.threshold, range = DEFAULT_OPTIONS.range, gap = DEFAULT_OPTIONS.gap } = options;
    const candidates = week.levels.filter(l => l.gamma !== 0 && (!spot || !range || Math.abs(l.price / spot - 1) <= range / 100 + 1e-10));
    const chosen = [];
    for (const sign of [1, -1]) {
      const pool = candidates.filter(l => Math.sign(l.gamma) === sign).sort((a, b) => Math.abs(b.gamma) - Math.abs(a.gamma) || a.price - b.price);
      const maximum = Math.abs(pool[0]?.gamma || 0), selected = [];
      for (const level of pool) {
        if (selected.length >= topN) break;
        if (Math.abs(level.gamma) + 1e-8 < maximum * threshold / 100) continue;
        if (selected.some(other => Math.abs(other.price - level.price) < gap)) continue;
        selected.push({ ...level, kind: sign > 0 ? 'positive' : 'negative', source: 'auto', enabled: true, strength: Math.abs(level.gamma) / maximum });
      }
      chosen.push(...selected);
    }
    return chosen.sort((a, b) => b.price - a.price);
  }
  function gammaAtPrice(week, price) {
    if (!finite(price) || price <= 0) return null;
    const level = week.levels.find(l => Math.abs(l.price - price) < 1e-7);
    return level && finite(level.gamma) ? level.gamma : null;
  }
  const COLORS = { positive: '#45be75', negative: '#ff4d65', flip: '#ffd23f' };
  function pineDate(date, hour, minute) { const [y, m, d] = date.split('-').map(Number); return `timestamp("America/New_York", ${y}, ${m}, ${d}, ${hour}, ${minute})`; }
  function exportPine(data, weeks, options = {}) {
    const symbol = String(data.symbol).trim().toUpperCase();
    if (!/^[A-Z0-9.^!:/_-]{1,24}$/.test(symbol) || symbol === 'UNKNOWN') throw new Error('請先填寫有效的股票代號。');
    const lines = weeks.flatMap(w => w.drawings.filter(l => l.enabled).map(l => ({ ...l, start: w.start, end: w.end })));
    if (!lines.length) throw new Error('請至少選取一條線。');
    if (lines.length > 480) throw new Error('線條超過 480 條，請減少結算週或價位數。');
    if (lines.some(l => !finite(l.price) || l.price <= 0 || !dateValid(l.start) || !dateValid(l.end) || !COLORS[l.kind])) throw new Error('匯出含有無效價位或日期。');
    const names = { positive: 'positiveColor', negative: 'negativeColor', flip: 'flipColor' };
    const q = JSON.stringify;
    const tableDates = [...new Set(lines.map(l => l.source.match(/snapshot (\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean))].sort();
    const provenance = 'Gamma ' + data.asOf + (tableDates.length ? '\nTable ' + tableDates.join(', ') + (tableDates.some(d => d !== data.asOf) ? ' (不同快照)' : '') : '\nTable CE: 尚未匯入 / 手動線請核對');
    const calls = lines.map(l => `    drawLevel(${pineDate(l.start, 9, 30)}, ${pineDate(l.end, 16, 0)}, ${l.price}, ${names[l.kind]}, ${q(l.kind === 'flip' ? 'Gamma Flip / CE · ' + l.source : (l.kind === 'positive' ? '+Gamma' : '-Gamma') + ' · ' + l.source)})`);
    return `//@version=6
// Source snapshot: ${data.asOf}. Static imported Gamma levels, not a live data feed.
// Same-strike signed Gamma is summed within each Monday-Friday expiry week.
// CE and named Levels come from Lieta Table; the HTML overall Flip is never substituted.
indicator("Gamma Lines · ${symbol} · ${data.asOf}", overlay = true, max_lines_count = 500, max_labels_count = 500)
positiveColor = input.color(color.rgb(69, 190, 117), "正 Gamma", group = "樣式")
negativeColor = input.color(color.rgb(255, 77, 101), "負 Gamma", group = "樣式")
flipColor = input.color(color.rgb(255, 210, 63), "Gamma Flip / CE", group = "樣式")
lineWidth = input.int(${Math.min(6, Math.max(1, options.width || 3))}, "線寬", minval = 1, maxval = 6, group = "樣式")
weekGap = input.bool(true, "週間留白（終點取週五開盤）", group = "樣式")
showLabels = input.bool(true, "顯示價位", group = "樣式")
showSource = input.bool(true, "顯示資料日期", group = "資料")
labelSize = input.string("large", "字體大小", options = ["tiny", "small", "normal", "large"], group = "樣式")
strictSymbol = input.bool(true, "檢查股票代號", group = "資料")
var array<line> drawnLines = array.new<line>()
var array<label> drawnLabels = array.new<label>()
var table sourceTable = table.new(position.bottom_right, 1, 1)
drawLevel(int startTime, int endTime, float price, color tint, string note) =>
    int segmentEnd = weekGap ? endTime - 23400000 : endTime
    array.push(drawnLines, line.new(startTime, price, segmentEnd, price, xloc = xloc.bar_time, extend = extend.none, color = tint, width = lineWidth))
    if showLabels
        array.push(drawnLabels, label.new(int((startTime + segmentEnd) / 2), price, str.tostring(price, format.mintick), xloc = xloc.bar_time, yloc = yloc.price, style = label.style_label_up, color = color.new(tint, 100), textcolor = tint, size = labelSize, tooltip = note))
if barstate.islast
    table.cell(sourceTable, 0, 0, showSource ? ${q(provenance)} : "", text_color = chart.fg_color, text_size = size.small, bgcolor = color.new(color.black, 55))
    if strictSymbol and syminfo.ticker != "${symbol.split(':').pop()}"
        runtime.error("請切換到 ${symbol} 圖表，或關閉代號檢查。")
    for item in drawnLines
        line.delete(item)
    for item in drawnLabels
        label.delete(item)
    array.clear(drawnLines)
    array.clear(drawnLabels)
${calls.join('\n')}
`;
  }
  function parseTable(text, filename = '') {
    const budget = parseBudget(text);
    if (filename && !/\.html?$/i.test(filename)) throw new ImportError('Table 僅接受 HTML 檔案，請下載 Lieta Table HTML。');
    const key = s => cleanText(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    let matrix, title = '';
    const re = /Plotly\.(?:newPlot|react)\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*/g;
    let m;
    while ((m = re.exec(text))) {
      nextFigure(budget);
      try {
        const parsed = readJSON(text, re.lastIndex, budget);
        re.lastIndex = parsed.end;
        if (!Array.isArray(parsed.value)) continue;
        const table = parsed.value.find(t => t?.type === 'table' && Array.isArray(t.header?.values) && t.header.values.some(h => key(h) === 'gammaflip'));
        if (!table) continue;
        const rawHeaders = table.header.values, columns = table.cells?.values;
        if (!Array.isArray(columns) || !columns.every(Array.isArray))
          throw new ImportError('Table 欄位格式無效：每一欄必須是資料陣列。');
        const width = Math.max(rawHeaders.length, columns.length);
        checkTableSize(width, 0);
        let n = 0;
        for (const column of columns) n = Math.max(n, column.length);
        checkTableSize(width, n);
        const headers = Array.from({ length: width }, (_, i) => cleanText(rawHeaders[i]));
        matrix = [headers];
        for (let i = 0; i < n; i++) matrix.push(headers.map((_, j) => cleanText(columns[j]?.[i])));
        try { const layout = readJSON(text, parsed.end, budget).value; title = cleanText(layout.title?.text || layout.title || ''); } catch (e) { if (e instanceof ImportError) throw e; /* Metadata is optional. */ }
        break;
      } catch (e) { if (e instanceof ImportError) throw e; /* Continue to a later Plotly figure. */ }
    }
    if (!matrix && /<table[\s>]/i.test(text) && typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const rows = doc.querySelectorAll('tr');
      checkTableSize(0, Math.max(0, rows.length - 1));
      matrix = []; let cellCount = 0;
      for (const tr of rows) {
        const cells = tr.querySelectorAll('th,td');
        checkTableSize(cells.length, 0);
        cellCount += cells.length;
        if (cellCount > TABLE_LIMITS.cells) throw new ImportError('Table 儲存格數超過安全上限。');
        matrix.push([...cells].map(td => td.textContent.trim()));
      }
    }
    if (!matrix) throw new ImportError('找不到 Table HTML 資料，請下載 Lieta Table HTML；不支援 CSV、TSV 或純文字。');
    const headerIndex = matrix.findIndex(r => r.some(c => key(c) === 'expiration') && r.some(c => ['gammaflip','gammaflipce'].includes(key(c))));
    if (headerIndex < 0) throw new Error('Table HTML 必須包含 Expiration 與 Gamma_Flip 欄位。');
    const headers = matrix[headerIndex].map(key), dateCol = headers.indexOf('expiration'), flipCol = headers.findIndex(k => ['gammaflip','gammaflipce'].includes(k)), dteCol = headers.indexOf('dte');
    const rows = [], dateCandidates = [], warnings = [], seen = new Map();
    for (const cells of matrix.slice(headerIndex + 1)) {
      const date = cleanText(cells[dateCol]); if (!dateValid(date)) continue;
      const raw = cleanText(cells[flipCol]).replaceAll(',', ''), numericFlip = Number(raw);
      const flip = raw && finite(numericFlip) && numericFlip > 0 ? numericFlip : null;
      if (flip === null) warnings.push(date + ' 的 Gamma_Flip 缺失，該日不畫黃線；保留其他 Levels');
      if (seen.has(date)) { if (seen.get(date) !== flip) throw new Error(date + ' 出現兩個不同 CE，請勿混合快照。'); continue; }
      const levels = {};
      for (const field of ['Gamma_Field','Key_Delta','Call_Wall','Put_Wall','Call_Dominate','Put_Dominate','Pos_1Sigma','Neg_1Sigma']) {
        const index = headers.indexOf(key(field)), rawValue = cleanText(cells[index]).replaceAll(',', ''), value = Number(rawValue);
        if (index >= 0 && rawValue && finite(value) && value > 0) levels[field] = value;
      }
      seen.set(date, flip); rows.push({ date, flip, levels });
      const dte = Number(cells[dteCol]); if (dteCol >= 0 && cells[dteCol] !== '' && Number.isInteger(dte) && dte >= 0) dateCandidates.push(addDays(date, -dte));
    }
    if (!rows.length) throw new Error('Table 中沒有有效的到期日 CE。');
    const inferred = [...new Set(dateCandidates)]; if (inferred.length > 1) throw new Error('Table 的 dte 對應到不同資料日期，請檢查檔案。');
    const explicitDate = text.match(/^#\s*asOf\s*=\s*(\d{4}-\d{2}-\d{2})/mi)?.[1];
    const asOf = explicitDate || inferred[0] || filename.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null;
    if (explicitDate && inferred[0] && explicitDate !== inferred[0]) throw new Error('Table 標記日期與 dte 不一致。');
    const symbol = text.match(/^#\s*symbol\s*=\s*([A-Z0-9.^!:_/-]+)/mi)?.[1]?.toUpperCase() || title.match(/^([A-Z0-9.^!:_/-]+)\s/i)?.[1]?.toUpperCase() || filename.match(/(?:^|_)([A-Z][A-Z0-9.]{0,11})_Table/i)?.[1]?.toUpperCase() || null;
    return { rows: rows.sort((a,b) => a.date.localeCompare(b.date)), asOf, symbol, warnings, filename };
  }
  function weeklyCE(weeks, rows, policy = 'last') {
    return weeks.map(w => {
      const matches = rows.filter(r => finite(r.flip) && r.flip > 0 && r.date >= w.start && r.date <= w.end).sort((a,b) => a.date.localeCompare(b.date));
      // Never backfill a missing Friday CE with Wednesday's value when Friday is in Gamma data.
      const lastDate = w.expiries.at(-1);
      return { id: w.id, rows: policy === 'all' ? matches : matches.filter(r => r.date === lastDate) };
    });
  }
  function inspectionLevels(week, expiry = 'all') {
    if (expiry === 'all') return week.levels;
    return week.levels.filter(l => l.contributions.some(c => c.expiry === expiry)).map(l => ({ ...l,
      gamma: l.contributions.filter(c => c.expiry === expiry).reduce((sum,c) => sum + c.gamma, 0)
    }));
  }
  function resetDrawings(weeks, spot, rows = [], policy = 'last') {
    const ce = weeklyCE(weeks, rows, policy);
    return weeks.map(w => ({ ...w, drawings: [
      ...selectLevels(w, spot, DEFAULT_OPTIONS),
      ...ce.find(x => x.id === w.id).rows.map(r => ({kind:'flip', price:r.flip, enabled:true, source:`table:${r.date} / snapshot ${r.asOf || 'unknown'}`}))
    ] }));
  }
  root.GammaCore = { DEFAULT_OPTIONS, gammaAtPrice, inspectionLevels, resetDrawings, parseHTML, groupWeeks, expiryDTE, weekDTE, integerPriceAxis, previewLayout, selectLevels, exportPine, readJSON, numericArray, dateValid, addDays, monday, COLORS, parseTable, weeklyCE };
  if (typeof module !== 'undefined') module.exports = root.GammaCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
