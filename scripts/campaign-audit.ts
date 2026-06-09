// Campaign Readiness Audit Script
// Checks all Phase 5 components

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface AuditResult {
  category: string;
  items: AuditItem[];
  status: 'PASS' | 'FAIL' | 'WARN';
}

interface AuditItem {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  value?: string;
  message: string;
}

async function audit() {
  const results: AuditResult[] = [];

  console.log('===========================================');
  console.log('CAMPAIGN READINESS AUDIT');
  console.log('===========================================\n');

  // ============================================
  // 1. BRANDS & CONFIG
  // ============================================
  console.log('[1/8] Checking Brands...');
  const brandsResult: AuditResult = { category: 'Brands', items: [], status: 'PASS' };

  const brands = await prisma.brand.findMany({
    include: {
      zernioConfigs: true,
      socialAccounts: true
    }
  });

  brandsResult.items.push({
    name: 'Brands exist',
    status: brands.length > 0 ? 'PASS' : 'FAIL',
    value: brands.length.toString(),
    message: brands.length > 0 ? `${brands.length} brands found` : 'No brands in database'
  });

  for (const brand of brands) {
    const zernioActive = brand.zernioConfigs.filter(z => z.isActive).length;
    const accountsActive = brand.socialAccounts.filter(a => a.status === 'ACTIVE').length;

    brandsResult.items.push({
      name: `${brand.name} setup`,
      status: zernioActive > 0 && accountsActive > 0 ? 'PASS' : 'WARN',
      value: `${zernioActive} keys, ${accountsActive} accounts`,
      message: `${brand.name}: ${zernioActive} Zernio keys, ${accountsActive} social accounts`
    });

    // Check placeholder API keys
    const placeholderKeys = brand.zernioConfigs.filter(z => z.apiKey.includes('PLACEHOLDER') || z.apiKey.includes('ZERNIO_KEY_'));
    if (placeholderKeys.length > 0) {
      brandsResult.items.push({
        name: `${brand.name} API keys`,
        status: 'WARN',
        value: `${placeholderKeys.length} placeholder keys`,
        message: `${placeholderKeys.length} Zernio API keys need real credentials`
      });
    }
  }

  if (brandsResult.items.some(i => i.status === 'FAIL')) brandsResult.status = 'FAIL';
  else if (brandsResult.items.some(i => i.status === 'WARN')) brandsResult.status = 'WARN';
  results.push(brandsResult);

  // ============================================
  // 2. SOCIAL ACCOUNTS
  // ============================================
  console.log('[2/8] Checking Social Accounts...');
  const accountsResult: AuditResult = { category: 'Social Accounts', items: [], status: 'PASS' };

  const accounts = await prisma.socialAccount.findMany({
    where: { status: 'ACTIVE' }
  });

  const platformCounts: Record<string, number> = {};
  for (const acc of accounts) {
    platformCounts[acc.platform] = (platformCounts[acc.platform] || 0) + 1;
  }

  accountsResult.items.push({
    name: 'Active accounts',
    status: accounts.length > 0 ? 'PASS' : 'FAIL',
    value: accounts.length.toString(),
    message: `${accounts.length} active social accounts`
  });

  for (const [platform, count] of Object.entries(platformCounts)) {
    accountsResult.items.push({
      name: `${platform} accounts`,
      status: 'PASS',
      value: count.toString(),
      message: `${count} ${platform} accounts`
    });
  }
  results.push(accountsResult);

  // ============================================
  // 3. ZERNIO CONFIGS
  // ============================================
  console.log('[3/8] Checking Zernio API Keys...');
  const zernioResult: AuditResult = { category: 'Zernio API Keys', items: [], status: 'PASS' };

  const zernioConfigs = await prisma.zernioConfig.findMany();
  const activeKeys = zernioConfigs.filter(z => z.isActive);
  const realKeys = activeKeys.filter(z => !z.apiKey.includes('ZERNIO_KEY_') && !z.apiKey.includes('PLACEHOLDER'));

  zernioResult.items.push({
    name: 'Total configured keys',
    status: 'PASS',
    value: activeKeys.length.toString(),
    message: `${activeKeys.length} active Zernio keys`
  });

  zernioResult.items.push({
    name: 'Real API keys',
    status: realKeys.length > 0 ? 'PASS' : 'WARN',
    value: realKeys.length.toString(),
    message: realKeys.length > 0 ? `${realKeys.length} real keys` : 'No real Zernio API keys - need credentials'
  });
  zernioResult.status = realKeys.length > 0 ? 'PASS' : 'WARN';

  results.push(zernioResult);

  // ============================================
  // 4. TELEGRAM SESSION
  // ============================================
  console.log('[4/8] Checking Telegram Sessions...');
  const telegramResult: AuditResult = { category: 'Telegram', items: [], status: 'PASS' };

  const sessions = await prisma.telegramSession.findMany();
  const sessionsWithBrand = sessions.filter(s => s.activeBrandId);

  telegramResult.items.push({
    name: 'Total sessions',
    status: 'PASS',
    value: sessions.length.toString(),
    message: `${sessions.length} Telegram sessions`
  });

  telegramResult.items.push({
    name: 'Sessions with brand',
    status: 'PASS',
    value: sessionsWithBrand.length.toString(),
    message: `${sessionsWithBrand.length} users with active brand selected`
  });
  results.push(telegramResult);

  // ============================================
  // 5. PRODUCTS & CONTENT
  // ============================================
  console.log('[5/8] Checking Products & Content...');
  const productsResult: AuditResult = { category: 'Products', items: [], status: 'PASS' };

  const products = await prisma.product.findMany({ where: { status: 'ACTIVE' } });
  const contents = await prisma.content.findMany();
  const approved = contents.filter(c => c.approvalStatus === 'APPROVED');
  const pending = contents.filter(c => c.approvalStatus === 'PENDING');

  productsResult.items.push({
    name: 'Active products',
    status: 'PASS',
    value: products.length.toString(),
    message: `${products.length} products`
  });
  productsResult.items.push({
    name: 'Content generated',
    status: contents.length > 0 ? 'PASS' : 'WARN',
    value: contents.length.toString(),
    message: `${contents.length} content items`
  });
  productsResult.items.push({
    name: 'Pending approval',
    status: 'PASS',
    value: pending.length.toString(),
    message: `${pending.length} awaiting approval`
  });
  productsResult.items.push({
    name: 'Approved',
    status: approved.length > 0 ? 'PASS' : 'WARN',
    value: approved.length.toString(),
    message: `${approved.length} approved content`
  });
  results.push(productsResult);

  // ============================================
  // 6. DISTRIBUTION QUEUE
  // ============================================
  console.log('[6/8] Checking Distribution Queue...');
  const distResult: AuditResult = { category: 'Distribution', items: [], status: 'PASS' };

  const distributions = await prisma.distributionQueue.findMany();
  const draftDist = distributions.filter(d => d.status === 'DRAFT');
  const queuedDist = distributions.filter(d => d.status === 'QUEUED');
  const postedDist = distributions.filter(d => d.status === 'POSTED');

  distResult.items.push({
    name: 'Total distributions',
    status: 'PASS',
    value: distributions.length.toString(),
    message: `${distributions.length} distribution items`
  });
  distResult.items.push({
    name: 'Draft',
    status: 'PASS',
    value: draftDist.length.toString(),
    message: `${draftDist.length} drafts`
  });
  distResult.items.push({
    name: 'Queued',
    status: queuedDist.length > 0 ? 'PASS' : 'WARN',
    value: queuedDist.length.toString(),
    message: queuedDist.length > 0 ? `${queuedDist.length} queued` : 'No items queued for posting'
  });
  distResult.items.push({
    name: 'Posted',
    status: postedDist.length > 0 ? 'PASS' : 'WARN',
    value: postedDist.length.toString(),
    message: postedDist.length > 0 ? `${postedDist.length} posted` : 'No content posted yet'
  });
  results.push(distResult);

  // ============================================
  // 7. REVENUE TRACKING
  // ============================================
  console.log('[7/8] Checking Revenue Tracking...');
  const revenueResult: AuditResult = { category: 'Revenue', items: [], status: 'PASS' };

  const events = await prisma.revenueEvent.findMany();
  const sales = events.filter(e => e.eventType === 'SALE');
  const clicks = events.filter(e => e.eventType === 'CLICK');

  revenueResult.items.push({
    name: 'Revenue events',
    status: events.length > 0 ? 'PASS' : 'PASS',
    value: events.length.toString(),
    message: `${events.length} revenue events tracked`
  });
  revenueResult.items.push({
    name: 'Click events',
    status: 'PASS',
    value: clicks.length.toString(),
    message: `${clicks.length} clicks recorded`
  });
  revenueResult.items.push({
    name: 'Sale events',
    status: sales.length > 0 ? 'PASS' : 'WARN',
    value: sales.length.toString(),
    message: sales.length > 0 ? `${sales.length} sales` : 'No sales recorded yet'
  });
  results.push(revenueResult);

  // ============================================
  // 8. ASSET FILES & STORAGE
  // ============================================
  console.log('[8/8] Checking Asset Storage...');
  const storageResult: AuditResult = { category: 'Storage', items: [], status: 'PASS' };

  const assets = await prisma.assetFile.findMany();
  const uploadedAssets = assets.filter(a => a.uploadStatus === 'uploaded');

  storageResult.items.push({
    name: 'Total assets',
    status: assets.length > 0 ? 'PASS' : 'WARN',
    value: assets.length.toString(),
    message: `${assets.length} assets tracked`
  });
  storageResult.items.push({
    name: 'Uploaded',
    status: uploadedAssets.length > 0 ? 'PASS' : 'WARN',
    value: uploadedAssets.length.toString(),
    message: uploadedAssets.length > 0 ? `${uploadedAssets.length} uploaded to cloud` : 'No assets uploaded yet'
  });
  results.push(storageResult);

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n===========================================');
  console.log('AUDIT SUMMARY');
  console.log('===========================================');

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
    console.log(`\n${icon} ${result.category}`);
    for (const item of result.items) {
      const itemIcon = item.status === 'PASS' ? '  ✓' : item.status === 'WARN' ? '  ⚠' : '  ✗';
      console.log(`    ${itemIcon} ${item.name}: ${item.message}`);
    }

    if (result.status === 'PASS') passCount++;
    else if (result.status === 'WARN') warnCount++;
    else failCount++;
  }

  console.log('\n===========================================');
  console.log('OVERALL STATUS');
  console.log('===========================================');
  console.log(`✅ PASS: ${passCount} categories`);
  console.log(`⚠️  WARN: ${warnCount} categories`);
  console.log(`❌ FAIL: ${failCount} categories`);

  console.log('\n===========================================');
  console.log('REQUIRED ACTIONS');
  console.log('===========================================');

  if (realKeys.length === 0) {
    console.log('⚠️  1. Add real Zernio API keys to database');
  }
  if (postedDist.length === 0) {
    console.log('⚠️  2. Post first content via Zernio');
  }
  if (sales.length === 0) {
    console.log('⚠️  3. Track first conversion/sale');
  }
  if (warnCount === 0 && failCount === 0 && realKeys.length > 0 && postedDist.length > 0) {
    console.log('✅ System ready for campaign!');
  }

  await prisma.$disconnect();
}

audit().catch(console.error);
