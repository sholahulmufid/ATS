(() => {
  'use strict';
  const config = window.ATS_CONFIG;
  const demo = config.dataSource === 'demo';
  const $ = id => document.getElementById(id);
  const number = (n, digits = 0) => Number.isFinite(n) ? n.toLocaleString('id-ID', {minimumFractionDigits: digits, maximumFractionDigits: digits}) : '—';
  const clock = date => new Date(date).toLocaleTimeString('id-ID', {timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit'}).replaceAll('.', ':');
  const dateLabel = date => new Date(date).toLocaleDateString('id-ID', {timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short'});
  const sourceLabel = source => ({solar: 'Panel surya', pln: 'PLN', none: 'Tidak ada'})[source] || '—';
  let telemetry = null, events = [], liveSamples = [], mode = 'auto', scenario = 'normal', connected = false;
  let pendingSource = null, toastTimer = null, pollTimer = null, inFlight = false, pageActive = true;
  let wasDisconnected = false;

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  function addEvent(message, source, kind = 'info', time = Date.now()) {
    events.unshift({message, source, kind, time});
    events = events.slice(0, 100);
    renderHistory();
  }
  function renderHistory() {
    const filter = $('history-filter').value;
    const filtered = events.filter(e => filter === 'all' || e.kind === filter);
    const body = $('history-body');
    body.replaceChildren();
    filtered.forEach(event => {
      const row = document.createElement('tr');
      const time = document.createElement('td');
      time.textContent = `${dateLabel(event.time)} · ${clock(event.time)}`;
      const activity = document.createElement('td');
      const cell = document.createElement('span'); cell.className = 'event-cell';
      const dot = document.createElement('span'); dot.className = `event-dot ${event.kind === 'warning' ? 'warning' : ''}`;
      cell.append(dot, document.createTextNode(event.message)); activity.append(cell);
      const source = document.createElement('td');
      const tag = document.createElement('span'); tag.className = `source-tag ${event.source === 'pln' ? 'pln' : ''}`;
      tag.textContent = sourceLabel(event.source); source.append(tag);
      const status = document.createElement('td');
      const label = document.createElement('span'); label.className = `table-status ${event.kind === 'warning' ? 'warn' : ''}`;
      label.append(document.createElement('i'), document.createTextNode(event.kind === 'warning' ? 'Perhatian' : 'Tercatat'));
      status.append(label); row.append(time, activity, source, status); body.append(row);
    });
    if (!filtered.length) {
      const row = document.createElement('tr'), cell = document.createElement('td');
      cell.colSpan = 4; cell.className = 'empty-row'; cell.textContent = 'Belum ada aktivitas pada kategori ini.';
      row.append(cell); body.append(row);
    }
    $('nav-count').textContent = events.length;
    $('history-count').textContent = `${filtered.length} aktivitas ditampilkan`;
  }
  function demoReading() {
    const states = {
      normal: {gridVoltageV: 221.4, solarPowerW: 1850, batterySoc: 78, loadPowerW: 1250},
      cloudy: {gridVoltageV: 220.8, solarPowerW: 120, batterySoc: 72, loadPowerW: 1230},
      outage: {gridVoltageV: 0, solarPowerW: 1780, batterySoc: 76, loadPowerW: 1180},
      'low-battery': {gridVoltageV: 221.2, solarPowerW: 180, batterySoc: 18, loadPowerW: 1210}
    };
    const values = states[scenario];
    let source = telemetry?.source || 'solar';
    if (mode === 'auto') source = ['normal', 'outage'].includes(scenario) ? 'solar' : 'pln';
    if (source === 'pln' && !values.gridVoltageV) source = 'none';
    if (source === 'solar' && scenario === 'low-battery') source = 'none';
    return {deviceId: 'ESP32-DEMO', mode, source, ...values, loadPowerW: source === 'none' ? 0 : values.loadPowerW, lastUpdated: new Date().toISOString()};
  }
  function applyDemo(logChanges = true) {
    const previous = telemetry?.source;
    telemetry = demoReading(); connected = true;
    if (logChanges && previous && previous !== telemetry.source) addEvent(`Sumber berpindah: ${sourceLabel(previous)} → ${sourceLabel(telemetry.source)}`, telemetry.source, telemetry.source === 'none' ? 'warning' : 'transfer');
    render();
  }
  function renderControls() {
    const currentMode = telemetry?.mode || mode;
    $('control-mode-label').textContent = !connected ? 'Belum diketahui' : currentMode === 'auto' ? 'Otomatis' : 'Manual';
    ['auto', 'manual'].forEach(m => {
      const element = $(`${m}-mode`); element.classList.toggle('selected', currentMode === m);
      element.setAttribute('aria-pressed', String(currentMode === m)); element.disabled = !demo;
    });
    ['solar', 'pln'].forEach(source => {
      const button = $(`choose-${source}`);
      button.classList.toggle('chosen', telemetry?.source === source);
      button.disabled = !demo || currentMode !== 'manual' || (source === 'pln' && scenario === 'outage') || (source === 'solar' && scenario === 'low-battery');
    });
    $('control-hint').textContent = !demo ? 'Kontrol perangkat belum diaktifkan. Pembacaan sensor saja.' : currentMode === 'auto' ? 'Pilih mode manual untuk mencoba memilih sumber.' : scenario === 'outage' ? 'PLN padam pada skenario ini. Pilihan PLN dinonaktifkan.' : scenario === 'low-battery' ? 'Baterai rendah. Sumber surya dinonaktifkan pada demo ini.' : 'Pilih sumber listrik untuk simulasi perpindahan.';
    $('scenario').disabled = !demo;
  }
  function render() {
    const t = telemetry;
    $('pln-value').textContent = number(t?.gridVoltageV, 1);
    $('solar-value').textContent = number(t ? t.solarPowerW / 1000 : null, 2);
    $('battery-value').textContent = number(t?.batterySoc);
    $('load-value').textContent = number(t ? t.loadPowerW / 1000 : null, 2);
    const gridOK = t && t.gridVoltageV >= 180 && t.gridVoltageV <= 250;
    const batteryOK = t && t.batterySoc >= 25;
    $('pln-badge').textContent = !t ? 'Belum ada data' : gridOK ? 'Normal' : t.gridVoltageV === 0 ? 'Padam' : 'Perhatian';
    $('pln-badge').classList.toggle('warning-badge', !!t && !gridOK);
    $('pln-note').textContent = !t ? 'Menunggu pembacaan' : gridOK ? 'Sumber listrik tersedia' : 'Sumber PLN tidak normal';
    $('pln-dot').style.background = gridOK ? '#4a9869' : '#d4ad69';
    $('solar-badge').textContent = !t ? 'Belum ada data' : t.solarPowerW >= 300 ? 'Menghasilkan' : 'Daya rendah';
    $('solar-note').textContent = !t ? 'Menunggu pembacaan' : t.solarPowerW >= 300 ? 'Energi dari matahari' : 'Produksi surya menurun';
    $('battery-badge').textContent = !t ? 'Belum ada data' : batteryOK ? 'Cukup' : 'Rendah';
    $('battery-badge').classList.toggle('warning-badge', !!t && !batteryOK);
    $('battery-bar').style.width = `${t?.batterySoc || 0}%`;
    $('battery-bar').style.background = batteryOK ? '#7ca57b' : '#d7ac62';
    const progress = document.querySelector('[role="progressbar"]');
    if (t) progress.setAttribute('aria-valuenow', t.batterySoc); else progress.removeAttribute('aria-valuenow');
    $('battery-note').textContent = !t ? 'Menunggu pembacaan' : batteryOK ? 'Cadangan energi tersedia' : 'Cadangan energi rendah';
    const source = connected && t ? t.source : 'none';
    $('source-name').textContent = !connected ? 'Data belum tersedia' : sourceLabel(source);
    $('source-icon').querySelector('use').setAttribute('href', source === 'pln' ? '#i-grid' : source === 'none' ? '#i-info' : '#i-sun');
    $('source-description').textContent = !connected ? 'Koneksi atau data perangkat perlu diperiksa.' : source === 'solar' ? 'Energi matahari menyuplai kebutuhan listrik saat ini.' : source === 'pln' ? 'Listrik PLN menyuplai kebutuhan listrik saat ini.' : 'Tidak ada sumber yang menyuplai beban saat ini.';
    $('source-health').textContent = !connected ? 'Menunggu data perangkat' : source === 'none' ? 'Beban tidak tersuplai' : !batteryOK ? 'Perhatian: baterai rendah' : !gridOK ? 'PLN tidak tersedia' : 'Sistem berjalan normal';
    $('flow-load').textContent = connected && t ? `${number(t.loadPowerW / 1000, 2)} kW` : '— kW';
    $('solar-path').classList.toggle('active-path', source === 'solar');
    $('grid-path').classList.toggle('active-path', source === 'pln');
    $('load-path').classList.toggle('active-path', source !== 'none');
    document.querySelector('.flow-arrow').style.opacity = source === 'none' ? '0' : '1';
    $('solar-flow-note').textContent = !connected ? 'Status belum diketahui' : source === 'solar' ? 'Menyuplai beban' : t?.solarPowerW > 0 ? 'Menghasilkan energi' : 'Belum tersedia';
    $('grid-flow-note').textContent = !connected ? 'Status belum diketahui' : source === 'pln' ? 'Menyuplai beban' : gridOK ? 'Sumber cadangan' : 'Tidak tersedia';
    $('solar-node-badge').textContent = !connected ? '—' : source === 'solar' ? 'Aktif' : 'Siaga';
    $('solar-node-badge').classList.toggle('neutral', source !== 'solar');
    $('grid-node-badge').textContent = !connected ? '—' : source === 'pln' ? 'Aktif' : 'Siaga';
    $('grid-node-badge').classList.toggle('neutral', source !== 'pln');
    $('mode-tag').lastChild.textContent = connected ? `Mode ${(t?.mode || mode) === 'auto' ? 'otomatis' : 'manual'}` : 'Menunggu perangkat';
    $('data-badge').classList.toggle('warning-badge', !connected);
    $('mode-description').textContent = (t?.mode || mode) === 'auto' ? 'Mode otomatis memilih panel surya saat tersedia dan beralih ke PLN saat diperlukan.' : 'Mode manual mengikuti pilihan sumber pada kontrol. Semua aksi demo hanya simulasi.';
    if (!demo) $('mode-description').textContent = 'Sumber dan mode operasi mengikuti laporan ESP32. Dashboard membaca data perangkat.';
    if (connected && t) {
      $('updated-text').textContent = `${demo ? 'Simulasi' : 'Data'} · ${clock(t.lastUpdated)} WIB`;
      $('updated-text').classList.remove('error-text');
    }
    renderControls(); renderChart();
  }

  function chartData() {
    if (!demo) {
      const cutoff = Date.now() - 3600000;
      return liveSamples.filter(s => $('chart-range').value !== 'hour' || s.time >= cutoff).map(s => ({solar: s.solarPowerW / 1000, load: s.loadPowerW / 1000, label: clock(s.time).slice(0, 5)}));
    }
    const hourlySolar = [0, 0, 0, 0, 0, .04, .2, .57, .93, 1.33, 1.65, 1.78, 1.9, 1.83, 1.56, 1.21, .84, .44, .13, .01, 0, 0, 0, 0, 0];
    const hourlyLoad = [.88, .87, .83, .83, .81, .91, 1.12, 1.27, 1.19, 1.14, 1.16, 1.19, 1.21, 1.12, 1.08, 1.16, 1.19, 1.14, 1.31, 1.27, 1.19, 1.12, 1.01, .91, .89];
    if ($('chart-range').value === 'today') return hourlySolar.map((solar, i) => ({solar, load: hourlyLoad[i], label: `${String(i).padStart(2, '0')}:00`}));
    const now = Date.now();
    return Array.from({length: 13}, (_, i) => ({solar: Math.max(0, telemetry.solarPowerW / 1000 + Math.sin(i * 1.7) * .08), load: Math.max(0, telemetry.loadPowerW / 1000 + Math.cos(i) * .04), label: clock(now - (12 - i) * 300000).slice(0, 5)}));
  }
  function renderChart() {
    const data = chartData();
    const chart = $('power-chart');
    $('chart-caption').textContent = demo ? ($('chart-range').value === 'today' ? 'Gambaran pemakaian dan produksi hari ini.' : 'Contoh tren dalam satu jam terakhir.') : 'Pembacaan sensor sejak dashboard dibuka.';
    if (!data.length) {
      chart.innerHTML = '<div style="height:100%;display:grid;place-items:center;color:#9aa68e;font-size:11px">Menunggu data sensor untuk menggambar grafik.</div>';
      chart.setAttribute('aria-label', 'Grafik belum memiliki pembacaan sensor'); return;
    }
    const w = 560, h = 170, left = 30, right = 12, top = 12, bottom = 27;
    const max = Math.max(2, Math.ceil(Math.max(...data.map(d => Math.max(d.solar, d.load))) * 2) / 2);
    const x = i => left + (i / Math.max(1, data.length - 1)) * (w - left - right);
    const y = value => top + (1 - value / max) * (h - top - bottom);
    const path = key => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
    const area = `${path('solar')} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)}Z`;
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const value = max * i / 4;
      grid += `<line x1="${left}" x2="${w - right}" y1="${y(value)}" y2="${y(value)}" stroke="#edf1e7" stroke-dasharray="3 4"/><text x="${left - 9}" y="${y(value) + 3}" text-anchor="end" fill="#a9b49e" font-size="8" stroke="none">${number(value, 1)}</text>`;
    }
    const labels = new Set(Array.from({length: Math.min(data.length, 7)}, (_, i) => Math.round(i * (data.length - 1) / Math.max(1, Math.min(data.length, 7) - 1))));
    labels.forEach(i => { grid += `<text x="${x(i)}" y="${h - 6}" text-anchor="middle" fill="#a9b49e" font-size="8" stroke="none">${data[i].label}</text>`; });
    const points = data.length === 1 ? `<circle cx="${x(0)}" cy="${y(data[0].solar)}" r="3" fill="#b5c690"/><circle cx="${x(0)}" cy="${y(data[0].load)}" r="3" fill="#6c9584"/>` : '';
    chart.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#dbe6c4" stop-opacity=".45"/><stop offset="100%" stop-color="#eff3e6" stop-opacity=".1"/></linearGradient></defs>${grid}<path d="${area}" fill="url(#chart-fill)" stroke="none"/><path d="${path('solar')}" stroke="#b5c690" stroke-width="2"/><path d="${path('load')}" stroke="#6c9584" stroke-width="2"/>${points}</svg>`;
    chart.setAttribute('aria-label', `${demo ? 'Grafik simulasi' : 'Grafik sensor'} daya panel surya dan beban dalam kW, ${data.length} titik. ${demo ? 'Data contoh.' : 'Data sesi ini.'}`);
  }

  // TITIK INTEGRASI: ubah pemetaan di sini jika nama field firmware berbeda.
  function normalizeTelemetry(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Respons API harus berupa objek JSON.');
    for (const [key, min, max] of [['gridVoltageV', 0, 500], ['solarPowerW', 0, 100000], ['batterySoc', 0, 100], ['loadPowerW', 0, 100000]]) {
      if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key]) || raw[key] < min || raw[key] > max) throw new Error(`Field ${key} tidak valid.`);
    }
    if (!['solar', 'pln', 'none'].includes(raw.source)) throw new Error('Field source harus solar, pln, atau none.');
    if (!['auto', 'manual'].includes(raw.mode)) throw new Error('Field mode harus auto atau manual.');
    if (typeof raw.lastUpdated !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(raw.lastUpdated)) throw new Error('lastUpdated harus ISO 8601 dengan zona waktu.');
    const timestamp = Date.parse(raw.lastUpdated);
    if (!Number.isFinite(timestamp)) throw new Error('Waktu sensor tidak valid.');
    if (Date.now() - timestamp > config.staleAfterMs) throw new Error('Data sensor kedaluwarsa. Periksa waktu dan pembaruan ESP32.');
    if (timestamp - Date.now() > 30000) throw new Error('Waktu sensor lebih maju dari waktu dashboard.');
    return {deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : 'ESP32', gridVoltageV: raw.gridVoltageV, solarPowerW: raw.solarPowerW, batterySoc: raw.batterySoc, loadPowerW: raw.loadPowerW, source: raw.source, mode: raw.mode, lastUpdated: raw.lastUpdated};
  }
  async function readEsp32() {
    // Pembacaan saja. Tidak ada request pengendalian relay pada versi ini.
    const url = new URL(config.telemetryPath, config.apiBaseUrl.endsWith('/') ? config.apiBaseUrl : config.apiBaseUrl + '/');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetch(url, {method: 'GET', signal: controller.signal, cache: 'no-store', credentials: 'omit'});
      if (!response.ok) throw new Error(`API mengembalikan HTTP ${response.status}.`);
      return normalizeTelemetry(await response.json());
    } finally { clearTimeout(timeout); }
  }
  function showConnectionError(error) {
    connected = false;
    $('updated-text').textContent = telemetry ? `Data lama · ${clock(telemetry.lastUpdated)} WIB` : 'Perangkat belum terhubung';
    $('updated-text').classList.add('error-text');
    $('demo-banner').classList.add('error-banner');
    const text = $('demo-banner').querySelector('p'); text.replaceChildren();
    const strong = document.createElement('strong'); strong.textContent = 'Data perangkat tidak tersedia. ';
    text.append(strong, document.createTextNode(`${error.name === 'AbortError' ? 'Waktu koneksi habis.' : error.message} ${telemetry ? 'Angka yang terlihat adalah pembacaan terakhir.' : 'Periksa alamat API, jaringan, dan izin CORS.'}`));
    $('data-badge').lastChild.textContent = 'Terputus';
    $('chart-note').textContent = 'Koneksi terputus · grafik berisi pembacaan sesi sebelumnya';
    if (!wasDisconnected) addEvent('Koneksi data perangkat terputus', 'none', 'warning');
    wasDisconnected = true;
    render();
  }
  async function updateData(manual = false) {
    if (inFlight) return;
    if (demo) { applyDemo(false); if (manual) toast('Data simulasi diperbarui.'); return; }
    inFlight = true; $('refresh').disabled = true;
    try {
      const next = await readEsp32();
      const previous = telemetry?.source;
      const previousTime = telemetry ? Date.parse(telemetry.lastUpdated) : 0;
      if (Date.parse(next.lastUpdated) < previousTime) throw new Error('Urutan waktu sensor mundur. Periksa waktu perangkat.');
      telemetry = next; connected = true;
      if (Date.parse(next.lastUpdated) > previousTime) {
        liveSamples.push({time: Date.parse(next.lastUpdated), solarPowerW: next.solarPowerW, loadPowerW: next.loadPowerW});
        liveSamples = liveSamples.slice(-720);
      }
      if (!previous || wasDisconnected) addEvent(wasDisconnected ? 'Koneksi perangkat pulih' : 'Pembacaan perangkat dimulai', next.source);
      if (previous && previous !== next.source) addEvent(`Sumber berpindah: ${sourceLabel(previous)} → ${sourceLabel(next.source)}`, next.source, next.source === 'none' ? 'warning' : 'transfer');
      wasDisconnected = false;
      $('data-badge').lastChild.textContent = 'ESP32 terhubung';
      $('demo-banner').classList.remove('error-banner');
      $('demo-banner').querySelector('p').textContent = 'Mode perangkat aktif. Angka berasal dari API ESP32; kontrol relay belum diaktifkan.';
      $('chart-note').textContent = 'Data sensor · riwayat grafik hanya untuk sesi ini';
      render(); if (manual) toast('Data perangkat diperbarui.');
    } catch (error) { showConnectionError(error); }
    finally { inFlight = false; $('refresh').disabled = false; }
  }
  function setView() {
    const selected = location.hash.slice(1);
    const view = ['ringkasan', 'monitoring', 'riwayat'].includes(selected) ? selected : 'ringkasan';
    const titles = {ringkasan: ['Ringkasan energi', 'Pantau sumber listrik dan kondisi sistem dalam satu tempat.', 'Ringkasan'], monitoring: ['Monitoring energi', 'Ikuti tren daya dan kondisi sumber listrik.', 'Monitoring'], riwayat: ['Aktivitas sistem', 'Telusuri perpindahan sumber dan peringatan sistem.', 'Riwayat aktivitas']};
    document.body.dataset.view = view;
    $('page-title').replaceChildren(document.createTextNode(titles[view][0]));
    const period = document.createElement('span'); period.textContent = '.'; $('page-title').append(period);
    $('page-subtitle').textContent = titles[view][1]; $('breadcrumb-current').textContent = titles[view][2];
    document.querySelectorAll('.nav-link').forEach(link => {
      const active = link.dataset.view === view; link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    $('history-section').classList.toggle('view-hidden', view === 'monitoring');
    document.querySelector('.sidebar').classList.remove('open'); $('menu-button').setAttribute('aria-expanded', 'false');
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  $('today').textContent = new Date().toLocaleDateString('id-ID', {timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  $('guide-open').onclick = $('banner-guide').onclick = () => $('guide-dialog').showModal();
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => { if (e.target === dialog) { const rect = dialog.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close(); } }));
  $('menu-button').onclick = () => { const open = document.querySelector('.sidebar').classList.toggle('open'); $('menu-button').setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', e => { if (!e.target.closest('.sidebar') && !e.target.closest('#menu-button')) { document.querySelector('.sidebar').classList.remove('open'); $('menu-button').setAttribute('aria-expanded', 'false'); } });
  window.addEventListener('hashchange', setView); setView();
  $('refresh').onclick = () => updateData(true);
  $('chart-range').onchange = renderChart;
  $('history-filter').onchange = renderHistory;
  ['auto', 'manual'].forEach(selected => $(`${selected}-mode`).onclick = () => {
    if (!demo || mode === selected) return;
    mode = selected; applyDemo();
    addEvent(`Mode ${mode === 'auto' ? 'otomatis' : 'manual'} diaktifkan`, telemetry.source);
    toast(`Simulasi mode ${mode === 'auto' ? 'otomatis' : 'manual'} aktif.`);
  });
  ['solar', 'pln'].forEach(source => $(`choose-${source}`).onclick = () => {
    if (!demo || mode !== 'manual') return;
    if (source === telemetry.source) { toast('Sumber tersebut sudah aktif pada simulasi.'); return; }
    pendingSource = source;
    $('confirm-description').textContent = `Beban akan dialihkan ke ${sourceLabel(source)} pada tampilan simulasi. Tindakan ini tidak mengirim perintah ke perangkat.`;
    $('confirm-dialog').showModal();
  });
  $('confirm-switch').onclick = () => {
    if (!demo || mode !== 'manual' || !pendingSource) return;
    if ((pendingSource === 'pln' && scenario === 'outage') || (pendingSource === 'solar' && scenario === 'low-battery')) { $('confirm-dialog').close(); return; }
    const previous = telemetry.source;
    telemetry.source = pendingSource; applyDemo(false);
    if (previous !== pendingSource) addEvent(`Sumber berpindah: ${sourceLabel(previous)} → ${sourceLabel(pendingSource)}`, pendingSource, 'transfer');
    $('confirm-dialog').close(); toast(`Simulasi beralih ke ${sourceLabel(pendingSource)}.`); pendingSource = null;
  };
  $('scenario').onchange = () => {
    if (!demo) return;
    scenario = $('scenario').value;
    applyDemo();
    const messages = {normal: 'Produksi surya kembali tersedia', cloudy: 'Produksi surya rendah', outage: 'Sumber PLN padam', 'low-battery': 'Baterai rendah: kapasitas di bawah 25%'};
    addEvent(messages[scenario], telemetry.source, scenario === 'normal' ? 'info' : 'warning');
    toast('Skenario simulasi diperbarui.');
  };
  $('export').onclick = () => {
    const filter = $('history-filter').value;
    const selected = events.filter(e => filter === 'all' || e.kind === filter);
    if (!selected.length) { toast('Belum ada aktivitas untuk diekspor.'); return; }
    const quote = value => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [['Waktu (ISO 8601)', 'Aktivitas', 'Sumber', 'Jenis', 'Asal data'], ...selected.map(e => [new Date(e.time).toISOString(), e.message, sourceLabel(e.source), e.kind, demo ? 'SIMULASI' : 'ESP32 - observasi dashboard'])];
    const blob = new Blob(['\ufeff', rows.map(row => row.map(quote).join(',')).join('\r\n')], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `solara-aktivitas-${demo ? 'demo' : 'esp32'}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Riwayat aktivitas berhasil diekspor.');
  };

  if (demo) {
    telemetry = demoReading(); connected = true;
    const now = Date.now();
    events = [
      {time: now - 4 * 60000, message: 'Sumber berpindah: PLN → Panel surya', source: 'solar', kind: 'transfer'},
      {time: now - 32 * 60000, message: 'Mode otomatis diaktifkan', source: 'pln', kind: 'info'},
      {time: now - 40 * 60000, message: 'Produksi surya rendah, beralih ke PLN', source: 'pln', kind: 'warning'},
      {time: now - 60 * 60000, message: 'Simulasi sistem dimulai', source: 'solar', kind: 'info'}
    ];
    render(); renderHistory();
  } else {
    $('data-badge').lastChild.textContent = 'Menghubungkan ESP32';
    $('demo-banner').querySelector('p').textContent = 'Mode perangkat: menunggu pembacaan sensor dari API ESP32.';
    $('control-subtitle').textContent = 'Status mode mengikuti laporan perangkat.';
    $('history-note').textContent = 'Observasi dashboard · tersimpan selama halaman terbuka';
    document.querySelectorAll('.simulation-label').forEach(el => el.textContent = 'PERANGKAT');
    document.querySelectorAll('.sparkline').forEach(el => el.style.display = 'none');
    $('chart-range').options[0].textContent = 'Sesi ini';
    $('chart-note').textContent = 'Menunggu pembacaan sensor';
    render(); renderHistory(); updateData();
  }
  // Jadwal tunggal; interval tidak menumpuk ketika jaringan lambat.
  function schedulePoll() { clearTimeout(pollTimer); if (!pageActive) return; pollTimer = setTimeout(async () => { await updateData(); schedulePoll(); }, Math.max(2000, config.pollIntervalMs)); }
  schedulePoll();
  document.addEventListener('visibilitychange', () => { pageActive = !document.hidden; if (!pageActive) clearTimeout(pollTimer); else { updateData(); schedulePoll(); } });
})();
