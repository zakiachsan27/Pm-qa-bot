# Bapenda PM Weekly Report Bot

Bot untuk mengirim weekly status report per modul ke WhatsApp group untuk Pimpinan/PM.
Dilengkapi fitur interaktif - user bisa tanya detail task dengan mention di grup.

## Features

### 1. Weekly Report (Otomatis)
- Dikirim setiap Senin pagi
- Menampilkan task baru minggu lalu per modul
- Format: App - Module + status

### 2. Interactive Q&A
- User mention nomor di grup untuk tanya
- Bot jawab dengan random delay (10-60 detik) + typing indicator
- Kalau hasil terlalu banyak (>10), tampilkan counter dulu lalu tanya mau breakdown yang mana

## Data Source

Google Sheet: Bapenda TU Incident Tracker
- Sheet ID: `1yGPwlS_H5bOuICYaSVDj6TU-gdUvatRhR-WXiTNayfM`
- Tab: Dashboard > NEW TASKS LAST WEEK
- Tab: Current (untuk detail task)

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env:
# - WA_GROUP_IDS: ID grup WhatsApp
# - MENTION_NUMBER: Nomor yang akan di-mention (tanpa +)
# - REPORT_CRON: Schedule weekly report (default: Senin 08:00)
```

### 3. Configure WAHA Webhook
Di WAHA, set webhook URL ke:
```
http://your-server:3002/webhook
```

## Usage

### Start Server (Recommended)
```bash
npm start
# atau
node index.js --server
```
Server akan:
- Listen webhook di port 3002
- Jalankan cron weekly report

### Other Commands
```bash
npm run test-sheets   # Test & preview report
npm run test-waha     # Test WAHA connection
npm run send-now      # Send report immediately
npm run cron          # Weekly report only (no interactive)
```

## Interactive Commands

User bisa mention di grup dengan format:
- `@628xxx detail ERET / ROS` - Detail semua task di app
- `@628xxx detail CoreTax - BPHTB - Penagihan` - Detail task di module tertentu
- `@628xxx status Pajak Online` - Status task di app

### Smart Response
- Jika hasil ≤10 task: Tampilkan detail langsung
- Jika hasil >10 task: Tampilkan counter per status, tanya mau breakdown yang mana

## Weekly Report Format

```
📊 WEEKLY PROGRESS REPORT
Senin, 24 Februari 2026
Periode: 17 Feb 2026 - 24 Feb 2026

📈 RINGKASAN MINGGU INI
Total Task Baru: 7
• On Progress: 1
• Ready to Test: 1
• Ready to Deploy: 4

━━━━━━━━━━━━━━━━━━━━
📱 DETAIL PER MODUL

• CoreTax - BPHTB - Penagihan
  On Testing: 1

• ERET / ROS - Kompensasi
  Ready to Deploy: 1

...
```

## Deployment

### Systemd Service
```bash
sudo cp bapenda-pm-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable bapenda-pm-bot
sudo systemctl start bapenda-pm-bot
```

## Related

- `../qa-bot/` - Daily QA report untuk tim QA

## Author

JagoBikinWebsite - 2026
