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
| `prisma/schema.prisma` - AssetFile | Partial | Has cloudUrl, cloudFileId, localPath but NO cloudProvider |
| `src/services/storage.ts` | Partial | Has LOCAL_TEMP, GOOGLE_DRIVE, DROPBOX abstract but not integrated |
| `src/services/render-engine.ts` | Not integrated | Creates AssetFile but no cloud upload |
| `src/services/distribution.ts` | Partial | Has local cleanup after posting |
| `src/app/storage/page.tsx` | Static UI | No actual API integration |
| `src/app/server.ts` | Routes registered | No assets route yet |

---

## Implementation Tasks

### Task 1: Update Prisma Schema (AssetFile Model)

**File:** `prisma/schema.prisma`

Add fields to AssetFile model:

```prisma
model AssetFile {
  // ... existing fields ...

  // New Cloud Storage Fields
  cloudProvider    String?    // GOOGLE_DRIVE | DROPBOX | null
  cloudFolderId    String?    // Folder ID in cloud storage
  cloudPath        String?    // Full path in cloud storage
  fileSize         BigInt?    // File size in bytes
  localSize        BigInt?    // Local cache size (if still cached)
  localCachedAt    DateTime?  // When local cache was created
  uploadRetryCount Int        @default(0)
  uploadError      String?    // Last error message

  @@index([cloudProvider])
  @@index([fileType])
}
```

**Migration:** Generate and run migration

---

### Task 2: Create CloudStorage Service

**File:** `src/services/cloud-storage.ts` (NEW)

Abstraction layer for cloud storage providers:

```typescript
export type CloudProvider = 'GOOGLE_DRIVE' | 'DROPBOX' | 'LOCAL';

export interface UploadResult {
  success: boolean;
  cloudUrl?: string;
  cloudFileId?: string;
  cloudPath?: string;
  error?: string;
}

// Main functions:
// - uploadFile(localPath, cloudPath, options): Promise<UploadResult>
// - deleteFile(provider, cloudFileId): Promise<boolean>
// - getStorageStats(): Promise<StorageStats>
// - listAssets(filters): Promise<AssetList>
// - cleanupLocalCache(): Promise<CleanupResult>
```

**Features:**
- Google Drive: OAuth with token refresh, folder organization
- Dropbox: Direct upload with path handling
- Local: For fallback/error cases
- Upload retry with exponential backoff
- Error tracking in database

---

### Task 3: Update Render Engine with Cloud Upload

**File:** `src/services/render-engine.ts`

Modify `executeRenderJob()` to:

1. After render completes successfully:
   - Create AssetFile with `localPath` set (not cloudUrl)
   - Set `uploadStatus: 'pending'`

2. Call `cloudStorage.uploadFile()`:
   - Upload to configured cloud provider
   - Update AssetFile with `cloudProvider`, `cloudUrl`, `cloudFileId`, `fileSize`
   - Set `uploadStatus: 'uploaded'`

3. Delete local file after successful upload:
   - Update `localPath` to null
   - Set `localCachedAt` to null

```typescript
// After render success:
const uploadResult = await cloudStorage.uploadFile(localPath, cloudPath, options);
if (uploadResult.success) {
  await prisma.assetFile.update({
    where: { id: assetFile.id },
    data: {
      cloudProvider: config.provider,
      cloudUrl: uploadResult.cloudUrl,
      cloudFileId: uploadResult.cloudFileId,
      cloudPath: uploadResult.cloudPath,
      fileSize: uploadResult.fileSize,
      uploadStatus: 'uploaded',
      uploadedAt: new Date(),
      localPath: null,
      localCachedAt: null,
    }
  });
  // Delete local file
  fs.unlinkSync(localPath);
}
```

---

### Task 4: Update Distribution Cleanup

**File:** `src/services/distribution.ts`

Update `cleanupLocalFiles()` function to:

1. Clear local cache references (localPath, localCachedAt)
2. Log cleanup action
3. **Never** delete cloud files

```typescript
async function cleanupLocalFiles(item: DistributionItem): Promise<void> {
  // Get asset files and clear local cache
  if (item.assetFileId) {
    const asset = await prisma.assetFile.findUnique({ where: { id: item.assetFileId } });
    if (asset) {
      // Delete actual local file
      if (asset.localPath && fs.existsSync(asset.localPath)) {
        fs.unlinkSync(asset.localPath);
      }
      // Clear local cache reference in DB
      await prisma.assetFile.update({
        where: { id: asset.id },
        data: { localPath: null, localCachedAt: null },
      });
    }
  }
  // Also handle video/thumbnail URLs from DistributionQueue
}
```

---

### Task 5: Create Assets API Route

**File:** `src/app/routes/assets.ts` (NEW)

RESTful endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | List assets with filters (brand, type, provider, date) |
| GET | `/api/assets/stats/usage` | Get storage usage stats |
| POST | `/api/assets/upload` | Upload existing file to cloud |
| POST | `/api/assets/cleanup` | Clean up local cache |
| DELETE | `/api/assets/:id` | Delete asset (cloud + local) |
| GET | `/api/assets/providers` | Get configured providers |

**Register in `src/app/server.ts`:**

```typescript
import assetsRouter from './routes/assets';
// Add after other routes:
app.use('/api/assets', assetsRouter);
```

---

### Task 6: Build Asset Library UI Page

**File:** `src/app/assets/page.tsx` (NEW)

Features:
- Storage summary cards (Total, Local, Google Drive, Dropbox)
- Filter by: Brand, Asset Type, Cloud Provider, Date range
- Search by filename
- Table view with columns: File, Type, Provider, Size, Product, Date, Actions
- Pagination
- Actions: View cloud link, Delete asset
- Clean local cache button

Design: Dark theme matching existing pages (storage/page.tsx)

---

### Task 7: Build Storage Usage Report UI Page

**File:** `src/app/storage/page.tsx` (UPDATE existing)

Enhance existing page to:
- Show real storage stats from API
- Visual bar chart showing distribution by provider
- List of local cache files with sizes
- Cleanup button
- Provider selection (Google Drive, Dropbox, Local)

---

## Files to Create/Modify

| Task | Action | File |
|------|--------|------|
| 1 | Update | `prisma/schema.prisma` |
| 2 | Create | `src/services/cloud-storage.ts` |
| 3 | Update | `src/services/render-engine.ts` |
| 4 | Update | `src/services/distribution.ts` |
| 5 | Create | `src/app/routes/assets.ts` |
| 5 | Update | `src/app/server.ts` |
| 6 | Create | `src/app/assets/page.tsx` |
| 7 | Update | `src/app/storage/page.tsx` |

---

## Environment Variables (Already in .env)

```bash
# Cloud Storage (configured)
STORAGE_PROVIDER=LOCAL_TEMP
GOOGLE_ACCESS_TOKEN=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
DROPBOX_ACCESS_TOKEN=
LOCAL_TEMP_DIR=./tmp
AUTO_CLEANUP_LOCAL=true
```

---

## Cleanup Rules

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
1. Run render job → check AssetFile has cloudProvider, cloudUrl set
2. Check local file deleted after upload
3. Check DistributionQueue uses cloudUrl not localPath
4. Access `/api/assets` returns list of assets
5. Access `/api/assets/stats/usage` returns stats
6. Asset Library page shows all assets
7. Storage page shows real usage data