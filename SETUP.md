# ============================================
# SETUP INSTRUCTIONS - BAHASA INDONESIA
# AI Affiliate Distribution Engine
# ============================================

## 📋 Prerequisites / Persyaratan

Pastikan Anda memiliki software berikut di komputer Anda:

- **Node.js** versi 20.12.0 atau lebih baru
  ```bash
  # Cek versi
  node --version

  # Install Node.js jika belum punya
  # Download dari https://nodejs.org/
  ```

- **npm** versi 10.8.0 atau lebih baru
  ```bash
  npm --version
  ```

- **Git** untuk version control
  ```bash
  git --version
  ```

---

## 🚀 Installation / Instalasi

### 1. Clone atau Download Project

```bash
# Jika menggunakan Git
git clone <repo-url> ai-affiliate-engine
cd ai-affiliate-engine

# Atau extract file yang sudah didownload
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables

Copy file `.env.example` ke `.env`:

```bash
# Linux/Mac
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Edit file `.env` dan isi semua variabel yang dibutuhkan:

```bash
# Text editor
nano .env  # Linux/Mac
notepad .env  # Windows
```

#### Variabel yang WAJIB diisi:

##### Supabase Database
1. Buka https://supabase.com
2. Buat project baru atau pilih project yang ada
3. Buka **Project Settings** → **API**
4. Copy **Project URL** ke `SUPABASE_URL`
5. Copy ** anon/public ** key ke `SUPABASE_ANON_KEY`
6. Copy ** service_role ** key ke `SUPABASE_SERVICE_ROLE_KEY`

##### Telegram Bot
1. Buka Telegram dan chat dengan **@BotFather**
2. Ketik `/newbot` untuk membuat bot baru
3. Ikuti instruksi dan catat **Bot Token**
4. Kirim `/start` ke bot yang baru dibuat
5. Private chat dengan bot, catat **Chat ID** dari URL atau gunakan @userinfobot

##### AI Provider (OpenAI)
1. Buka https://platform.openai.com/
2. Buat API key baru di **API Keys**
3. Copy API key ke `AI_API_KEY`

---

## 🗄️ Database Setup

### 4. Setup Prisma dengan Supabase

Pastikan Anda memiliki **Connection string** dari Supabase:

1. Buka Supabase Dashboard
2. **Project Settings** → **Database**
3. Scroll ke **Connection string**
4. Copy **URI** (format: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`)

Tambahkan ke `.env`:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### 5. Generate Prisma Client & Push Schema

```bash
# Generate Prisma client
npm run db:generate

# Push schema ke database (create/update tables)
npm run db:push

# Opsional: Buat migrate file untuk production
npm run db:migrate
```

### 6. Seed Database (Opsional)

Jalankan seed untuk data contoh:

```bash
npm run db:seed
```

---

## 🤖 Telegram Bot Setup

### 7. Konfigurasi Bot

Di file `.env`, pastikan Anda mengisi:

```env
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_CHAT_ID=your-chat-id
TELEGRAM_APPROVAL_CHAT_ID=your-approval-chat-id
```

### 8. Jalankan Bot

```bash
# Mode development
npm run dev:bot
```

### 9. Test Bot

Buka Telegram dan kirim pesan ke bot Anda:
- Ketik `/start` - untuk memulai
- Ketik `/help` - untuk bantuan
- Ketik `/status` - untuk status sistem

---

## 🎨 Dashboard Setup

### 10. Jalankan Next.js Dashboard

```bash
# Mode development
npm run dev:next
```

Buka browser dan akses:
- Dashboard: http://localhost:3000
- API: http://localhost:3000/api

---

## ⚙️ Workers Setup (Scheduler)

### 11. Jalankan Background Worker

Worker ini menangani scheduling posting:

```bash
# Mode development
npm run dev:worker
```

---

## 🔗 Short Links Setup

### 12. Konfigurasi Redirect

Untuk short links seperti `yoursite.com/go/nama-produkt` berfungsi:

1. Setup custom domain di dashboard Anda
2. Atau gunakan Netlify/Vercel redirect

Tambahkan `_redirects` untuk Netlify atau `vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/go/:slug",
      "destination": "/api/links/:slug"
    }
  ]
}
```

---

## 🧪 Testing

### 13. Test Semua Komponen

```bash
# Run linting
npm run lint

# Run type check
npm run typecheck

# Run tests
npm run test
```

---

## 📦 Production Build

### 14. Build untuk Production

```bash
# Build Next.js
npm run build

# Build API separately
npm run build:api
```

### 15. Persiapan Production

1. Setup **PostgreSQL** production database
2. Set environment variables production
3. Setup **PM2** atau process manager:
   ```bash
   npm install -g pm2
   pm2 start src/app/server.ts --name api
   pm2 start src/bot/index.ts --name bot
   pm2 start src/workers/scheduler.ts --name worker
   ```

4. Setup **Nginx** reverse proxy
5. Setup **SSL** dengan Let's Encrypt
6. Setup **CI/CD** pipeline

---

## 🔧 Troubleshooting

### Error: `Prisma Client not found`
```bash
npm run db:generate
```

### Error: `Cannot connect to database`
1. Cek `DATABASE_URL` di `.env`
2. Pastikan Supabaseallowlist IP Anda
3. Cek firewall settings

### Error: `Telegram Bot Token invalid`
1. Buka @BotFather
2. Ketik `/token` untuk melihat token bot
3. Pastikan tidak ada spasi extra

### Error: `AI API key invalid`
1. Cek `AI_API_KEY` di `.env`
2. Pastikan credits cukup di OpenAI account
3. Cek `AI_BASE_URL` untuk custom endpoint

---

## 📚 Dokumentasi Tambahan

Lihat folder `/docs` untuk:

- `API_DOCUMENTATION.md` - Dokumentasi API lengkap
- `TELEGRAM_BOT_FLOW.md` - Alur Telegram Bot
- `DATABASE_DESIGN.md` - Penjelasan design database
- `DEPLOYMENT.md` - Panduan deployment production

---

## 🆘 Dukungan

Jika ada masalah:

1. Cek logs di terminal
2. Baca error message dengan teliti
3. Cek file `.env` apakah semua variabel terisi
4. Cek Supabase dashboard untuk error database
5. Cek Telegram bot untuk error bot

---

## ✅ Checklist Sebelum Start

- [ ] Node.js terinstall (v20+)
- [ ] Dependencies terinstall (`npm install`)
- [ ] File `.env` sudah dibuat dan dikonfigurasi
- [ ] Database schema sudah dipush (`npm run db:push`)
- [ ] Telegram Bot token sudah ada
- [ ] AI API key sudah ada

Happy building! 🎉
