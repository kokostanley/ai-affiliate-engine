// ============================================
// STORAGE PROVIDER SERVICE
// Cloud storage abstraction for assets
// LOCAL_TEMP | GOOGLE_DRIVE | DROPBOX
// ============================================

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { google, dropbox } from 'dropbox';

dotenv.config();

// ============================================
// TYPES
// ============================================

export type StorageProvider = 'LOCAL_TEMP' | 'GOOGLE_DRIVE' | 'DROPBOX';

export interface StorageConfig {
  provider: StorageProvider;
  localTempDir: string;
  autoCleanup: boolean;
  googleDriveFolderId?: string;
  dropboxAccessToken?: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
}

export interface StoredFile {
  success: boolean;
  url?: string;
  fileId?: string;
  path?: string;
  error?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: Date;
}

// ============================================
// CONFIG
// ============================================

const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'LOCAL_TEMP') as StorageProvider;
const LOCAL_TEMP_DIR = process.env.LOCAL_TEMP_DIR || './tmp';
const AUTO_CLEANUP = process.env.AUTO_CLEANUP_LOCAL !== 'false';
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN || '';
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN || '';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';

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

function getTempPath(filename: string): string {
  return path.join(ensureTempDir(), filename);
}

// ============================================
// STORAGE PROVIDER ABSTRACTION
// ============================================

export function getStorageProvider(): StorageProvider {
  return STORAGE_PROVIDER;
}

export function isConfigured(): { provider: StorageProvider; configured: boolean; message: string } {
  switch (STORAGE_PROVIDER) {
    case 'LOCAL_TEMP':
      return { provider: STORAGE_PROVIDER, configured: true, message: 'Local temp storage active' };

    case 'GOOGLE_DRIVE':
      if (!GOOGLE_ACCESS_TOKEN && !GOOGLE_REFRESH_TOKEN) {
        return { provider: STORAGE_PROVIDER, configured: false, message: 'Google Drive not configured' };
      }
      return { provider: STORAGE_PROVIDER, configured: true, message: 'Google Drive configured' };

    case 'DROPBOX':
      if (!DROPBOX_ACCESS_TOKEN) {
        return { provider: STORAGE_PROVIDER, configured: false, message: 'Dropbox not configured' };
      }
      return { provider: STORAGE_PROVIDER, configured: true, message: 'Dropbox configured' };

    default:
      return { provider: 'LOCAL_TEMP', configured: true, message: 'Using local temp' };
  }
}

// ============================================
// LOCAL TEMP STORAGE
// ============================================

async function storeLocalTemp(filePath: string, filename: string): Promise<StoredFile> {
  try {
    const destPath = getTempPath(filename);
    const sourceData = fs.readFileSync(filePath);
    fs.writeFileSync(destPath, sourceData);

    return {
      success: true,
      path: destPath,
      url: `file://${destPath}`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function deleteLocalTemp(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch {
    return false;
  }
}

function listLocalTemp(): FileInfo[] {
  try {
    const dir = ensureTempDir();
    const files = fs.readdirSync(dir);
    return files.map(name => {
      const filePath = path.join(dir, name);
      const stats = fs.statSync(filePath);
      return {
        name,
        path: filePath,
        size: stats.size,
        createdAt: stats.birthtime,
      };
    });
  } catch {
    return [];
  }
}

// ============================================
// GOOGLE DRIVE STORAGE
// ============================================

async function uploadToGoogleDrive(filePath: string, filename: string, folderId?: string): Promise<StoredFile> {
  try {
    const accessToken = GOOGLE_ACCESS_TOKEN;

    if (!accessToken) {
      return { success: false, error: 'Google Drive not authenticated' };
    }

    const fileContent = fs.readFileSync(filePath);
    const boundary = 'boundary_' + Date.now();
    const fileSize = fileContent.length;

    // Build multipart request
    const metadata = JSON.stringify({
      name: filename,
      parents: [folderId || GOOGLE_DRIVE_FOLDER_ID || 'root'],
    });

    const metadataStart = Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n');
    const metadataEnd = Buffer.from('\r\n--' + boundary + '--\r\n');
    const contentStart = Buffer.from('\r\n--' + boundary + '\r\nContent-Type: application/octet-stream\r\n\r\n');

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
      return { success: false, error: `Google Drive upload failed: ${response.status}` };
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

    // Delete local file if configured
    if (AUTO_CLEANUP) {
      deleteLocalTemp(filePath);
    }

    return {
      success: true,
      url: webViewLink,
      fileId: result.id,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// DROPBOX STORAGE
// ============================================

async function uploadToDropbox(filePath: string, filename: string): Promise<StoredFile> {
  try {
    if (!DROPBOX_ACCESS_TOKEN) {
      return { success: false, error: 'Dropbox not authenticated' };
    }

    const fileContent = fs.readFileSync(filePath);
    const base64Content = fileContent.toString('base64');

    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: `/${filename}`,
          mode: 'add',
          autorename: true,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: fileContent,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Dropbox upload failed: ${error}` };
    }

    const result: any = await response.json();

    // Delete local file if configured
    if (AUTO_CLEANUP) {
      deleteLocalTemp(filePath);
    }

    return {
      success: true,
      url: result.path_lower ? `https://www.dropbox.com${result.path_display}?dl=1` : result.url,
      fileId: result.id,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// UNIFIED API
// ============================================

export async function uploadFile(
  filePath: string,
  filename: string,
  options?: { folderId?: string }
): Promise<StoredFile> {
  console.log(`[Storage] Uploading ${filename} via ${STORAGE_PROVIDER}`);

  switch (STORAGE_PROVIDER) {
    case 'DROPBOX':
      return uploadToDropbox(filePath, filename);

    case 'GOOGLE_DRIVE':
      return uploadToGoogleDrive(filePath, filename, options?.folderId);

    case 'LOCAL_TEMP':
    default:
      return storeLocalTemp(filePath, filename);
  }
}

export async function uploadContent(
  content: string,
  filename: string
): Promise<StoredFile> {
  // Write content to temp file first
  const tempPath = getTempPath(filename);
  fs.writeFileSync(tempPath, content, 'utf-8');

  return uploadFile(tempPath, filename);
}

export function deleteFile(filePath: string): boolean {
  return deleteLocalTemp(filePath);
}

export function cleanupTemp(): { deleted: number; errors: string[] } {
  const files = listLocalTemp();
  const errors: string[] = [];
  let deleted = 0;

  for (const file of files) {
    if (deleteLocalTemp(file.path)) {
      deleted++;
    } else {
      errors.push(file.path);
    }
  }

  return { deleted, errors };
}

export function listFiles(): FileInfo[] {
  return listLocalTemp();
}

export function getStorageStats(): {
  provider: StorageProvider;
  tempFiles: number;
  tempSize: number;
  autoCleanup: boolean;
} {
  const files = listLocalTemp();
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return {
    provider: STORAGE_PROVIDER,
    tempFiles: files.length,
    tempSize: totalSize,
    autoCleanup: AUTO_CLEANUP,
  };
}

// ============================================
// EXPORT PACKAGE TO CLOUD
// ============================================

export interface ExportPackage {
  files: Record<string, string>;
  productName: string;
  packageId: string;
}

export async function exportPackageToCloud(pkg: ExportPackage): Promise<StoredFile> {
  console.log(`[Storage] Exporting package ${pkg.packageId}`);

  const { files, productName, packageId } = pkg;
  const safeName = productName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const timestamp = Date.now();
  const folderName = `${safeName}_${timestamp}`;

  try {
    // Upload each file
    const uploadedFiles: { name: string; url: string }[] = [];

    for (const [filename, content] of Object.entries(files)) {
      const result = await uploadContent(content, filename);
      if (result.success && result.url) {
        uploadedFiles.push({ name: filename, url: result.url });
      }
    }

    if (uploadedFiles.length === 0) {
      return { success: false, error: 'No files uploaded' };
    }

    // Return primary URL (first uploaded file)
    return {
      success: true,
      url: uploadedFiles[0].url,
      fileId: folderName,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}