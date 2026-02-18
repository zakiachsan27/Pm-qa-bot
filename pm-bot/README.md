# Bapenda PM Weekly Report Bot

Bot untuk mengirim weekly status report per aplikasi ke WhatsApp group untuk Pimpinan/PM.

## Data Source

Google Sheet: Bapenda TU Incident Tracker
- Sheet ID: `1yGPwlS_H5bOuICYaSVDj6TU-gdUvatRhR-WXiTNayfM`
- Tab: Dashboard (row 42+) - STATUS COMPARISON
- Tab: Current - Task details

Data di-sync dari web ke Google Sheet via Chrome Extension.

## Report Format

Report menampilkan per aplikasi:
1. **Status Comparison** - Jumlah task per status (Now vs 7 hari lalu)
2. **Task Names** - Daftar task yang sedang On Progress

Contoh output:
```
📊 WEEKLY STATUS REPORT
Rabu, 18 Februari 2026
Perbandingan vs 7 hari lalu

━━━━━━━━━━━━━━━━━━━━
📱 Pajak Online
Total: 135 (+919)

📊 Status Minggu Ini:
• On Progress: 21 (+74)
• Ready to Test: 9 (+34)
• On Testing: 3 (+10)
• Ready to Deploy: 102

🔧 On Progress:
• [3601] Ubah pengecekan skpd...
• [3513] Tambahkan di ref_param...
+15 lainnya

...

📈 TOTAL SEMUA APP
Total Task: 1045 (+3408)
On Progress: 63 (+213)
Ready to Test: 80 (+280)
On Testing: 16 (+52)
Ready to Deploy: 469
```

## Setup

1. Copy `.env.example` ke `.env`
2. Configure WhatsApp group IDs di `WA_GROUP_IDS`
3. Install dependencies: `npm install`
4. Test: `npm run test-sheets`

## Usage

```bash
# Test Google Sheets connection
npm run test-sheets

# Test WAHA connection
npm run test-waha

# Send report now
npm run send-now

# Start cron job (default: Monday 08:00 WIB)
npm start
```

## Cron Schedule

Default: `0 8 * * 1` (Every Monday 8 AM WIB)

Ubah di `.env`:
```
REPORT_CRON=0 8 * * 1
```

## Related Projects

- `bapenda-qa-bot` - Daily QA report untuk tim QA

## Author

JagoBikinWebsite - 2026
