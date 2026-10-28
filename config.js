/* TITIK INTEGRASI ESP32 — baca PANDUAN_INTEGRASI_ESP32.md terlebih dahulu.
   Tidak perlu mengubah HTML/CSS untuk mengganti sumber data. */
window.ATS_CONFIG = Object.freeze({
  dataSource: 'demo', // GANTI ke 'esp32' saat API siap. Tidak ada fallback ke dummy di mode esp32.
  apiBaseUrl: 'http://192.168.4.1', // GANTI alamat ESP32 ATAU gateway HTTPS.
  telemetryPath: '/api/telemetry', // GANTI jika rute firmware berbeda.
  pollIntervalMs: 5000, // Interval pembacaan sensor (minimal efektif 2000 ms).
  requestTimeoutMs: 4000,
  staleAfterMs: 15000, // Usia maksimum lastUpdated sebelum ditandai kedaluwarsa.
  // Token rahasia JANGAN disimpan di file frontend ini.
});
