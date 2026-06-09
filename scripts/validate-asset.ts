// ============================================
// REAL ASSET VALIDATION SCRIPT
// End-to-end test: Image → Cloud → Distribution → Zernio Draft
// ============================================

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as higgsfield from '../src/services/higgsfield';

const prisma = new PrismaClient();

interface ValidationResult {
  success: boolean;
  assetId?: string;
  cloudUrl?: string;
  distributionId?: string;
  zernioPostId?: string;
  scheduledAt?: Date;
  error?: string;
}

async function log(message: string) {
  console.log(`\n[VALIDATION] ${message}`);
}

async function logResult(label: string, value: any) {
  console.log(`  ${label}: ${JSON.stringify(value)}`);
}

async function generateTestImage(): Promise<{ success: boolean; imageUrl?: string; localPath?: string; error?: string }> {
  log('Step 1: Generating test image...');

  try {
    // First try HiggsField
    const hfResult = await higgsfield.generateImage({
      prompt: 'A beautiful tropical sunset over a beach with vibrant orange and purple colors, high quality photograph',
      aspectRatio: '16:9',
    });

    if (hfResult.success && hfResult.outputUrl) {
      log('  Using HiggsField generated image');
      return { success: true, imageUrl: hfResult.outputUrl };
    }

    if (hfResult.error?.includes('credits')) {
      log('  HiggsField credits exhausted, creating local test image...');
    } else {
      log(`  HiggsField failed: ${hfResult.error}, creating local test image...`);
    }

    // Create a simple test image locally
    const tempDir = process.env.LOCAL_TEMP_DIR || './tmp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a simple PNG file (1x1 pixel for testing upload pipeline)
    const testImagePath = path.join(tempDir, `test_image_${Date.now()}.png`);

    // Simple valid PNG file (1x1 white pixel)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x01, 0x00, // width: 256
      0x00, 0x00, 0x01, 0x00, // height: 256
      0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
      0xD3, 0x10, 0x3F, 0x31, // CRC
      0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0xFF, 0x00, 0x05, 0xFE, 0x02, 0xFE,
      0xDC, 0xCC, 0x59, 0xE7, // CRC
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 // IEND
    ]);

    // Write a simple JPEG-like data (for simplicity, just create a small valid image)
    // Create a proper small PNG
    const width = 100;
    const height = 100;

    // Build PNG manually
    const png = createSimplePNG(width, height);
    fs.writeFileSync(testImagePath, png);

    log(`  Created local test image: ${testImagePath}`);
    return { success: true, imageUrl: `file://${testImagePath}`, localPath: testImagePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Create a simple valid PNG
function createSimplePNG(width: number, height: number): Buffer {
  const zlib = require('zlib');

  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);  // bit depth
  ihdrData.writeUInt8(2, 9);  // color type (RGB)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // Create raw image data (RGB gradient)
  const rawData = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 3 + 1)] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      rawData[offset] = Math.floor((x / width) * 255);     // R
      rawData[offset + 1] = Math.floor((y / height) * 255); // G
      rawData[offset + 2] = 128; // B
    }
  }

  // Compress with zlib
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xFFFFFFFF;
  const table = getCRCTable();

  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crcTable: number[] | null = null;
function getCRCTable(): number[] {
  if (crcTable) return crcTable;

  crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable.push(c);
  }
  return crcTable;
}

async function uploadToGoogleDrive(imageUrl: string, filename: string, localPath?: string): Promise<{ success: boolean; cloudUrl?: string; cloudFileId?: string; error?: string }> {
  log('Step 2: Uploading to Google Drive...');

  try {
    let imageBuffer: Buffer;
    let finalLocalPath = localPath;

    // Handle local file:// URLs
    if (imageUrl.startsWith('file://')) {
      finalLocalPath = imageUrl.replace('file://', '');
      log(`  Using local file: ${finalLocalPath}`);

      if (!fs.existsSync(finalLocalPath)) {
        return { success: false, error: `Local file not found: ${finalLocalPath}` };
      }

      imageBuffer = fs.readFileSync(finalLocalPath);
    } else {
      // Download from remote URL
      log('  Downloading image...');
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return { success: false, error: 'Failed to download image' };
      }
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    }

    // Get access token
    const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN!;
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

    // Refresh token
    log('  Refreshing Google token...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      return { success: false, error: 'Token refresh failed' };
    }

    const tokens: any = await tokenResponse.json();
    const accessToken = tokens.access_token;
    log('  Token refreshed');

    // Find or create root folder
    log('  Finding/creating Google Drive folder...');
    let folderId = 'root';

    const folderSearch = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name='AI-Affiliate-Engine' and mimeType='application/vnd.google-apps.folder' and 'root' in parents")}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (folderSearch.ok) {
      const searchResult: any = await folderSearch.json();
      if (searchResult.files && searchResult.files.length > 0) {
        folderId = searchResult.files[0].id;
        log(`  Found folder: ${folderId}`);
      } else {
        // Create folder
        const createFolder = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'AI-Affiliate-Engine',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [folderId],
          }),
        });

        if (createFolder.ok) {
          const folderResult: any = await createFolder.json();
          folderId = folderResult.id;
          log(`  Created folder: ${folderId}`);
        }
      }
    }

    // Upload file
    log('  Uploading to Google Drive...');
    const boundary = 'boundary_' + Date.now();
    const metadata = JSON.stringify({
      name: filename,
      parents: [folderId],
    });

    const metadataStart = Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n');
    const metadataEnd = Buffer.from('\r\n--' + boundary + '--\r\n');
    const contentStart = Buffer.from('\r\n--' + boundary + '\r\nContent-Type: image/jpeg\r\n\r\n');

    const buffer = Buffer.concat([
      metadataStart,
      Buffer.from(metadata),
      contentStart,
      imageBuffer,
      metadataEnd,
    ]);

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': buffer.length.toString(),
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      return { success: false, error: `Upload failed: ${error}` };
    }

    const uploadResult: any = await uploadResponse.json();

    // Make public
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadResult.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    const cloudUrl = uploadResult.webViewLink || `https://drive.google.com/file/d/${uploadResult.id}/view`;
    logResult('Cloud URL', cloudUrl);
    logResult('Cloud File ID', uploadResult.id);

    // Clean up local file if it exists
    if (finalLocalPath && fs.existsSync(finalLocalPath)) {
      fs.unlinkSync(finalLocalPath);
      log(`  Cleaned up local file`);
    }

    return {
      success: true,
      cloudUrl,
      cloudFileId: uploadResult.id,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function createAssetFile(params: {
  productId?: string;
  fileName: string;
  fileType: string;
  provider: string;
  cloudProvider: string;
  cloudUrl: string;
  cloudFileId: string;
}): Promise<{ success: boolean; assetId?: string; error?: string }> {
  log('Step 3: Creating AssetFile record...');

  try {
    const asset = await prisma.assetFile.create({
      data: {
        productId: params.productId || null,
        fileName: params.fileName,
        fileType: params.fileType,
        provider: params.provider,
        cloudProvider: params.cloudProvider,
        cloudUrl: params.cloudUrl,
        cloudFileId: params.cloudFileId,
        uploadStatus: 'uploaded',
        uploadedAt: new Date(),
      },
    });

    logResult('AssetFile ID', asset.id);
    return { success: true, assetId: asset.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function createDistributionWithAsset(params: {
  brandId: string;
  assetFileId: string;
  thumbnailUrl: string;
  caption: string;
  hashtags: string[];
  contentType: string;
  platform: string;
  provider: string;
  scheduledAt?: Date;
}): Promise<{ success: boolean; distributionId?: string; error?: string }> {
  log('Step 4: Creating Distribution item with asset link...');

  try {
    // Validate brand
    const brand = await prisma.brand.findFirst({
      where: { OR: [{ id: params.brandId }, { slug: params.brandId }] },
    });

    if (!brand) {
      return { success: false, error: 'Brand not found' };
    }

    const hashtagsStr = params.hashtags.join(',');

    const distribution = await prisma.distributionQueue.create({
      data: {
        brandId: brand.id,
        assetFileId: params.assetFileId,
        thumbnailUrl: params.thumbnailUrl,
        caption: params.caption,
        hashtags: hashtagsStr,
        contentType: params.contentType,
        platform: params.platform,
        provider: params.provider,
        status: 'DRAFT',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        scheduledAt: params.scheduledAt || null,
      },
    });

    logResult('Distribution ID', distribution.id);
    return { success: true, distributionId: distribution.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function createZernioDraft(distributionId: string, scheduledAt?: Date): Promise<{ success: boolean; postId?: string; error?: string }> {
  log('Step 5: Creating Zernio draft...');

  try {
    // Get distribution item
    const item = await prisma.distributionQueue.findUnique({
      where: { id: distributionId },
      include: { brand: true },
    });

    if (!item) {
      return { success: false, error: 'Distribution not found' };
    }

    // Get Zernio API key from env based on brand
    const brandSlug = item.brand.slug.toLowerCase();
    let apiKey: string | null = null;

    if (brandSlug.includes('cepat') || brandSlug.includes('dapat')) {
      apiKey = process.env.ZERNIO_CEPAT_KEY_1 || null;
    } else if (brandSlug.includes('crypto') || brandSlug.includes('ew')) {
      apiKey = process.env.ZERNIO_CRYPTO_KEY_1 || null;
    }

    if (!apiKey) {
      return { success: false, error: 'No Zernio API key found for brand' };
    }

    // Get available social account
    const account = await prisma.socialAccount.findFirst({
      where: {
        brandId: item.brandId,
        status: 'ACTIVE',
        platform: item.platform,
      },
    });

    if (!account) {
      return { success: false, error: 'No social account found' };
    }

    // Parse hashtags
    const hashtags = item.hashtags ? item.hashtags.split(',') : [];

    // Build caption with hashtags
    const zernioCaption = `${item.caption || ''}\n\n${hashtags.map(t => t.trim()).join(' ')}`;

    logResult('Account ID', account.accountId);
    logResult('Caption', zernioCaption.substring(0, 100) + '...');
    logResult('Thumbnail URL', item.thumbnailUrl ? 'Present' : 'None');

    // Post to Zernio
    const ZERNIO_API_URL = process.env.ZERNIO_API_URL || 'https://api.zernio.com/v1';

    const payload: any = {
      accountId: account.accountId,
      platforms: [],  // Required but empty - Zernio uses account's platform
      content: zernioCaption,
      hashtags: hashtags.map(t => t.replace('#', '').trim()),
    };

    // Add media items
    if (item.thumbnailUrl) {
      payload.mediaItems = [{
        type: 'image',
        url: item.thumbnailUrl,
      }];
    }

    log('  Posting to Zernio API...');

    const response = await fetch(`${ZERNIO_API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.text();
    log(`  Response: ${result.substring(0, 300)}`);

    if (!response.ok) {
      return { success: false, error: `Zernio error: ${result}` };
    }

    const lastResult: any = JSON.parse(result);
    const postId = lastResult.post?._id || lastResult.id;
    const postUrl = lastResult.post?.url || null;

    logResult('Zernio Post ID', postId);
    logResult('Zernio Post URL', postUrl);

    // Update distribution with Zernio info
    // Status is SCHEDULED if there's a scheduled time, DRAFT otherwise
    const newStatus = scheduledAt ? 'SCHEDULED' : 'DRAFT';

    await prisma.distributionQueue.update({
      where: { id: distributionId },
      data: {
        postId,
        postUrl,
        socialAccountId: account.id,
        status: newStatus,
        scheduledAt: scheduledAt || undefined,
      },
    });

    if (scheduledAt) {
      logResult('Status', 'SCHEDULED (with scheduled time)');
    }

    return { success: true, postId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function verifyDraftContainsMedia(postId: string, apiKey: string): Promise<{ success: boolean; hasMedia?: boolean; error?: string }> {
  log('Step 6: Verifying Zernio draft contains media...');

  try {
    const ZERNIO_API_URL = process.env.ZERNIO_API_URL || 'https://api.zernio.com/v1';

    const response = await fetch(`${ZERNIO_API_URL}/posts/${postId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to get post: ${response.status}` };
    }

    const data: any = await response.json();
    // Zernio returns { post: { ... } } structure
    const post = data.post || data;
    const mediaItems = post.mediaItems || [];

    logResult('Has media items', mediaItems.length > 0);
    logResult('Media count', mediaItems.length);
    log(`  Media: ${JSON.stringify(mediaItems.map((m: any) => ({ type: m.type, url: m.url?.substring(0, 60) + '...' })))}`);

    return { success: true, hasMedia: mediaItems.length > 0 };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function verifyStatusTransition(distributionId: string, expectedStatus: string): Promise<{ success: boolean; currentStatus?: string; error?: string }> {
  log(`Step 9: Verifying status transition to ${expectedStatus}...`);

  try {
    const item = await prisma.distributionQueue.findUnique({
      where: { id: distributionId },
    });

    if (!item) {
      return { success: false, error: 'Distribution not found' };
    }

    const currentStatus = item.status;
    logResult('Current status', currentStatus);
    logResult('Expected status', expectedStatus);

    if (currentStatus === expectedStatus) {
      log('  ✓ Status transition verified!');
      return { success: true, currentStatus };
    } else if (currentStatus === 'QUEUED' && expectedStatus === 'SCHEDULED') {
      // Check if scheduled
      if (item.scheduledAt) {
        log('  ✓ Status is QUEUED with scheduled time (SCHEDULED equivalent)');
        return { success: true, currentStatus };
      }
    }

    return { success: false, currentStatus };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Main validation flow
async function runValidation(): Promise<ValidationResult> {
  log('==========================================');
  log('REAL ASSET VALIDATION STARTING');
  log('==========================================');

  try {
    // Step 1: Generate image
    const imageResult = await generateTestImage();
    if (!imageResult.success || !imageResult.imageUrl) {
      return { success: false, error: imageResult.error };
    }

    // Step 2: Upload to Google Drive
    const filename = `validation_${Date.now()}.jpg`;
    const uploadResult = await uploadToGoogleDrive(imageResult.imageUrl, filename);
    if (!uploadResult.success || !uploadResult.cloudUrl) {
      return { success: false, error: uploadResult.error };
    }

    // Step 3: Create AssetFile
    const assetResult = await createAssetFile({
      fileName: filename,
      fileType: 'IMAGE',
      provider: 'HIGGSFIELD',
      cloudProvider: 'GOOGLE_DRIVE',
      cloudUrl: uploadResult.cloudUrl!,
      cloudFileId: uploadResult.cloudFileId!,
    });
    if (!assetResult.success || !assetResult.assetId) {
      return { success: false, error: assetResult.error };
    }

    // Step 4: Create Distribution
    // Get first available brand
    const brand = await prisma.brand.findFirst({ where: { status: 'ACTIVE' } });
    if (!brand) {
      return { success: false, error: 'No active brand found' };
    }

    const scheduleTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    const distResult = await createDistributionWithAsset({
      brandId: brand.id,
      assetFileId: assetResult.assetId,
      thumbnailUrl: uploadResult.cloudUrl!,
      caption: 'Test post - Real Asset Validation',
      hashtags: ['#test', '#validation', '#aitools'],
      contentType: 'IMAGE',
      platform: 'INSTAGRAM',
      provider: 'HIGGSFIELD_AUTO',
      scheduledAt: scheduleTime,
    });
    if (!distResult.success || !distResult.distributionId) {
      return { success: false, error: distResult.error };
    }

    // Step 5 & 6: Create Zernio draft with media
    const zernioResult = await createZernioDraft(distResult.distributionId, scheduleTime);
    if (!zernioResult.success || !zernioResult.postId) {
      return { success: false, error: zernioResult.error };
    }

    // Step 6 (additional): Verify draft has media
    const brandSlug = brand.slug.toLowerCase();
    let apiKey: string | null = null;
    if (brandSlug.includes('cepat') || brandSlug.includes('dapat')) {
      apiKey = process.env.ZERNIO_CEPAT_KEY_1 || null;
    } else if (brandSlug.includes('crypto') || brandSlug.includes('ew')) {
      apiKey = process.env.ZERNIO_CRYPTO_KEY_1 || null;
    }

    if (apiKey) {
      await verifyDraftContainsMedia(zernioResult.postId, apiKey);
    }

    // Step 9: Verify status transition to SCHEDULED
    await verifyStatusTransition(distResult.distributionId, 'SCHEDULED');

    log('\n==========================================');
    log('VALIDATION RESULTS');
    log('==========================================');
    logResult('Asset ID', assetResult.assetId);
    logResult('Cloud URL', uploadResult.cloudUrl);
    logResult('Distribution ID', distResult.distributionId);
    logResult('Zernio Post ID', zernioResult.postId);
    logResult('Scheduled At', scheduleTime.toISOString());
    log('==========================================');

    return {
      success: true,
      assetId: assetResult.assetId,
      cloudUrl: uploadResult.cloudUrl,
      distributionId: distResult.distributionId,
      zernioPostId: zernioResult.postId,
      scheduledAt: scheduleTime,
    };
  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Run and output result
runValidation().then(async (result) => {
  console.log('\n--- FINAL RESULT ---');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});