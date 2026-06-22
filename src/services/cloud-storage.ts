// ============================================
// CLOUD STORAGE SERVICE
// Cloud asset management with Google Drive & Dropbox
// ============================================

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// ============================================
// TYPES
// ============================================

export type CloudProvider = 'GOOGLE_DRIVE' | 'DROPBOX' | 'LOCAL';
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface UploadOptions {
  provider?: CloudProvider;
  productId?: string;
  packageId?: string;
  renderJobId?: string;
  fileType?: string;
  fileName?: string;
  mimeType?: string;
  folderId?: string;
  cloudPath?: string;
}

export interface UploadResult {
  success: boolean;
  assetFileId?: string;
  cloudUrl?: string;
  cloudFileId?: string;
  cloudPath?: string;
  fileSize?: bigint;
  error?: string;
}

export interface AssetFilters {
  brandId?: string;
  productId?: string;
  fileType?: string;
  cloudProvider?: CloudProvider;
  status?: UploadStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface StorageStats {
  local: { count: number; size: bigint; files: LocalFileInfo[] };
  googleDrive: { count: number; size: bigint };
  dropbox: { count: number; size: bigint };
  summary: {
    totalFiles: number;
    totalSize: bigint;
    byProvider: Record<string, number>;
  };
}

export interface LocalFileInfo {
  id: string;
  fileName: string;
  localPath: string;
  localSize: bigint;
  localCachedAt: Date;
}

// ============================================
// CONFIG
// ============================================

const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'LOCAL') as CloudProvider;
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN || '';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN || '';
const LOCAL_TEMP_DIR = process.env.LOCAL_TEMP_DIR || './tmp';
const AUTO_CLEANUP = process.env.AUTO_CLEANUP_LOCAL !== 'false';

// ============================================
// HELPERS
// ============================================

function ensureTempDir(): string {
  const dir = path.resolve(LOCAL_TEMP_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getFileSize(filePath: string): bigint {
  try {
    const stats = fs.statSync(filePath);
    return BigInt(stats.size);
  } catch {
    return BigInt(0);
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// ============================================
// GOOGLE DRIVE UPLOAD
// ============================================

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
}

interface GoogleDriveSpaceInfo {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
}

async function refreshGoogleToken(): Promise<string | null> {
  if (!GOOGLE_REFRESH_TOKEN) {
    console.log('[CloudStorage] No refresh token available');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('[CloudStorage] Token refresh failed:', response.status);
      return null;
    }

    const result: any = await response.json();
    return result.access_token;
  } catch (error) {
    console.error('[CloudStorage] Token refresh error:', error);
    return null;
  }
}

async function uploadToGoogleDrive(
  filePath: string,
  filename: string,
  folderId?: string
): Promise<{ success: boolean; cloudUrl?: string; cloudFileId?: string; error?: string }> {
  let accessToken = GOOGLE_ACCESS_TOKEN;

  // Try refresh if needed
  if (!accessToken && GOOGLE_REFRESH_TOKEN) {
    accessToken = await refreshGoogleToken();
  }

  if (!accessToken) {
    return { success: false, error: 'Google Drive not authenticated' };
  }

  try {
    const fileContent = fs.readFileSync(filePath);
    const boundary = 'boundary_' + Date.now();

    const metadata = JSON.stringify({
      name: filename,
      parents: [folderId || GOOGLE_DRIVE_FOLDER_ID || 'root'],
    });

    const metadataStart = Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n');
    const metadataEnd = Buffer.from('\r\n--' + boundary + '--\r\n');
    const contentStart = Buffer.from('\r\n--' + boundary + '\r\nContent-Type: ' + getMimeType(filePath) + '\r\n\r\n');

    const buffer = Buffer.concat([
      metadataStart,
      Buffer.from(metadata),
      contentStart,
      fileContent,
      metadataEnd,
    ]);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': buffer.length.toString(),
      },
      body: buffer,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[CloudStorage] Google Drive upload failed:', response.status, error);
      return { success: false, error: `Upload failed: ${response.status}` };
    }

    const result: any = await response.json();

    // Make file public
    await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    const webViewLink = result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;
    // Use direct download URL format for Zernio compatibility
    const directUrl = `https://drive.google.com/uc?export=download&id=${result.id}`;

    return {
      success: true,
      cloudUrl: directUrl,
      cloudFileId: result.id,
    };
  } catch (error: any) {
    console.error('[CloudStorage] Google Drive error:', error);
    return { success: false, error: error.message };
  }
}

async function deleteFromGoogleDrive(fileId: string): Promise<boolean> {
  let accessToken = GOOGLE_ACCESS_TOKEN;

  if (!accessToken && GOOGLE_REFRESH_TOKEN) {
    accessToken = await refreshGoogleToken();
  }

  if (!accessToken) return false;

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

// ============================================
// GOOGLE DRIVE - FOLDER & STORAGE MANAGEMENT
// ============================================

async function getGoogleAccessToken(): Promise<string | null> {
  let accessToken = GOOGLE_ACCESS_TOKEN;

  if (!accessToken && GOOGLE_REFRESH_TOKEN) {
    accessToken = await refreshGoogleToken();
  }

  return accessToken;
}

export async function createGoogleDriveFolder(name: string, parentId?: string): Promise<{ success: boolean; folderId?: string; error?: string }> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return { success: false, error: 'Google Drive not authenticated' };
  }

  try {
    const metadata: any = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentId) {
      metadata.parents = [parentId];
    } else if (GOOGLE_DRIVE_FOLDER_ID) {
      metadata.parents = [GOOGLE_DRIVE_FOLDER_ID];
    }

    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[CloudStorage] Create folder failed:', error);
      return { success: false, error: `Failed to create folder: ${response.status}` };
    }

    const result: any = await response.json();
    console.log(`[CloudStorage] Created folder: ${name} (${result.id})`);
    return { success: true, folderId: result.id };
  } catch (error: any) {
    console.error('[CloudStorage] Create folder error:', error);
    return { success: false, error: error.message };
  }
}

export async function findOrCreateRootFolder(): Promise<{ success: boolean; folderId?: string; error?: string }> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return { success: false, error: 'Google Drive not authenticated' };
  }

  const FOLDER_NAME = 'AI-Affiliate-Engine';

  try {
    // Search for existing folder
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents`)}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (searchResponse.ok) {
      const searchResult: any = await searchResponse.json();
      if (searchResult.files && searchResult.files.length > 0) {
        console.log(`[CloudStorage] Found existing folder: ${searchResult.files[0].id}`);
        return { success: true, folderId: searchResult.files[0].id };
      }
    }

    // Create the folder
    return await createGoogleDriveFolder(FOLDER_NAME);
  } catch (error: any) {
    console.error('[CloudStorage] Find/create folder error:', error);
    return { success: false, error: error.message };
  }
}

export async function getGoogleDriveStorageInfo(): Promise<{ success: boolean; data?: GoogleDriveSpaceInfo; error?: string }> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return { success: false, error: 'Google Drive not authenticated' };
  }

  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to get storage info: ${response.status}` };
    }

    const about: any = await response.json();
    const quota = about.storageQuota || {};

    return {
      success: true,
      data: {
        totalBytes: parseInt(quota.limit || '0'),
        usedBytes: parseInt(quota.usage || '0'),
        freeBytes: parseInt(quota.limit || '0') - parseInt(quota.usage || '0'),
      },
    };
  } catch (error: any) {
    console.error('[CloudStorage] Get storage info error:', error);
    return { success: false, error: error.message };
  }
}

export async function testGoogleDriveConnection(): Promise<{ success: boolean; connected: boolean; message: string; folderId?: string }> {
  if (!GOOGLE_REFRESH_TOKEN && !GOOGLE_ACCESS_TOKEN) {
    return { success: false, connected: false, message: 'Not configured - needs GOOGLE_REFRESH_TOKEN or GOOGLE_ACCESS_TOKEN' };
  }

  if (GOOGLE_REFRESH_TOKEN) {
    const accessToken = await refreshGoogleToken();
    if (!accessToken) {
      return { success: false, connected: false, message: 'Failed to refresh token - check GOOGLE_CLIENT_ID/CLIENT_SECRET' };
    }
  }

  // Try to get about info
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return { success: false, connected: false, message: 'Cannot get access token' };
  }

  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { success: false, connected: false, message: `API error: ${response.status}` };
    }

    const about: any = await response.json();
    const userEmail = about.user?.emailAddress || 'Unknown';
    const quota = about.storageQuota || {};
    const usedGB = ((parseInt(quota.usage || '0')) / (1024 * 1024 * 1024)).toFixed(2);
    const totalGB = ((parseInt(quota.limit || '0')) / (1024 * 1024 * 1024)).toFixed(2);

    // Find or create root folder
    const folderResult = await findOrCreateRootFolder();
    const folderId = folderResult.success ? folderResult.folderId : undefined;

    return {
      success: true,
      connected: true,
      message: `Connected as ${userEmail} | Used: ${usedGB}GB / ${totalGB}GB | Folder: AI-Affiliate-Engine`,
      folderId,
    };
  } catch (error: any) {
    return { success: false, connected: false, message: `Error: ${error.message}` };
  }
}

export function isGoogleDriveConfigured(): boolean {
  return !!(GOOGLE_ACCESS_TOKEN || GOOGLE_REFRESH_TOKEN);
}

export function isGoogleDriveFullyConfigured(): boolean {
  return !!(GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// ============================================
// DROPBOX UPLOAD
// ============================================

async function uploadToDropbox(
  filePath: string,
  filename: string,
  cloudPath?: string
): Promise<{ success: boolean; cloudUrl?: string; cloudFileId?: string; error?: string }> {
  if (!DROPBOX_ACCESS_TOKEN) {
    return { success: false, error: 'Dropbox not authenticated' };
  }

  try {
    const fileContent = fs.readFileSync(filePath);
    const targetPath = cloudPath || `/${filename}`;

    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: targetPath,
          mode: 'add',
          autorename: true,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: fileContent,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[CloudStorage] Dropbox upload failed:', error);
      return { success: false, error: `Upload failed: ${error}` };
    }

    const result: any = await response.json();
    const cloudUrl = result.path_lower ? `https://www.dropbox.com${result.path_display}?dl=1` : result.url;

    return {
      success: true,
      cloudUrl,
      cloudFileId: result.id,
    };
  } catch (error: any) {
    console.error('[CloudStorage] Dropbox error:', error);
    return { success: false, error: error.message };
  }
}

async function deleteFromDropbox(fileId: string): Promise<boolean> {
  if (!DROPBOX_ACCESS_TOKEN) return false;

  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: fileId }),
    });

    return response.ok || response.status === 409; // 409 if already deleted
  } catch {
    return false;
  }
}

// ============================================
// UPLOAD FILE
// ============================================

export async function uploadFile(
  localPath: string,
  filename: string,
  options?: UploadOptions
): Promise<UploadResult> {
  const provider = options?.provider || STORAGE_PROVIDER;

  console.log(`[CloudStorage] Uploading ${filename} via ${provider}`);

  let uploadResult: { success: boolean; cloudUrl?: string; cloudFileId?: string; error?: string };

  // Upload to cloud provider
  switch (provider) {
    case 'GOOGLE_DRIVE':
      uploadResult = await uploadToGoogleDrive(localPath, filename, options?.folderId);
      break;

    case 'DROPBOX':
      uploadResult = await uploadToDropbox(localPath, filename, options?.cloudPath);
      break;

    case 'LOCAL':
    default:
      // For LOCAL, just store locally and return file:// URL
      const destPath = path.join(ensureTempDir(), filename);
      fs.copyFileSync(localPath, destPath);
      uploadResult = {
        success: true,
        cloudUrl: `file://${destPath}`,
        cloudFileId: destPath,
      };
      break;
  }

  if (!uploadResult.success) {
    // Create AssetFile with failed status
    const assetFile = await prisma.assetFile.create({
      data: {
        productId: options?.productId,
        packageId: options?.packageId,
        renderJobId: options?.renderJobId,
        fileType: options?.fileType || 'VIDEO',
        fileName: filename,
        provider: options?.provider || 'UNKNOWN',
        cloudProvider: provider,
        localPath,
        fileSize: getFileSize(localPath),
        mimeType: getMimeType(localPath),
        localCachedAt: new Date(),
        uploadStatus: 'failed',
        uploadError: uploadResult.error,
        uploadRetryCount: 1,
      },
    });

    return { success: false, error: uploadResult.error };
  }

  // Delete local file after successful upload
  if (AUTO_CLEANUP && fs.existsSync(localPath)) {
    try {
      fs.unlinkSync(localPath);
      console.log(`[CloudStorage] Deleted local file: ${localPath}`);
    } catch (error) {
      console.error(`[CloudStorage] Failed to delete local file:`, error);
    }
  }

  // Create AssetFile with uploaded status
  const assetFile = await prisma.assetFile.create({
    data: {
      productId: options?.productId,
      packageId: options?.packageId,
      renderJobId: options?.renderJobId,
      fileType: options?.fileType || 'VIDEO',
      fileName: filename,
      provider: options?.provider || 'UNKNOWN',
      cloudProvider: provider,
      cloudUrl: uploadResult.cloudUrl,
      cloudFileId: uploadResult.cloudFileId,
      cloudPath: options?.cloudPath,
      fileSize: getFileSize(localPath),
      mimeType: getMimeType(localPath),
      uploadStatus: 'uploaded',
      uploadedAt: new Date(),
    },
  });

  console.log(`[CloudStorage] Upload complete. Asset ID: ${assetFile.id}`);

  return {
    success: true,
    assetFileId: assetFile.id,
    cloudUrl: uploadResult.cloudUrl,
    cloudFileId: uploadResult.cloudFileId,
    cloudPath: options?.cloudPath,
  };
}

// ============================================
// DELETE ASSET
// ============================================

export async function deleteAssetFile(assetFileId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const asset = await prisma.assetFile.findUnique({ where: { id: assetFileId } });

    if (!asset) {
      return { success: false, error: 'Asset not found' };
    }

    // Delete from cloud provider
    if (asset.cloudFileId && asset.cloudProvider) {
      switch (asset.cloudProvider) {
        case 'GOOGLE_DRIVE':
          await deleteFromGoogleDrive(asset.cloudFileId);
          break;
        case 'DROPBOX':
          await deleteFromDropbox(asset.cloudFileId);
          break;
      }
    }

    // Delete local file if exists
    if (asset.localPath && fs.existsSync(asset.localPath)) {
      fs.unlinkSync(asset.localPath);
    }

    // Delete database record
    await prisma.assetFile.delete({ where: { id: assetFileId } });

    console.log(`[CloudStorage] Deleted asset: ${assetFileId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[CloudStorage] Delete error:`, error);
    return { success: false, error: error.message };
  }
}

// ============================================
// LIST ASSETS
// ============================================

export async function listAssets(filters: AssetFilters): Promise<{
  assets: any[];
  total: number;
}> {
  const where: any = {};

  if (filters.productId) where.productId = filters.productId;
  if (filters.fileType) where.fileType = filters.fileType;
  if (filters.cloudProvider) where.cloudProvider = filters.cloudProvider;
  if (filters.status) where.uploadStatus = filters.status;

  if (filters.search) {
    where.OR = [
      { fileName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [assets, total] = await Promise.all([
    prisma.assetFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
    prisma.assetFile.count({ where }),
  ]);

  return { assets: assets as any[], total };
}

// ============================================
// STORAGE STATS
// ============================================

export async function getStorageStats(): Promise<StorageStats> {
  // Count by provider
  const [googleDriveAssets, dropboxAssets, localAssets] = await Promise.all([
    prisma.assetFile.findMany({
      where: { cloudProvider: 'GOOGLE_DRIVE', uploadStatus: 'uploaded' },
      select: { fileSize: true },
    }),
    prisma.assetFile.findMany({
      where: { cloudProvider: 'DROPBOX', uploadStatus: 'uploaded' },
      select: { fileSize: true },
    }),
    prisma.assetFile.findMany({
      where: {
        OR: [
          { localPath: { not: null } },
          { cloudProvider: 'LOCAL' },
        ],
      },
      select: { id: true, fileName: true, localPath: true, localSize: true, localCachedAt: true, cloudProvider: true },
    }),
  ]);

  // Calculate totals
  const googleDriveSize = googleDriveAssets.reduce((sum, a) => sum + (a.fileSize || BigInt(0)), BigInt(0));
  const dropboxSize = dropboxAssets.reduce((sum, a) => sum + (a.fileSize || BigInt(0)), BigInt(0));
  const localSize = localAssets.reduce((sum, a) => sum + (a.localSize || BigInt(0)), BigInt(0));

  // Local files info
  const localFiles: LocalFileInfo[] = localAssets.map(a => ({
    id: a.id,
    fileName: a.fileName,
    localPath: a.localPath || '',
    localSize: a.localSize || BigInt(0),
    localCachedAt: a.localCachedAt || new Date(),
  }));

  const totalSize = googleDriveSize + dropboxSize + localSize;

  return {
    local: { count: localAssets.length, size: localSize, files: localFiles },
    googleDrive: { count: googleDriveAssets.length, size: googleDriveSize },
    dropbox: { count: dropboxAssets.length, size: dropboxSize },
    summary: {
      totalFiles: googleDriveAssets.length + dropboxAssets.length + localAssets.length,
      totalSize,
      byProvider: {
        GOOGLE_DRIVE: googleDriveAssets.length,
        DROPBOX: dropboxAssets.length,
        LOCAL: localAssets.length,
      },
    },
  };
}

// ============================================
// CLEANUP LOCAL CACHE
// ============================================

export async function cleanupLocalCache(): Promise<{ deleted: number; errors: string[] }> {
  const localAssets = await prisma.assetFile.findMany({
    where: { localPath: { not: null } },
  });

  const errors: string[] = [];
  let deleted = 0;

  for (const asset of localAssets) {
    if (asset.localPath && fs.existsSync(asset.localPath)) {
      try {
        fs.unlinkSync(asset.localPath);
        await prisma.assetFile.update({
          where: { id: asset.id },
          data: { localPath: null, localCachedAt: null },
        });
        deleted++;
        console.log(`[CloudStorage] Deleted local: ${asset.localPath}`);
      } catch (error: any) {
        errors.push(`${asset.fileName}: ${error.message}`);
      }
    } else {
      // File doesn't exist, just clear the reference
      await prisma.assetFile.update({
        where: { id: asset.id },
        data: { localPath: null, localCachedAt: null },
      });
    }
  }

  // Also cleanup orphaned files in tmp directory
  const tempDir = ensureTempDir();
  if (fs.existsSync(tempDir)) {
    const tempFiles = fs.readdirSync(tempDir);
    for (const file of tempFiles) {
      const filePath = path.join(tempDir, file);
      try {
        const stats = fs.statSync(filePath);
        // Delete files older than 24 hours
        const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
        if (ageHours > 24) {
          fs.unlinkSync(filePath);
          console.log(`[CloudStorage] Deleted orphaned temp: ${filePath}`);
        }
      } catch {
        // Skip
      }
    }
  }

  console.log(`[CloudStorage] Cleanup done: ${deleted} files deleted, ${errors.length} errors`);
  return { deleted, errors };
}

// ============================================
// GET CONFIGURED PROVIDERS
// ============================================

export function getConfiguredProviders(): { provider: CloudProvider; configured: boolean; message: string }[] {
  return [
    {
      provider: 'GOOGLE_DRIVE',
      configured: !!(GOOGLE_ACCESS_TOKEN || GOOGLE_REFRESH_TOKEN),
      message: GOOGLE_ACCESS_TOKEN || GOOGLE_REFRESH_TOKEN
        ? 'Google Drive configured'
        : 'Add GOOGLE_ACCESS_TOKEN or GOOGLE_REFRESH_TOKEN',
    },
    {
      provider: 'DROPBOX',
      configured: !!DROPBOX_ACCESS_TOKEN,
      message: DROPBOX_ACCESS_TOKEN
        ? 'Dropbox configured'
        : 'Add DROPBOX_ACCESS_TOKEN',
    },
    {
      provider: 'LOCAL',
      configured: true,
      message: `Local temp at ${LOCAL_TEMP_DIR}`,
    },
  ];
}

// ============================================
// UPLOAD FROM RENDER RESULT
// ============================================

export async function uploadRenderResult(
  jobId: string,
  outputUrl: string,
  options?: UploadOptions
): Promise<UploadResult> {
  // Check if output is a local file
  if (outputUrl.startsWith('file://')) {
    const localPath = outputUrl.replace('file://', '');
    if (fs.existsSync(localPath)) {
      const filename = path.basename(localPath);
      return uploadFile(localPath, filename, {
        ...options,
        renderJobId: jobId,
      });
    }
  }

  // If already a remote URL, create asset without upload
  const assetFile = await prisma.assetFile.create({
    data: {
      productId: options?.productId,
      packageId: options?.packageId,
      renderJobId: jobId,
      fileType: options?.fileType || 'VIDEO',
      fileName: options?.fileName || 'render_output',
      provider: options?.provider || 'HIGGSFIELD',
      cloudProvider: 'LOCAL',
      cloudUrl: outputUrl,
      uploadStatus: 'uploaded',
      uploadedAt: new Date(),
    },
  });

  return {
    success: true,
    assetFileId: assetFile.id,
    cloudUrl: outputUrl,
  };
}