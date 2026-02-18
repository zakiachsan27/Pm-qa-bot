# Bapenda Notification Bots

Bot notifikasi WhatsApp untuk Bapenda DKI Jakarta.

## Bots

### 1. QA Bot (`qa-bot/`)
Daily report untuk tim QA - status task QA testing.

- **Schedule:** Senin-Jumat, 08:00 WIB
- **Data Source:** Google Sheet QA Tracker
- **Target:** Group WhatsApp QA

### 2. PM Bot (`pm-bot/`)
Weekly report untuk Pimpinan - status per aplikasi.

- **Schedule:** Manual (belum diaktifkan)
- **Data Source:** Google Sheet TU Incident Tracker
- **Target:** Group WhatsApp Pimpinan

## Tech Stack

- Node.js
- Google Sheets API (public URL method)
- WAHA (WhatsApp HTTP API)
- node-cron

## Setup

### Prerequisites
- Node.js v18+
- WAHA server running
- Google Sheets dengan akses public

### Installation

```bash
# QA Bot
cd qa-bot
cp .env.example .env
# Edit .env dengan credentials
npm install

# PM Bot
cd pm-bot
cp .env.example .env
# Edit .env dengan credentials
npm install
```

### Running

```bash
# Test sheets connection
npm run test-sheets

# Test WAHA connection
npm run test-waha

# Send report now
npm run send-now

# Start cron job
npm start
```

## Deployment

Menggunakan systemd service. Contoh untuk qa-bot:

```bash
sudo cp qa-bot/bapenda-qa-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable bapenda-qa-bot
sudo systemctl start bapenda-qa-bot
```

## Project Structure

```
Pm-qa-bot/
├── qa-bot/
│   ├── index.js
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── sheets.js    # Google Sheets service
│       ├── report.js    # QA report generator
│       └── waha.js      # WhatsApp service
├── pm-bot/
│   ├── index.js
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── sheets.js    # Google Sheets service
│       ├── report.js    # PM report generator
│       └── waha.js      # WhatsApp service
└── README.md
```

## Author

JagoBikinWebsite - 2026
