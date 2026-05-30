# ============================================
# AI AFFILIATE DISTRIBUTION ENGINE
# Quick Setup Guide
# ============================================

## 📋 ENVIRONMENT VARIABLES (.env)

Berikut daftar variabel yang WAJIB diisi di file `.env`:

### 1. DATABASE_URL
- **Format:** `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
- **Cara dapat:**
  1. Buka https://supabase.com
  2. Pilih project Anda
  3. Project Settings > Database
  4. Copy URI dari Connection string
- **Fungsi:** Koneksi ke database PostgreSQL Supabase

### 2. DATABASE_DIRECT_URL
- **Format:** Sama seperti DATABASE_URL
- **Fungsi:** Direct connection untuk migrations

### 3. TELEGRAM_BOT_TOKEN
- **Format:** `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
- **Cara dapat:**
  1. Buka Telegram, chat dengan @BotFather
  2. Ketik `/newbot`
  3. Ikuti instruksi, simpan Bot Token yang diberikan
- **Fungsi:** Authentikasi untuk Telegram Bot

### 4. AI_API_KEY
- **Format:** `sk-...`
- **Cara dapat:**
  1. Buka https://platform.openai.com
  2. API Keys > Create new secret key
  3. Copy API Key
- **Fungsi:** API key untuk OpenAI content generation

### 5. JWT_SECRET
- **Format:** String acak minimal 32 karakter
- **Contoh:** `your-super-secret-jwt-key-minimum-32-characters-here`
- **Cara buat:** Bisa generate dengan `openssl rand -hex 32`
- **Fungsi:** Secret untuk JWT token encryption

---

## 🚀 CARA JALANKAN

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Setup Environment
```bash
# Copy contoh .env
cp .env.example .env

# Edit .env dan isi semua variabel yang WAJIB DIISI
```

### Step 3: Generate Prisma Client
```bash
npm run db:generate
```

### Step 4: Push Schema ke Database
```bash
npm run db:push
```

### Step 5: Seed Database (Opsional)
```bash
npm run db:seed
```

### Step 6: Jalankan Services

**Terminal 1 - API Server:**
```bash
npm run dev
```

**Terminal 2 - Telegram Bot:**
```bash
npm run dev:bot
```

**Terminal 3 - Background Worker:**
```bash
npm run dev:worker
```

---

## ✅ CHECKLIST TESTING

| Komponen | Status | Command Test |
|----------|--------|--------------|
| API Server | ? | `curl http://localhost:3000/health` |
| Telegram Bot | ? | Check di Telegram bot |
| Worker | ? | Lihat console output |
| Database | ? | `npm run db:studio` |
| Seed Data | ? | Check via API: `GET /api/products` |

---

## 🔧 TROUBLESHOOTING

### Error: "Cannot find module"
→ Jalankan `npm install` lagi

### Error: "Prisma Client not found"
→ Jalankan `npm run db:generate`

### Error: "Invalid DATABASE_URL"
→ Cek format connection string di Supabase

### Error: "Invalid TELEGRAM_BOT_TOKEN"
→ Buka @BotFather, ketik `/token` untuk lihat token

### Error: "Invalid AI_API_KEY"
→ Buka platform.openai.com, cek API key Anda