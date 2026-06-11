# AI Affiliate Engine - Claude Code Instructions

## Project Overview

AI-powered affiliate marketing engine that renders product images, manages assets, and distributes content to social media platforms.

**Stack:** Next.js, Prisma, PostgreSQL, TypeScript, Tailwind CSS

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 (App Router) |
| Database | PostgreSQL + Prisma ORM |
| API | Express.js (custom server) |
| Styling | Tailwind CSS |
| Rendering | Puppeteer/Sharp |
| Cloud Storage | Google Drive / Dropbox |

## Directory Structure

```
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── api/          # API routes
│   │   ├── assets/       # Asset library page
│   │   ├── storage/      # Storage usage page
│   │   └── server.ts     # Express server entry
│   ├── services/         # Business logic
│   │   ├── render-engine.ts
│   │   ├── distribution.ts
│   │   └── storage.ts
│   └── lib/              # Utilities
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/        # DB migrations
├── scripts/              # CLI scripts
└── docs/                 # Documentation
```

## Common Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Production build

# Database
npx prisma migrate   # Run migrations
npx prisma studio    # Open Prisma Studio
npx prisma generate  # Generate Prisma client

# TypeScript
npx tsc --check      # Type check
npx tsc              # Compile

# Testing
npm test             # Run tests
```

## Development Workflow

1. **Branch naming:** `feature/`, `fix/`, `chore/`
2. **Commits:** Conventional commits (`feat:`, `fix:`, `docs:`)
3. **PRs:** Require review before merge to main

## Code Style

- **TypeScript:** Strict mode enabled
- **Imports:** Use absolute paths via `@/` alias
- **Async:** Always use `async/await`, handle errors with try/catch
- **Prisma:** Use Prisma client singleton pattern

## Testing

- Unit tests: Vitest
- E2E tests: Playwright
- Run before PR: `npm test && npm run build`

---

# Cloud Asset Storage Implementation Plan

## Overview

Add Cloud Asset Storage feature to enable:
- Upload rendered assets to Google Drive or Dropbox
- Track storage location per asset (cloudProvider field)
- Delete local files after successful upload (keep cloud as master)
- Asset Library UI page for browsing and managing assets
- Storage Usage Report UI page

## Current State

| Component | Status | Notes |
|-----------|--------|-------|
| `prisma/schema.prisma` - AssetFile | ✅ Complete | Has cloudProvider, cloudUrl, cloudFileId, cloudPath, fileSize, localCachedAt, uploadStatus, uploadRetryCount, uploadError |
| `src/services/cloud-storage.ts` | ✅ Complete | Full Google Drive & Dropbox integration with retry, folder management, OAuth refresh |
| `src/services/render-engine.ts` | ✅ Complete | Calls `cloudStorage.uploadRenderResult()` after successful render (line 137) |
| `src/services/distribution.ts` | ✅ Complete | `cleanupLocalFiles()` clears localPath/localCachedAt, never deletes cloud files |
| `src/app/routes/assets.ts` | ✅ Complete | Full REST API with filters, stats, providers, cleanup, delete |
| `src/app/assets/page.tsx` | ✅ Complete | Asset Library UI with filters, pagination, stats cards |
| `src/app/storage/page.tsx` | ✅ Complete | Storage Usage Report with real API data, distribution chart |

---

## Implementation Status: ✅ COMPLETE

### Cloud Storage Features Implemented

1. **Prisma Schema** - AssetFile model with cloud storage fields
2. **CloudStorage Service** - Unified API for Google Drive & Dropbox
3. **Render Engine Integration** - Auto-upload after successful render
4. **Distribution Cleanup** - Local cache cleanup without affecting cloud
5. **Assets API** - Full REST API for asset management
6. **Asset Library UI** - Browse and manage assets at `/assets`
7. **Storage Report UI** - Real usage stats at `/storage`

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | List assets with filters |
| GET | `/api/assets/stats/usage` | Storage usage statistics |
| GET | `/api/assets/providers` | Configured providers |
| POST | `/api/assets/upload` | Upload file to cloud |
| POST | `/api/assets/cleanup` | Clean local cache |
| DELETE | `/api/assets/:id` | Delete asset |
| GET | `/api/assets/google-drive/status` | Test Google Drive connection |

### Cleanup Rules

| Event | Local File | Cloud File |
|-------|------------|------------|
| After render upload | Delete | Keep (master) |
| After posting | Delete if local | Keep |
| Manual cleanup | Delete | Keep |
| Delete asset | Delete local | Delete |

**Key principle:** Cloud files are the master copy. Local files are temporary cache.

---

## Verification

After implementation:
1. ✅ Run render job → AssetFile has cloudProvider, cloudUrl set
2. ✅ Local file deleted after upload
3. ✅ DistributionQueue uses cloudUrl not localPath
4. ✅ `/api/assets` returns list of assets
5. ✅ `/api/assets/stats/usage` returns stats
6. ✅ Asset Library page shows all assets
7. ✅ Storage page shows real usage data