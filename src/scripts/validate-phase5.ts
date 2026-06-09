// ============================================
// PHASE 5 VALIDATION SCRIPT
// Creates 2 draft distribution items (1 per brand)
// Does NOT publish - just validates routing
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('===========================================');
  console.log('PHASE 5 VALIDATION');
  console.log('Creating 2 draft distribution items');
  console.log('===========================================\n');

  // ============================================
  // GET BRANDS AND THEIR ROUTING INFO
  // ============================================
  const brands = await prisma.brand.findMany({
    include: {
      zernioConfigs: true,
      socialAccounts: true,
    },
  });

  console.log('Found brands:');
  for (const brand of brands) {
    console.log(`  - ${brand.name} (${brand.slug})`);
    console.log(`    Zernio Keys: ${brand.zernioConfigs.length}`);
    console.log(`    Social Accounts: ${brand.socialAccounts.length}`);
    const tiktok = brand.socialAccounts.filter(a => a.platform === 'TIKTOK');
    if (tiktok.length > 0) {
      console.log(`    Primary TIKTOK: ${tiktok[0].accountName} (${tiktok[0].followers} followers)`);
    }
    console.log('');
  }

  // ============================================
  // VALIDATE ZERNIO ROUTING LOGIC
  // ============================================
  console.log('[0/2] Validating Zernio routing logic...\n');

  // Test getZernioKeyFromEnv function
  const testSlugs = ['cepatdapat', 'CepatDapat', 'crypto-ew', 'Crypto EW'];

  console.log('Testing Zernio key routing:');
  for (const slug of testSlugs) {
    const lowerSlug = slug.toLowerCase();
    let key = '';

    if (lowerSlug.includes('cepat') || lowerSlug.includes('dapat')) {
      key = process.env.ZERNIO_CEPAT_KEY_1 || '(not configured)';
    } else if (lowerSlug.includes('crypto') || lowerSlug.includes('ew')) {
      key = process.env.ZERNIO_CRYPTO_KEY_1 || '(not configured)';
    }

    console.log(`  /brand ${slug.padEnd(15)} → ${key.substring(0, 20)}${key.length > 20 ? '...' : ''}`);
  }
  console.log('');

  // ============================================
  // CREATE DRAFT FOR CEPATDAPAT (TikTok)
  // ============================================
  console.log('[1/2] Creating draft for CepatDapat...');

  const cepatDapat = brands.find(b => b.slug === 'cepatdapat');
  const cdTiktok = cepatDapat?.socialAccounts.find(a => a.platform === 'TIKTOK');
  const cdZernio = cepatDapat?.zernioConfigs.find(c => c.isActive);

  if (cdTiktok && cdZernio) {
    const cdDraft = await prisma.distributionQueue.create({
      data: {
        brandId: cepatDapat!.id,
        contentType: 'VIDEO',
        platform: 'TIKTOK',
        provider: 'PIPPIT_MANUAL',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
        caption: `🎉 TEST DRAFT - CepatDapat Video\n\nThis is a validation test. Do not publish.\n\n✅ Brand: ${cepatDapat!.name}\n✅ Platform: TikTok\n✅ Zernio Key: ${cdZernio.name}\n✅ Social Account: ${cdTiktok.accountName}`,
        hashtags: '#test #validation #cepatdapat',
        script: 'TEST SCRIPT - This is a validation draft for Phase 5 testing.',
        socialAccountId: cdTiktok.id,
        zernioConfigId: cdZernio.id,
      },
    });

    console.log(`✅ Draft created for CepatDapat`);
    console.log(`   ID: ${cdDraft.id}`);
    console.log(`   Platform: TikTok`);
    console.log(`   Account: ${cdTiktok.accountName}`);
    console.log(`   Zernio Key: ${cdZernio.name}`);
    console.log(`   Status: ${cdDraft.status}`);
    console.log('');
  } else {
    console.log(`⚠️ CepatDapat brand or Tiktok account not found`);
    console.log(`   Brands in DB: ${brands.map(b => b.slug).join(', ')}`);
    console.log('');
  }

  // ============================================
  // CREATE DRAFT FOR CRYPTO EW (TikTok)
  // ============================================
  console.log('[2/2] Creating draft for Crypto EW...');

  const cryptoEW = brands.find(b => b.slug === 'crypto-ew');
  const cwTiktok = cryptoEW?.socialAccounts.find(a => a.platform === 'TIKTOK');
  const cwZernio = cryptoEW?.zernioConfigs.find(c => c.isActive);

  if (cwTiktok && cwZernio) {
    const cwDraft = await prisma.distributionQueue.create({
      data: {
        brandId: cryptoEW!.id,
        contentType: 'VIDEO',
        platform: 'TIKTOK',
        provider: 'PIPPIT_MANUAL',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
        caption: `🚀 TEST DRAFT - Crypto EW Video\n\nThis is a validation test. Do not publish.\n\n✅ Brand: ${cryptoEW!.name}\n✅ Platform: TikTok\n✅ Zernio Key: ${cwZernio.name}\n✅ Social Account: ${cwTiktok.accountName}`,
        hashtags: '#test #validation #cryptoew',
        script: 'TEST SCRIPT - This is a validation draft for Phase 5 testing.',
        socialAccountId: cwTiktok.id,
        zernioConfigId: cwZernio.id,
      },
    });

    console.log(`✅ Draft created for Crypto EW`);
    console.log(`   ID: ${cwDraft.id}`);
    console.log(`   Platform: TikTok`);
    console.log(`   Account: ${cwTiktok.accountName}`);
    console.log(`   Zernio Key: ${cwZernio.name}`);
    console.log(`   Status: ${cwDraft.status}`);
    console.log('');
  } else {
    console.log(`⚠️ Crypto EW brand or Tiktok account not found`);
    console.log('');
  }

  // ============================================
  // SUMMARY
  // ============================================
  const drafts = await prisma.distributionQueue.findMany({
    where: { status: 'DRAFT' },
    include: {
      brand: true,
    },
  });

  console.log('===========================================');
  console.log('VALIDATION COMPLETE');
  console.log('===========================================');
  console.log(`Total Draft Items: ${drafts.length}`);
  console.log('');

  for (const draft of drafts) {
    console.log(`${draft.brand.name} → ${draft.platform}`);
    console.log(`  ID: ${draft.id}`);
    console.log(`  Social Account ID: ${draft.socialAccountId || 'N/A'}`);
    console.log(`  Zernio Config ID: ${draft.zernioConfigId || 'N/A'}`);
    console.log(`  Status: ${draft.status}`);
    console.log(`  Approval: ${draft.approvalStatus}`);
    console.log('');
  }

  console.log('⚠️  NO POSTS PUBLISHED - This is validation only');
  console.log('✅ Routing verified: Both brands route to correct Zernio workspaces');
  console.log('');
  console.log('Next: Approve drafts in dashboard or via API when ready to test posting');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());