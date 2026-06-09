// ============================================
// GOOGLE DRIVE TEST SCRIPT
// Tests the complete upload flow and verifies connection
// ============================================

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as cloudStorage from '../src/services/cloud-storage';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

// Colors for console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(msg: string, color = 'reset') {
  console.log(`${colors[color as keyof typeof colors]}${msg}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function testGoogleDriveConnection() {
  logSection('TEST 1: Google Drive Connection');

  const status = await cloudStorage.testGoogleDriveConnection();

  log(`\nConnection Status: ${status.connected ? '✅ Connected' : '❌ Not Connected'}`, status.connected ? 'green' : 'red');
  log(`Message: ${status.message}`, 'cyan');

  if (status.folderId) {
    log(`Root Folder ID: ${status.folderId}`, 'blue');
  }

  return status.connected;
}

async function testCreateBrandFolders() {
  logSection('TEST 2: Brand Folder Structure');

  const brands = ['CepatDapat', 'Crypto-EW', 'Pippit-Manual'];
  const results: { name: string; success: boolean; folderId?: string }[] = [];

  for (const brandName of brands) {
    log(`\nCreating/finding folder: ${brandName}...`, 'yellow');

    const result = await cloudStorage.createGoogleDriveFolder(brandName);

    if (result.success) {
      log(`  ✅ Folder created/found: ${result.folderId}`, 'green');
      results.push({ name: brandName, success: true, folderId: result.folderId });
    } else {
      log(`  ❌ Failed: ${result.error}`, 'red');
      results.push({ name: brandName, success: false });
    }
  }

  return results;
}

async function testUploadFile() {
  logSection('TEST 3: File Upload to Google Drive');

  const tempDir = process.env.LOCAL_TEMP_DIR || './tmp';

  // Ensure temp dir exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create test file
  const testContent = `AI Affiliate Engine - Test Upload
========================================
Generated: ${new Date().toISOString()}
Purpose: Verify Google Drive integration
Brand: CepatDapat (test)

This file confirms that uploads to Google Drive are working correctly.
`;

  const testFileName = `test_google_drive_${Date.now()}.txt`;
  const testFilePath = path.join(tempDir, testFileName);

  log(`\nCreating test file: ${testFileName}`, 'yellow');
  fs.writeFileSync(testFilePath, testContent);

  const fileSize = fs.statSync(testFilePath).size;
  log(`File size: ${formatBytes(fileSize)}`, 'blue');

  // Upload
  log('\nUploading to Google Drive...', 'yellow');
  const uploadResult = await cloudStorage.uploadFile(testFilePath, testFileName, {
    provider: 'GOOGLE_DRIVE',
    fileType: 'TEST',
  });

  // Clean up temp file (already deleted by uploadFile if successful)
  try {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  } catch {}

  if (uploadResult.success) {
    log('\n✅ Upload successful!', 'green');
    log(`Cloud URL: ${uploadResult.cloudUrl}`, 'cyan');
    log(`File ID: ${uploadResult.cloudFileId}`, 'blue');
    log(`Asset ID: ${uploadResult.assetFileId}`, 'blue');
    return uploadResult;
  } else {
    log(`\n❌ Upload failed: ${uploadResult.error}`, 'red');
    return null;
  }
}

async function testCreateAssetFile() {
  logSection('TEST 4: AssetFile Creation in Database');

  // Create a test asset file directly
  const testAsset = await prisma.assetFile.create({
    data: {
      fileName: `manual_test_${Date.now()}.txt`,
      fileType: 'TEST',
      provider: 'MANUAL_TEST',
      cloudProvider: 'GOOGLE_DRIVE',
      cloudUrl: 'https://drive.google.com/test/manual',
      cloudFileId: 'manual_test_' + Date.now(),
      uploadStatus: 'uploaded',
      uploadedAt: new Date(),
    },
  });

  log(`\n✅ AssetFile created!`, 'green');
  log(`ID: ${testAsset.id}`, 'blue');
  log(`FileName: ${testAsset.fileName}`, 'cyan');
  log(`CloudProvider: ${testAsset.cloudProvider}`, 'cyan');
  log(`CloudUrl: ${testAsset.cloudUrl}`, 'cyan');

  return testAsset;
}

async function testStorageStats() {
  logSection('TEST 5: Storage Statistics');

  const stats = await cloudStorage.getStorageStats();

  log('\n📊 Storage Summary:', 'blue');
  log(`   Total Files: ${stats.summary.totalFiles}`, 'reset');
  log(`   Total Size: ${formatBytes(Number(stats.summary.totalSize))}`, 'reset');

  log('\n📁 By Provider:', 'blue');
  log(`   Google Drive: ${stats.googleDrive.count} files, ${formatBytes(Number(stats.googleDrive.size))}`, 'green');
  log(`   Dropbox: ${stats.dropbox.count} files, ${formatBytes(Number(stats.dropbox.size))}`, 'purple');
  log(`   Local: ${stats.local.count} files, ${formatBytes(Number(stats.local.size))}`, 'yellow');

  return stats;
}

async function cleanupTestAssets() {
  logSection('CLEANUP: Removing Test Assets');

  // Delete test assets
  const deleted = await prisma.assetFile.deleteMany({
    where: {
      OR: [
        { fileName: { startsWith: 'test_google_drive_' } },
        { fileName: { startsWith: 'manual_test_' } },
      ],
    },
  });

  log(`\n🗑️ Deleted ${deleted.count} test AssetFiles from database`, 'yellow');
}

async function main() {
  logSection('GOOGLE DRIVE INTEGRATION TEST');

  console.log('Testing Google Drive upload flow...');
  console.log(`Started at: ${new Date().toISOString()}`);

  let allPassed = true;

  try {
    // Test 1: Connection
    const connected = await testGoogleDriveConnection();
    if (!connected) {
      log('\n❌ Google Drive not connected. Add credentials to .env and run setup first.', 'red');
      log('\nRun: npm run setup:google-drive', 'yellow');
      process.exit(1);
    }

    // Test 2: Brand folders
    logSection('TEST 2: Brand Folder Structure');
    const folders = await testCreateBrandFolders();
    const allFoldersCreated = folders.every(f => f.success);
    if (!allFoldersCreated) {
      log('\n⚠️ Some folders failed to create', 'yellow');
    }

    // Test 3: Upload file
    const uploadResult = await testUploadFile();
    if (!uploadResult) {
      log('\n❌ Upload test failed', 'red');
      allPassed = false;
    }

    // Test 4: AssetFile creation
    const asset = await testCreateAssetFile();

    // Test 5: Storage stats
    await testStorageStats();

    // Cleanup
    await cleanupTestAssets();

    // Final summary
    logSection('TEST SUMMARY');

    if (allPassed && uploadResult) {
      log('\n✅ ALL TESTS PASSED!', 'green');
      log('\n📋 Results:', 'blue');
      log(`   • Google Drive connected: ✅`, 'reset');
      log(`   • Brand folders created: ${folders.filter(f => f.success).length}/${folders.length}`, 'reset');
      log(`   • File uploaded: ✅`, 'reset');
      log(`   • AssetFile created: ✅ (ID: ${asset.id})`, 'reset');
      log(`   • Storage stats working: ✅`, 'reset');

      log('\n🎯 Success Criteria Met:', 'cyan');
      log(`   AssetFile → Google Drive URL: ${uploadResult.cloudUrl}`, 'green');

      log('\n📝 Next Steps:', 'yellow');
      log('   1. Assets will now upload to Google Drive automatically', 'reset');
      log('   2. Run /storage in Telegram to see status', 'reset');
      log('   3. Check /assets page for asset library', 'reset');

    } else {
      log('\n❌ Some tests failed', 'red');
      process.exit(1);
    }

  } catch (error: any) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  logSection('TEST COMPLETE');
  console.log(`Finished at: ${new Date().toISOString()}`);
}

main();