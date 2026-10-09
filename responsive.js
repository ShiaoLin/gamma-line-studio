(function () {
  'use strict';
  const $ = id => document.getElementById(id), S = GammaStudio;
  const compact = window.matchMedia('(max-width: 900px), (pointer: coarse) and (max-width: 1000px)');
  let expanded = !S.state.data, lastError = '';

  function syncSettings() {
    const s = S.state, weeks = S.visibleWeeks();
    const error = s.gammaError || s.tableError;
    if (error && error !== lastError) expanded = true;
    lastError = error;
    const hidden = compact.matches && !expanded;
    // Never leave keyboard focus in content that is about to be hidden.
    if (hidden && $('settingsBody').contains(document.activeElement)) $('settingsToggle').focus({ preventScroll: true });
    $('settingsBody').hidden = hidden;
    $('settingsToggle').setAttribute('aria-expanded', String(!hidden));
    $('settingsAction').textContent = hidden ? '展開設定' : '收合設定';
    $('settingsSummary').textContent = s.data
      ? `${s.data.symbol} · ${s.data.asOf} · ${weeks.length ? weeks[0].start.slice(5) + ' — ' + weeks.at(-1).end.slice(5) : '未選週別'} · ${weeks.length} 週`
      : '先載入 Gamma，再匯入 Table';
  }
  function finishImport() {
    expanded = false;
    syncSettings();
    if (compact.matches) $('settingsToggle').scrollIntoView({ block: 'start' });
  }
  $('settingsToggle').onclick = () => { expanded = !expanded; syncSettings(); };
  compact.addEventListener('change', syncSettings);
  document.addEventListener('gamma-render', syncSettings);
  document.addEventListener('gamma-loaded', finishImport);
  document.addEventListener('table-applied', finishImport);

  // Move the same chart into a native dialog: no duplicate IDs or drawing state.
  const dialog = $('previewDialog'), chart = $('chartWrap');
  let chartScroll = 0;
  $('expandPreview').onclick = () => {
    chartScroll = chart.scrollLeft;
    $('previewDialogContext').textContent = `${S.state.data.symbol} · ${S.state.data.asOf} · 左右滑動查看各週`;
    $('previewDialogChart').append(chart);
    dialog.showModal();
    document.body.classList.add('preview-open');
    S.renderPreview();
    chart.scrollLeft = chartScroll;
    $('closePreview').focus();
  };
  dialog.addEventListener('close', () => {
    chartScroll = chart.scrollLeft;
    $('previewChartSlot').append(chart);
    document.body.classList.remove('preview-open');
    S.renderPreview();
    chart.scrollLeft = chartScroll;
    $('expandPreview').focus({ preventScroll: true });
  });
  window.addEventListener('resize', () => { if (S.state.data) S.renderPreview(); });
  syncSettings();
})();
