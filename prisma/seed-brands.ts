// ============================================
// BRAND SEED DATA
// Seed initial brands for Phase 5
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding brand data...\n');

  // ============================================
  // BRAND 1: CEPATDAPAT
  // ============================================
  console.log('Creating CepatDapat brand...');

  const cepatDapat = await prisma.brand.upsert({
    where: { slug: 'cepatdapat' },
    update: {},
    create: {
      name: 'CepatDapat',
      slug: 'cepatdapat',
      description: 'Affiliate brand untuk produk digital dan consumer goods',
      status: 'ACTIVE',
      settings: JSON.stringify({
        defaultVideoProvider: 'PIPPIT_MANUAL',
        defaultImageProvider: 'HIGGSFIELD',
        autoApprove: false,
        maxPostsPerDay: 10,
        defaultCooldownMinutes: 60,
        postingHours: { start: 9, end: 21 },
      }),
    },
  });

  // Zernio configs for CepatDapat (2 keys)
  const cdZernio1 = await prisma.zernioConfig.upsert({
    where: { brandId_name: { brandId: cepatDapat.id, name: 'Zernio Key 1' } },
    update: {},
    create: {
      brandId: cepatDapat.id,
      name: 'Zernio Key 1',
      apiKey: 'ZERNIO_KEY_CEPAT_1', // Placeholder - replace with real key
      accountLimit: 10,
      isActive: true,
    },
  });

  const cdZernio2 = await prisma.zernioConfig.upsert({
    where: { brandId_name: { brandId: cepatDapat.id, name: 'Zernio Key 2' } },
    update: {},
    create: {
      brandId: cepatDapat.id,
      name: 'Zernio Key 2',
      apiKey: 'ZERNIO_KEY_CEPAT_2', // Placeholder - replace with real key
      accountLimit: 10,
      isActive: true,
    },
  });

  // Social accounts for CepatDapat (4 accounts)
  const cdAccounts = [
    {
      platform: 'TIKTOK',
      accountId: 'cd_tiktok_1',
      accountName: 'CepatDapat Official',
      accountUsername: '@cepatdapatofficial',
      followers: 150000,
      priority: 10,
      zernioConfigId: cdZernio1.id,
    },
    {
      platform: 'INSTAGRAM',
      accountId: 'cd_ig_1',
      accountName: 'CepatDapat',
      accountUsername: '@cepatdapat',
      followers: 45000,
      priority: 8,
      zernioConfigId: cdZernio1.id,
    },
    {
      platform: 'FACEBOOK',
      accountId: 'cd_fb_1',
      accountName: 'CepatDapat Official',
      accountUsername: 'CepatDapatOfficial',
      followers: 25000,
      priority: 6,
      zernioConfigId: cdZernio2.id,
    },
    {
      platform: 'YOUTUBE',
      accountId: 'cd_yt_1',
      accountName: 'CepatDapat Channel',
      accountUsername: '@cepatdapat',
      followers: 12000,
      priority: 5,
      zernioConfigId: cdZernio2.id,
    },
  ];

  for (const acc of cdAccounts) {
    await prisma.socialAccount.upsert({
      where: {
        brandId_platform_accountId: {
          brandId: cepatDapat.id,
          platform: acc.platform,
          accountId: acc.accountId,
        },
      },
      update: {},
      create: {
        brandId: cepatDapat.id,
        ...acc,
        status: 'ACTIVE',
        dailyLimit: 3,
        cooldownMinutes: 60,
      },
    });
  }

  console.log(`✅ CepatDapat: 1 brand, 2 Zernio configs, ${cdAccounts.length} accounts\n`);

  // ============================================
  // BRAND 2: CRYPTO EW
  // ============================================
  console.log('Creating Crypto EW brand...');

  const cryptoEW = await prisma.brand.upsert({
    where: { slug: 'crypto-ew' },
    update: {},
    create: {
      name: 'Crypto EW',
      slug: 'crypto-ew',
      description: 'Affiliate brand untuk produk crypto, fintech, dan tech products',
      status: 'ACTIVE',
      settings: JSON.stringify({
        defaultVideoProvider: 'HIGGSFIELD_AUTO',
        defaultImageProvider: 'DALL_E',
        autoApprove: false,
        maxPostsPerDay: 15,
        defaultCooldownMinutes: 45,
        postingHours: { start: 8, end: 22 },
      }),
    },
  });

  // Zernio configs for Crypto EW (3 keys)
  const cwZernio1 = await prisma.zernioConfig.upsert({
    where: { brandId_name: { brandId: cryptoEW.id, name: 'Zernio Key 1' } },
    update: {},
    create: {
      brandId: cryptoEW.id,
      name: 'Zernio Key 1',
      apiKey: 'ZERNIO_KEY_CRYPTO_1', // Placeholder
      accountLimit: 10,
      isActive: true,
    },
  });

  const cwZernio2 = await prisma.zernioConfig.upsert({
    where: { brandId_name: { brandId: cryptoEW.id, name: 'Zernio Key 2' } },
    update: {},
    create: {
      brandId: cryptoEW.id,
      name: 'Zernio Key 2',
      apiKey: 'ZERNIO_KEY_CRYPTO_2', // Placeholder
      accountLimit: 10,
      isActive: true,
    },
  });

  const cwZernio3 = await prisma.zernioConfig.upsert({
    where: { brandId_name: { brandId: cryptoEW.id, name: 'Zernio Key 3' } },
    update: {},
    create: {
      brandId: cryptoEW.id,
      name: 'Zernio Key 3',
      apiKey: 'ZERNIO_KEY_CRYPTO_3', // Placeholder
      accountLimit: 10,
      isActive: true,
    },
  });

  // Social accounts for Crypto EW (6 accounts)
  const cwAccounts = [
    {
      platform: 'TIKTOK',
      accountId: 'cw_tiktok_1',
      accountName: 'Crypto EW Trading',
      accountUsername: '@cryptoewtrading',
      followers: 250000,
      priority: 10,
      zernioConfigId: cwZernio1.id,
    },
    {
      platform: 'TIKTOK',
      accountId: 'cw_tiktok_2',
      accountName: 'EW Crypto Signals',
      accountUsername: '@ewcryptosignals',
      followers: 180000,
      priority: 9,
      zernioConfigId: cwZernio1.id,
    },
    {
      platform: 'INSTAGRAM',
      accountId: 'cw_ig_1',
      accountName: 'Crypto EW',
      accountUsername: '@cryptoew.id',
      followers: 65000,
      priority: 8,
      zernioConfigId: cwZernio2.id,
    },
    {
      platform: 'INSTAGRAM',
      accountId: 'cw_ig_2',
      accountName: 'EW Finansial',
      accountUsername: '@ewfinansial',
      followers: 35000,
      priority: 7,
      zernioConfigId: cwZernio2.id,
    },
    {
      platform: 'FACEBOOK',
      accountId: 'cw_fb_1',
      accountName: 'Crypto EW Indonesia',
      accountUsername: 'CryptoEWIndonesia',
      followers: 45000,
      priority: 6,
      zernioConfigId: cwZernio3.id,
    },
    {
      platform: 'YOUTUBE',
      accountId: 'cw_yt_1',
      accountName: 'Crypto EW Official',
      accountUsername: '@CryptoEWOfficial',
      followers: 85000,
      priority: 8,
      zernioConfigId: cwZernio3.id,
    },
  ];

  for (const acc of cwAccounts) {
    await prisma.socialAccount.upsert({
      where: {
        brandId_platform_accountId: {
          brandId: cryptoEW.id,
          platform: acc.platform,
          accountId: acc.accountId,
        },
      },
      update: {},
      create: {
        brandId: cryptoEW.id,
        ...acc,
        status: 'ACTIVE',
        dailyLimit: 3,
        cooldownMinutes: 45,
      },
    });
  }

  console.log(`✅ Crypto EW: 1 brand, 3 Zernio configs, ${cwAccounts.length} accounts\n`);

  // ============================================
  // SUMMARY
  // ============================================
  const brandCount = await prisma.brand.count();
  const zernioCount = await prisma.zernioConfig.count();
  const accountCount = await prisma.socialAccount.count();

  console.log('===========================================');
  console.log('BRAND SEED COMPLETE');
  console.log('===========================================');
  console.log(`Total Brands: ${brandCount}`);
  console.log(`Total Zernio Configs: ${zernioCount}`);
  console.log(`Total Social Accounts: ${accountCount}`);
  console.log('');
  console.log('⚠️  Note: Replace placeholder Zernio API keys with real keys!');
  console.log('');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
