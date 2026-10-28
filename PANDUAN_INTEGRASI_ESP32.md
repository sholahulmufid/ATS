# Panduan integrasi ESP32 — Solara ATS Monitor

Dokumen ini menjelaskan bagian yang harus diganti untuk menghubungkan dashboard dummy ke proyek ESP32 ATS. Firmware dan jenis sensor belum diberikan, sehingga nama pin, pembacaan sensor, driver relay, dan protokol asli perlu disesuaikan dengan perangkat proyek.

## 1. Kondisi dashboard saat ini

`dataSource: 'demo'` berarti semua angka, status, grafik, pilihan sumber, dan riwayat memakai simulasi di browser. Menekan tombol tidak mengirim perintah ke perangkat. Simulasi kembali ke keadaan awal setelah halaman dimuat ulang.

Empat angka utama adalah tegangan PLN (V), daya panel surya (kW), kapasitas baterai (%), dan daya beban (kW). Frekuensi, arus, suhu, dan sensor tambahan sengaja belum ditampilkan agar dashboard mudah dipahami.

## 2. Pilih cara koneksi

### Pilihan A — Dashboard lokal satu jaringan

ESP32 menyediakan endpoint `GET /api/telemetry`, lalu browser membaca endpoint itu melalui Wi-Fi yang sama. Dashboard dapat dilayani dari ESP32 itu sendiri atau dari server lokal.

Jika dashboard dilayani dari ESP32 yang sama, gunakan `apiBaseUrl` dengan origin perangkat, misalnya `http://192.168.4.1`. Jika alamat IP berubah, sesuaikan atau gunakan nama host yang dapat diakses jaringan proyek.

### Pilihan B — Dashboard online melalui gateway HTTPS

ESP32 mengirim pembacaan ke backend/gateway yang Anda sediakan. Dashboard membaca alamat HTTPS gateway tersebut. Gateway belum termasuk dalam proyek ini.

Untuk dashboard yang dibuka melalui HTTPS, siapkan API HTTPS yang dapat diakses browser. Akses langsung dari situs HTTPS ke ESP32 HTTP lokal dapat dibatasi browser oleh mixed content atau kebijakan jaringan lokal. Jangan mengatasi ini dengan mematikan perlindungan browser. Pilih hosting lokal dari perangkat yang sama atau gateway HTTPS yang sesuai.

Jika proyek memakai MQTT, dashboard ini belum menyediakan koneksi MQTT. Gunakan gateway HTTP untuk mengubah pesan MQTT menjadi format JSON berikut, atau ganti fungsi pembacaan dengan adapter WebSocket/MQTT yang sesuai. Jangan menganggap MQTT sudah terpasang.

## 3. Bagian yang WAJIB diubah

### File `config.js`

```js
window.ATS_CONFIG = Object.freeze({
  dataSource: 'esp32',
  apiBaseUrl: 'https://alamat-gateway-anda.example',
  telemetryPath: '/api/telemetry',
  pollIntervalMs: 5000,
  requestTimeoutMs: 4000,
  staleAfterMs: 15000,
});
```

Alamat di atas hanya placeholder: ganti dengan API milik proyek. Untuk server lokal yang sesuai, ganti dengan alamat HTTP ESP32 yang sebenarnya.

| Pengaturan | Ganti dengan | Dampak |
| --- | --- | --- |
| `dataSource` | `'esp32'` | Mematikan dummy dan membaca API nyata |
| `apiBaseUrl` | Origin ESP32/gateway termasuk protokol dan port bila ada | Tujuan pembacaan data |
| `telemetryPath` | Rute JSON firmware/backend | Default `/api/telemetry` |
| `pollIntervalMs` | Interval pembacaan dalam milidetik | Default 5000; minimum efektif 2000 |
| `requestTimeoutMs` | Batas waktu satu request | Default 4000 ms |
| `staleAfterMs` | Batas umur data | Default 15000 ms; sesuaikan dengan frekuensi kirim firmware |

Jangan simpan token, kata sandi Wi-Fi, atau kredensial broker dalam `config.js`. File browser dapat dibaca pengguna. Bila autentikasi diperlukan, implementasikan mekanisme backend/session yang sesuai; adapter saat ini belum menyertakan header autentikasi dan memakai `credentials: 'omit'`.

### File `app.js` — `normalizeTelemetry(raw)`

Jika nama field firmware sudah sama dengan kontrak di bawah, tidak perlu mengubah fungsi ini. Jika berbeda, lakukan pemetaan dan konversi satuan di awal fungsi, lalu biarkan validasi berjalan.

Misalnya firmware mengirim `tegangan_pln` dan `daya_surya_kw`: petakan ke `gridVoltageV: raw.tegangan_pln` dan `solarPowerW: raw.daya_surya_kw * 1000`. Ubah field lain dengan cara yang sama. Jangan mengisi nilai default normal untuk sensor yang hilang. Field wajib yang tidak tersedia harus ditangani sebagai data tidak valid sampai firmware menyediakan pembacaannya.

### File `app.js` — `readEsp32()`

Adapter yang tersedia menggunakan HTTP GET dengan timeout, `cache: 'no-store'`, dan validasi JSON. Ubah fungsi ini bila protokol koneksi berbeda. Nilai `source` dan `mode` harus berasal dari keadaan yang dikonfirmasi firmware, bukan ditebak browser dari angka sensor.

## 4. Format data API

API mengembalikan HTTP 200 dan `Content-Type: application/json`. Contoh:

```json
{
  "deviceId": "ESP32-ATS-01",
  "gridVoltageV": 221.4,
  "solarPowerW": 1850,
  "batterySoc": 78,
  "loadPowerW": 1250,
  "source": "solar",
  "mode": "auto",
  "lastUpdated": "2026-10-16T10:00:00.000Z"
}
```

**Waktu pada contoh wajib diganti dengan waktu pengukuran terbaru.** File `telemetry.example.json` berisi contoh format, bukan data hidup. Jika langsung dijadikan endpoint tanpa memperbarui waktunya, dashboard akan menandainya kedaluwarsa.

| Field | Jenis dan satuan | Keterangan |
| --- | --- | --- |
| `deviceId` | String, opsional | Identitas perangkat; digunakan adapter, belum ditampilkan sebagai metrik |
| `gridVoltageV` | Number, volt | Tegangan PLN hasil pengukuran; 0 berarti tidak ada tegangan terbaca |
| `solarPowerW` | Number, watt | Daya PV; dashboard mengubah watt menjadi kW |
| `batterySoc` | Number, 0–100 | Persentase baterai dari pengukuran/perhitungan firmware yang sesuai baterai |
| `loadPowerW` | Number, watt | Daya beban aktif; dashboard mengubah watt menjadi kW |
| `source` | `"solar"`, `"pln"`, `"none"` | Sumber yang benar-benar menyuplai beban menurut firmware |
| `mode` | `"auto"`, `"manual"` | Mode operasi firmware |
| `lastUpdated` | String ISO 8601 dengan zona waktu | Waktu pengukuran, misalnya UTC dengan akhiran `Z` |

Angka harus JSON number, bukan string seperti `"221.4 V"`. Adapter menerima tegangan 0–500 V dan daya 0–100000 W sebagai batas validasi antarmuka. Batas ini bukan rating instalasi; sesuaikan dengan proyek saat integrasi. Nilai di luar batas atau field wajib yang hilang ditolak. `NaN` dan nilai tak hingga ditolak.

Sinkronkan waktu ESP32/gateway, misalnya menggunakan mekanisme waktu yang sesuai firmware. Browser menolak data lebih lama daripada `staleAfterMs`, waktu lebih dari 30 detik di masa depan, atau timestamp yang mundur dibanding pembacaan sebelumnya. Timestamp sama tidak menggandakan titik grafik. Waktu tampilan menggunakan WIB; data API dapat memakai UTC.

## 5. CORS dan jaringan

Jika origin dashboard berbeda dari origin API, API harus mengizinkan origin dashboard yang tepat melalui CORS. Contoh respons server:

```http
Access-Control-Allow-Origin: https://alamat-dashboard-anda.example
Content-Type: application/json
Cache-Control: no-store
```

Contoh origin di atas harus diganti. Jika dashboard dan API dilayani dari origin yang sama, izin lintas origin ini tidak diperlukan. Pembatasan jaringan lokal browser tetap harus dipertimbangkan. Gunakan server HTTP/HTTPS untuk pengujian API, bukan membuka HTML sebagai `file://`.

## 6. Perilaku saat koneksi gagal

- Mode perangkat tidak kembali diam-diam ke data dummy.
- Banner menjelaskan timeout, HTTP error, format data salah, atau data kedaluwarsa.
- Sebelum data pertama diterima, angka tampil sebagai tanda `—` dan grafik kosong.
- Setelah pernah tersambung, pembacaan terakhir tetap terlihat dan diberi keterangan data lama.
- Aliran aktif disembunyikan saat koneksi gagal. Kartu sumber tidak mengklaim sumber masih aktif.
- Data hanya dinyatakan tersambung setelah lolos validasi dan pengecekan usia.
- Permintaan dibuat berurutan agar tidak menumpuk; pembaruan otomatis berhenti saat tab tidak terlihat dan dilanjutkan saat tab aktif.

## 7. Kontrol relay belum dihubungkan

Pada `dataSource: 'esp32'`, tombol mode, pemilihan sumber, dan skenario demo dinonaktifkan. Dashboard saat ini hanya membaca data perangkat. Mengubah `config.js` saja tidak mengaktifkan relay.

Jika kontrol nyata dibutuhkan pada tahap berikutnya, tentukan endpoint perintah dan konfirmasi firmware terlebih dahulu. Ganti handler `auto-mode`, `manual-mode`, `choose-solar`, `choose-pln`, dan `confirm-switch` di `app.js` dengan adapter command yang menunggu respons perangkat. Setelah perintah, baca kembali telemetry untuk menampilkan sumber aktual; jangan mengubah UI seolah perintah sukses sebelum perangkat mengonfirmasinya.

Interlock, break-before-make, pemeriksaan sumber, dan proteksi perpindahan harus ditetapkan pada rancangan ATS/firmware, bukan bergantung pada halaman browser. Panduan ini tidak menetapkan pin relay, urutan penyambungan tegangan PLN, atau penundaan perpindahan karena skema proyek belum tersedia.

## 8. Ambang tampilan yang dapat disesuaikan

Saat ini `render()` di `app.js` memberi label tegangan PLN normal pada 180–250 V, baterai cukup pada SOC ≥25%, dan produksi surya pada daya ≥300 W. Ini hanyalah contoh ambang label tampilan. Ganti agar sesuai proyek; jangan memakainya sebagai setelan proteksi perangkat.

Aturan otomatis simulasi ada pada `demoReading()`: surya tersedia/PLN padam memakai surya, surya rendah/baterai rendah memakai PLN. Pada mode perangkat, aturan sumber dijalankan firmware. Label surya merujuk subsistem surya/inverter beserta cadangan baterainya; diagram ini sengaja tidak memodelkan inverter dan baterai secara terpisah.

## 9. Grafik dan riwayat

Grafik demo memakai data contoh 24 jam atau satu jam, terpisah dari nilai kartu saat ini. Grafik perangkat hanya mengumpulkan pembacaan selama halaman terbuka, maksimal 720 titik dalam memori. Pilihan “Sesi ini” menampilkan seluruh titik yang masih tersimpan, sedangkan “1 jam terakhir” memfilter waktu. Belum ada endpoint histori 24 jam.

Riwayat perangkat mencatat perubahan sumber yang terlihat antar-polling dan kondisi koneksi. Dashboard belum mengambil log firmware, sehingga kejadian di antara dua pembacaan atau saat halaman tertutup dapat terlewat. Untuk riwayat lengkap, tambahkan penyimpanan backend dan endpoint histori. Ekspor CSV mengikuti filter aktif, menggunakan waktu ISO 8601, dan mencantumkan asal data.

## 10. Urutan uji setelah firmware siap

1. Buka endpoint API secara langsung dan pastikan format, satuan, dan waktu benar.
2. Ubah `config.js` ke `esp32` dan isi alamat API aktual.
3. Sajikan dashboard melalui HTTP/HTTPS sesuai arsitektur koneksi.
4. Pastikan kartu menampilkan angka yang sesuai pengukuran dan grafik mulai terisi.
5. Pastikan sumber pada diagram sesuai laporan firmware.
6. Hentikan API; dashboard harus menampilkan koneksi terputus tanpa angka dummy.
7. Hidupkan kembali API dengan timestamp terbaru; status harus pulih.
8. Uji respons salah, sensor hilang, baterai 0/100%, serta source `none`.
9. Uji akses dari ponsel pada jaringan yang direncanakan.
10. Kerjakan kontrol relay sebagai tahap integrasi berikutnya setelah rancangan hardware dan kontrak command jelas.

## Ringkasan pekerjaan berikutnya

Yang perlu Anda siapkan: firmware pembacaan sensor, endpoint/gateway API, alamat jaringan, waktu perangkat, serta pemetaan data. Yang perlu diganti di dashboard: `config.js`, dan bila format/protokol berbeda, adapter di `app.js`. HTML/CSS dapat tetap digunakan.
