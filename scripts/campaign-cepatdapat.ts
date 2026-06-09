// ============================================
// CEPATDAPAT FIRST CAMPAIGN
// Create 5 image posts across platforms
// ============================================

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as cloudStorage from '../src/services/cloud-storage';

const prisma = new PrismaClient();

interface CampaignPost {
  productName: string;
  productId: string;
  affiliateLink: string;
  platform: string;
  contentType: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
}

// Simple PNG generator
function createSimplePNG(width: number, height: number, r: number, g: number, b: number): Buffer {
  const zlib = require('zlib');
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = createChunk('IHDR', ihdrData);
  const rawData = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      rawData[offset] = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
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

let crcTable: number[] | null = null;
function crc32(buffer: Buffer): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable.push(c);
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function log(message: string) {
  console.log(`[CAMPAIGN] ${message}`);
}

async function run() {
  log('==========================================');
  log('CEPATDAPAT FIRST CAMPAIGN - STARTING');
  log('5 Image Posts Across Platforms');
  log('==========================================');

  const results = [];

  // Get brand
  const brand = await prisma.brand.findFirst({ where: { slug: 'cepatdapatt' } });
  if (!brand) {
    console.log('ERROR: Brand cepatdapatt not found');
    process.exit(1);
  }
  log(`Brand: ${brand.name} (${brand.id})`);

  // Get products
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE', affiliateLink: { startsWith: 'http' } },
    take: 5,
    orderBy: { createdAt: 'desc' }
  });

  if (products.length < 5) {
    console.log('ERROR: Not enough products with affiliate links');
    process.exit(1);
  }
  log(`Found ${products.length} products with affiliate links`);

  // Campaign posts data
  const postsData = [
    {
      productIdx: 0,
      platform: 'TIKTOK',
      caption: `Smart Watch Pro X9 - Fitur Lengkap Harga Murah!\n\nJam tangan pintar dengan desain premium, layar AMOLED!\n\n✅ Monitor detak jantung 24/7\n✅ Tahan air IP68\n✅ Baterai tahan 7 hari\n✅ Notifikasi smartphone\n✅ Mode olahraga 15 jenis\n\nHarga: Rp 899.000\nKlik link di bio untuk order!`,
      hashtags: ['#SmartWatch', '#JamTanganPintar', '#GadgetMurah', '#CepatDapatPromo'],
      rgb: [255, 107, 107]
    },
    {
      productIdx: 1,
      platform: 'INSTAGRAM',
      caption: `Portable Blender Mini - Smoothie di Mana Saja!\n\nBlender portable kecil tapi powerful!\n\n✨ Kapasitas 380ml\n✨ 6 pisau stainless steel\n✨ USB charging\n✨ Mudah dibersihkan\n✨ Berat hanya 350g\n\nHarga: Rp 189.000\nDapur lebih sehat dimulai hari ini!`,
      hashtags: ['#PortableBlender', '#Smoothie', '#DapurSehat', '#CepatDapatPromo'],
      rgb: [78, 205, 196]
    },
    {
      productIdx: 2,
      platform: 'TIKTOK',
      caption: `LED Ring Light 10 inch - Foto Video Profesional!\n\nRing light untuk konten kreator, selfie, dan video call!\n\n✅ 3 warna cahaya\n✅ 10 level kecerahan\n✅ Tripod stand 180cm\n✅ Remote control\n\nHarga: Rp 249.000\nKlik sekarang!`,
      hashtags: ['#RingLight', '#ContentCreator', '#TikTokIndonesia', '#CepatDapatPromo'],
      rgb: [255, 230, 109]
    },
    {
      productIdx: 3,
      platform: 'INSTAGRAM',
      caption: `Wireless Earbuds Elite - Bass Jernih!\n\nEarbuds wireless dengan suara jernih dan bass powerful!\n\n✅ Bluetooth 5.3\n✅ Active Noise Cancelling\n✅ 30 jam total playback\n✅ IPX5 waterproof\n✅ USB-C fast charge\n\nHarga: Rp 599.000\nLink di bio untuk order!`,
      hashtags: ['#WirelessEarbuds', '#HeadphoneMurah', '#Bluetooth', '#CepatDapatPromo'],
      rgb: [149, 225, 211]
    },
    {
      productIdx: 4,
      platform: 'FACEBOOK',
      caption: `Anti Gores Tempered Glass Premium!\n\nLindungi layar smartphone kesayangan!\n\n✅ Hardness 9H\n✅ Ultra clear\n✅ Oleophobic coating\n✅ Easy install bubble-free\n✅ Sensitif touchscreen\n\nHarga: Rp 49.000\nKlik link di bio untuk order sekarang!`,
      hashtags: ['#TemperedGlass', '#LayarAman', '#Smartphone', '#CepatDapatPromo'],
      rgb: [243, 129, 129]
    }
  ];

  for (let i = 0; i < postsData.length; i++) {
    const postData = postsData[i];
    const product = products[postData.productIdx];
    const postNum = i + 1;

    log(`\n--- POST ${postNum}/5 ---`);
    log(`Product: ${product.name}`);
    log(`Platform: ${postData.platform}`);

    try {
      // 1. Create image
      log('Step 1: Creating image...');
      const tempDir = process.env.LOCAL_TEMP_DIR || './tmp';
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const imagePath = path.join(tempDir, `campaign_${postNum}_${Date.now()}.png`);
      const [r, g, b] = postData.rgb;
      const imageBuffer = createSimplePNG(800, 800, r, g, b);
      fs.writeFileSync(imagePath, imageBuffer);
      log(`  Image created: ${imagePath}`);

      // 2. Upload to Google Drive
      log('Step 2: Uploading to Google Drive...');
      const uploadResult = await cloudStorage.uploadFile(imagePath, `campaign_post_${postNum}.png`, {
        provider: 'GOOGLE_DRIVE', // Explicitly use Google Drive
        productId: product.id,
        fileType: 'IMAGE',
        fileName: `campaign_${product.name.replace(/\s+/g, '_')}.png`,
      });

      if (!uploadResult.success || !uploadResult.cloudUrl) {
        log(`  ERROR: Upload failed - ${uploadResult.error}`);
        continue;
      }
      log(`  Uploaded: ${uploadResult.cloudUrl}`);

      // 3. Create AssetFile
      log('Step 3: Creating AssetFile...');
      const asset = await prisma.assetFile.create({
        data: {
          productId: product.id,
          fileName: `campaign_${product.name.replace(/\s+/g, '_')}.png`,
          fileType: 'IMAGE',
          provider: 'LOCAL',
          cloudProvider: 'GOOGLE_DRIVE',
          cloudUrl: uploadResult.cloudUrl,
          cloudFileId: uploadResult.cloudFileId,
          uploadStatus: 'uploaded',
          uploadedAt: new Date(),
        }
      });
      log(`  Asset ID: ${asset.id}`);

      // 4. Create Distribution item
      log('Step 4: Creating Distribution...');
      const scheduleTime = new Date(Date.now() + (i + 1) * 15 * 60 * 1000);

      const dist = await prisma.distributionQueue.create({
        data: {
          brandId: brand.id,
          assetFileId: asset.id,
          productId: product.id,
          thumbnailUrl: uploadResult.cloudUrl,
          caption: postData.caption,
          hashtags: postData.hashtags.join(','),
          contentType: 'IMAGE',
          platform: postData.platform,
          provider: 'HIGGSFIELD_AUTO',
          status: 'ZERNIO_DRAFT_CREATED',
          approvalStatus: 'APPROVED',
          approvedAt: new Date(),
          scheduledAt: scheduleTime,
          affiliateLink: product.affiliateLink,
        }
      });
      log(`  Distribution ID: ${dist.id}`);

      // 5. Create Zernio draft
      log('Step 5: Creating Zernio draft...');
      const account = await prisma.socialAccount.findFirst({
        where: { brandId: brand.id, platform: postData.platform, status: 'ACTIVE' }
      });

      if (!account) {
        log(`  ERROR: No ${postData.platform} account found`);
        continue;
      }

      const apiKey = process.env.ZERNIO_CEPAT_KEY_1;

      const payload = {
        accountId: account.accountId,
        platforms: [],
        content: postData.caption,
        hashtags: postData.hashtags.map(t => t.replace('#', '')),
        mediaItems: [{ type: 'image', url: uploadResult.cloudUrl }],
      };

      const zernioResponse = await fetch('https://api.zernio.com/v1/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const zernioResult: any = await zernioResponse.json();

      if (!zernioResponse.ok) {
        log(`  ERROR: Zernio failed - ${JSON.stringify(zernioResult)}`);
        continue;
      }

      const zernioPostId = zernioResult.post?._id;
      log(`  Zernio Post ID: ${zernioPostId}`);

      // Update distribution with Zernio info
      await prisma.distributionQueue.update({
        where: { id: dist.id },
        data: {
          postId: zernioPostId,
          status: 'ZERNIO_DRAFT_CREATED',
        }
      });

      results.push({
        postNum,
        product: product.name,
        platform: postData.platform,
        assetId: asset.id,
        distributionId: dist.id,
        zernioPostId,
        cloudUrl: uploadResult.cloudUrl,
        scheduledAt: scheduleTime.toISOString(),
      });

      log(`  POST ${postNum} COMPLETE`);

    } catch (error: any) {
      log(`  ERROR: ${error.message}`);
    }
  }

  // Summary
  log('\n==========================================');
  log('CAMPAIGN SUMMARY');
  log('==========================================');
  log(`Total posts created: ${results.length}/5`);
  log('');

  for (const r of results) {
    log(`Post ${r.postNum}: ${r.product}`);
    log(`  Platform: ${r.platform}`);
    log(`  Asset ID: ${r.assetId}`);
    log(`  Distribution: ${r.distributionId}`);
    log(`  Zernio: ${r.zernioPostId}`);
    log(`  Scheduled: ${r.scheduledAt}`);
    log('');
  }

  log('==========================================');
  log('NEXT STEPS:');
  log('1. Check Zernio dashboard to publish/schedule');
  log('2. Use /zerniostatus [postId] to monitor');
  log('3. Revenue only counted when POSTED_CONFIRMED');
  log('==========================================');

  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });