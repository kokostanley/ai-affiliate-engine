# Google Drive Setup Guide

This guide will help you configure Google Drive as the primary storage provider for AI Affiliate Engine.

---

## Overview

**Local Project Folder (code only - already exists):**
```
C:\Users\Jason Lee\ai-affiliate-engine\
```
Contains: source code, scripts, configuration files.

**Cloud Storage Folder (assets only - will be created):**
```
My Drive/
└── AI-Affiliate-Engine/          # Will be created automatically
    ├── Crypto-EW/                # Brand: Crypto-EW assets
    └── Pippit-Manual/            # Manual Pippit uploads
```

**What gets stored in cloud:**
- Rendered videos (from VEO, Seedance, Sora, Higgsfield)
- Generated images (from DALL-E, Midjourney, Stable Diffusion)
- Carousel graphics
- Pippit prompt files
- Export logs
- Distribution assets

---

## Prerequisites

Before starting, make sure you have:
- ✅ Google Cloud Project with Drive API enabled
- ✅ OAuth credentials (CLIENT_ID and CLIENT_SECRET)

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it something like "AI Affiliate Engine"
4. Wait for project creation
5. **IMPORTANT: Make sure you're signed into the same Google account that has access to the folders**

## Step 2: Enable Google Drive API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click on it and click **Enable**

## Step 3: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name it "AI Affiliate Engine Desktop"
5. Click **Create**
6. Download the JSON file
7. Copy these values:
   - `client_id` (looks like: `123456789-abc.apps.googleusercontent.com`)
   - `client_secret`

## Step 4: Add Credentials to .env

Add your credentials to the `.env` file:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

**Important:** Do NOT add `GOOGLE_REFRESH_TOKEN` yet - we'll get that next.

## Step 5: Get Refresh Token

Run the setup script:

```bash
npm run setup:google-drive
```

This will:
1. Start a local server on port 3002
2. Open an authorization URL in your browser
3. Wait for you to authorize the app
4. Exchange the authorization code for tokens
5. Automatically save the refresh token to `.env`

### What the script does:

1. **Authorization URL** - Opens your browser to Google's consent screen
2. **You authorize** - Click "Allow" to give access to your Google Drive
3. **Callback received** - Script automatically receives the code
4. **Token exchange** - Gets access token + refresh token
5. **Save to .env** - Updates `GOOGLE_REFRESH_TOKEN` and `STORAGE_PROVIDER=GOOGLE_DRIVE`

## Step 6: Restart Server

After setup completes:

```bash
# Stop current server (Ctrl+C)
npm run dev
```

## Step 7: Verify Connection

```bash
# API test
curl http://localhost:3001/api/assets/google-drive/status

# Telegram bot
# Send /storage command
```

---

## Folder Structure

When connected, the system will use/create these folders in Google Drive:

```
My Drive/
└── AI-Affiliate-Engine/          # Root folder (auto-created)
    ├── CepatDapat/               # Brand: CepatDapat assets
    ├── Crypto-EW/                # Brand: Crypto-EW assets
    └── Pippit-Manual/            # Manual Pippit uploads
```

Assets are organized by brand for easy management.

---

## Troubleshooting

## Troubleshooting

### "redirect_uri_mismatch"

The script uses `http://localhost:3002/oauth/callback`. Make sure your OAuth app allows this URI in the "Authorized redirect URIs" settings.

### "Token has been revoked"

Regenerate tokens by running `npm run setup:google-drive` again.

### "Access token expired"

The system automatically refreshes the access token using the refresh token. If this fails, re-run the setup script.

---

## Alternative: OAuth Playground Method

If the automated script doesn't work for you, get the refresh token manually:

1. Go to [OAuth Playground](https://developers.google.com/oauthplayground/)
2. Click ⚙️ (gear icon, top right)
3. Check "Use your own OAuth credentials"
4. Enter your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
5. In the left panel, expand "Drive API v3"
6. Select scope: `https://www.googleapis.com/auth/drive`
7. Click "Authorize APIs"
8. **IMPORTANT:** Sign in with the Google account that has access to the folders
9. Click "Exchange authorization code for tokens"
10. Copy the `refresh_token` value
11. Add to .env:
    ```
    GOOGLE_REFRESH_TOKEN=your-token-here
    STORAGE_PROVIDER=GOOGLE_DRIVE
    ```

---

## Security Notes

- **Never commit `.env` to git** - it contains sensitive credentials
- **Refresh tokens are long-lived** - treat them like passwords
- **If compromised** - go to Google Cloud Console → Credentials → Delete the OAuth client and create a new one

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run setup:google-drive` | Interactive OAuth setup script |
| `npm run test:google-drive` | Test upload and verify connection |
| `curl localhost:3001/api/assets/google-drive/status` | Check connection status |