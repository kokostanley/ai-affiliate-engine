// ============================================
// AI Affiliate Engine - Database Seed (SQLite Version)
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ============================================
  // CLEAR EXISTING DATA
  // ============================================
  console.log('Clearing existing data...');

  await prisma.clickLog.deleteMany();
  await prisma.scheduledPost.deleteMany();
  await prisma.approvalLog.deleteMany();
  await prisma.content.deleteMany();
  await prisma.link.deleteMany();
  await prisma.product.deleteMany();
  await prisma.webhookLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.analytics.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.telegramSession.deleteMany();

  console.log('✓ Existing data cleared\n');

  // ============================================
  // CREATE SAMPLE PRODUCTS
  // ============================================
  console.log('Creating sample products...');

  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Smart Watch Pro X9',
        slug: 'smart-watch-pro-x9',
        category: 'Elektronik',
        price: 899000,
        commission: 15,
        commissionAmount: 134850,
        affiliatePlatform: 'Shopee',
        affiliateLink: 'https://shopee.co.id/product/smartwatch-pro-x9',
        imageUrl: 'https://example.com/images/smartwatch.jpg',
        description: 'Smart Watch Premium dengan fitur kesehatan lengkap, layar AMOLED, dan baterai tahan 7 hari.',
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Wireless Earbuds Elite',
        slug: 'wireless-earbuds-elite',
        category: 'Elektronik',
        price: 599000,
        commission: 12,
        commissionAmount: 71880,
        affiliatePlatform: 'TikTok',
        affiliateLink: 'https://tiktok.com/shop/earbuds-elite',
        imageUrl: 'https://example.com/images/earbuds.jpg',
        description: 'Earbuds nirkabel dengan Active Noise Cancellation.',
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Portable Blender Mini',
        slug: 'portable-blender-mini',
        category: 'Dapur',
        price: 189000,
        commission: 20,
        commissionAmount: 37800,
        affiliatePlatform: 'Shopee',
        affiliateLink: 'https://shopee.co.id/product/blender-mini',
        imageUrl: 'https://example.com/images/blender.jpg',
        description: 'Blender portabel USB rechargeable, cocok untuk smoothie.',
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        name: 'LED Ring Light 10 inch',
        slug: 'led-ring-light-10',
        category: 'Fotografi',
        price: 249000,
        commission: 18,
        commissionAmount: 44820,
        affiliatePlatform: 'Tokopedia',
        affiliateLink: 'https://tokopedia.com/ringlight-10inch',
        imageUrl: 'https://example.com/images/ringlight.jpg',
        description: 'Ring light LED untuk selfie dan video call.',
        status: 'ACTIVE',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Anti Gores Tempered Glass Premium',
        slug: 'tempered-glass-premium',
        category: 'Aksesoris HP',
        price: 49000,
        commission: 25,
        commissionAmount: 12250,
        affiliatePlatform: 'Shopee',
        affiliateLink: 'https://shopee.co.id/product/tempered-glass',
        imageUrl: 'https://example.com/images/glass.jpg',
        description: 'Tempered glass 9H hardness untuk semua tipe HP.',
        status: 'ACTIVE',
      },
    }),
  ]);

  console.log(`✓ Created ${products.length} products\n`);

  // ============================================
  // CREATE SHORT LINKS
  // ============================================
  console.log('Creating short links...');

  const links = await Promise.all([
    prisma.link.create({
      data: {
        productId: products[0].id,
        slug: 'suarx9',
        originalLink: products[0].affiliateLink,
        status: 'ACTIVE',
      },
    }),
    prisma.link.create({
      data: {
        productId: products[1].id,
        slug: 'earbudsx',
        originalLink: products[1].affiliateLink,
        status: 'ACTIVE',
      },
    }),
    prisma.link.create({
      data: {
        productId: products[2].id,
        slug: 'blendxmini',
        originalLink: products[2].affiliateLink,
        status: 'ACTIVE',
      },
    }),
    prisma.link.create({
      data: {
        productId: products[3].id,
        slug: 'ringxlight',
        originalLink: products[3].affiliateLink,
        status: 'ACTIVE',
      },
    }),
    prisma.link.create({
      data: {
        productId: products[4].id,
        slug: 'glassxpro',
        originalLink: products[4].affiliateLink,
        status: 'ACTIVE',
      },
    }),
  ]);

  console.log(`✓ Created ${links.length} short links\n`);

  // ============================================
  // CREATE SAMPLE CONTENT
  // ============================================
  console.log('Creating sample content...');

  const contents = await Promise.all([
    prisma.content.create({
      data: {
        productId: products[0].id,
        contentType: 'TIKTOK_SCRIPT',
        platform: 'TIKTOK',
        hook: 'Tahukah kamu sekarang kita bisa pantau kesehatan kita 24/7 tanpa harus ke dokter? 🏥',
        script: '0-3s: HOOK - "Tahukah kamu sekarang kita bisa pantau kesehatan kita 24/7 tanpa harus ke dokter?"\n3-15s: PROBLEM - "Setiap hari kita nggak tau kondisi kesehatan kita yang sebenarnya."\n15-40s: SOLUTION - "Nah ini dia Smart Watch Pro X9! Fitur-fitur keren:\n✓ Pantau detak jantung real-time\n✓ Ukur saturasi oksigen\n✓ Water resistant 5ATM\n✓ Baterai tahan 7 hari!"\n40-60s: CTA - "Link ada di bio ya!"',
        caption: '⏰ Smart Watch Pro X9 - Partner Kesehatanmu! ⏰\n\nTidur cukup tapi tetap lelah? Cek kesehatanmu sekarang!\n\n✨ Fitur Unggulan:\n• Detak jantung real-time\n• SpO2 monitoring\n• Sleep tracker\n• Water resistant\n• Baterai 7 hari!\n\n💰 Harga: Rp 899.000\n📍 Link di bio!',
        hashtags: '["SmartWatch","HealthTracker","TechGadget","GadgetReview"]',
        cta: 'Beli sekarang sebelum kehabisan!',
        tone: 'enthusiastic',
        language: 'id',
        aiModel: 'gpt-4o',
        tokensUsed: 1500,
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    }),
    prisma.content.create({
      data: {
        productId: products[1].id,
        contentType: 'REELS_SCRIPT',
        platform: 'INSTAGRAM',
        hook: 'Noise cancellation Rp 599k? Atau harus beli yang jutaan? 🤔🎵',
        script: 'OPENING: Show box + earbuds\n\n"Hey guys, pernah nggak sih denger suara brio tapi malah fokus sama brio-nya? 😂"\n\n"Kali ini kita bahas earbuds Rp 599Rb yang suaranya bisa ngalahin earbuds jutaan!"\n\n"Sound test - play drop bass song\n\n"ANC on/off comparison"\n\n"Fit test - shaking head\n\n"Overall Verdict: Worth it banget!"\nOUTRO: Follow for more tech review!',
        caption: '🎧 Earbuds Elite - Sound premium, harga nggak premium!\n\nPernah nggak denger lagu favorit tapi suaranya kayak dari kaleng? 😤\nCoba denger ini...\n\nNice kan? Tapi harganya? hanya Rp 599.000! 💰\n\n✅ Active Noise Cancellation\n✅ Bluetooth 5.3\n✅ 6 hours playtime\n✅ IPX5 water resistant\n\n📍 Link di bio!',
        hashtags: '["Earbuds","TechReview","Gadget","WirelessEarbuds"]',
        cta: 'Klik link di bio untuk checkout!',
        tone: 'casual',
        language: 'id',
        aiModel: 'gpt-4o',
        tokensUsed: 1200,
        status: 'DRAFT',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
      },
    }),
    prisma.content.create({
      data: {
        productId: products[2].id,
        contentType: 'WHATSAPP_PROMO',
        platform: 'WHATSAPP',
        hashtags: '["TWS","BlenderMini"]',
        cta: 'Chat kami untuk order! 📲',
        telegramText: '🔥 *PROMO BLENDER MINI!* 🔥\n\nBosan bikin smoothie di rumah tapi blender-nya berat dan ribet?\n\n🥤 *Portable Blender Mini* - Kecil-kecil威力 besar!\n✅ USB rechargeable\n✅ Kapasitas 350ml\n✅ Bikin smoothie dalam 30 detik\n\n💰 *HARGA: Rp 189.000*',
        whatsappText: 'Hai! Mau punya blender yang bisa dibawa kemana-mana? 🥤✨\n\nPortable Blender Mini - Cocok untuk:\n🥗 Smoothie sehat\n🍹 Jus segar\n🧊 Es batu crushed\n\nHarga: Rp 189.000\n\nChat kami untuk info dan order!',
        tone: 'friendly',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    }),
  ]);

  console.log(`✓ Created ${contents.length} contents\n`);

  // ============================================
  // CREATE SAMPLE CLICK LOGS
  // ============================================
  console.log('Creating sample click logs...');

  await Promise.all([
    prisma.clickLog.create({
      data: {
        linkId: links[0].id,
        source: 'TIKTOK',
        utmSource: 'tiktok',
        utmCampaign: 'smart-watch-promo',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      },
    }),
    prisma.clickLog.create({
      data: {
        linkId: links[0].id,
        source: 'INSTAGRAM',
        utmSource: 'instagram',
        utmCampaign: 'smart-watch-influencer',
        ipAddress: '192.168.1.2',
      },
    }),
    prisma.clickLog.create({
      data: {
        linkId: links[1].id,
        source: 'TIKTOK',
        utmSource: 'tiktok',
        utmCampaign: 'earbuds-review',
        ipAddress: '192.168.1.3',
      },
    }),
  ]);

  // Update click counts
  await prisma.link.update({ where: { id: links[0].id }, data: { clicks: 2, uniqueClicks: 2 } });
  await prisma.link.update({ where: { id: links[1].id }, data: { clicks: 1, uniqueClicks: 1 } });

  console.log('✓ Created click logs\n');

  // ============================================
  // CREATE RATE LIMITS
  // ============================================
  console.log('Creating rate limits...');

  await Promise.all([
    prisma.rateLimit.create({ data: { platform: 'TIKTOK', dailyLimit: 3, dailyUsed: 1 } }),
    prisma.rateLimit.create({ data: { platform: 'INSTAGRAM', dailyLimit: 3, dailyUsed: 0 } }),
    prisma.rateLimit.create({ data: { platform: 'TELEGRAM', dailyLimit: 10, dailyUsed: 2 } }),
    prisma.rateLimit.create({ data: { platform: 'WHATSAPP', dailyLimit: 50, dailyUsed: 5 } }),
  ]);

  console.log('✓ Created rate limits\n');

  // ============================================
  // CREATE ADMIN USER
  // ============================================
  console.log('Creating admin user...');

  await prisma.telegramSession.create({
    data: {
      telegramId: '123456789',
      username: 'admin',
      firstName: 'Admin',
      isAdmin: true,
      isApproved: true,
      state: 'MAIN_MENU',
    },
  });

  console.log('✓ Created admin session\n');

  // ============================================
  // CREATE SETTINGS
  // ============================================
  console.log('Creating settings...');

  await Promise.all([
    prisma.setting.create({ data: { key: 'default_tone', value: 'casual', description: 'Default tone' } }),
    prisma.setting.create({ data: { key: 'default_language', value: 'id', description: 'Default language' } }),
    prisma.setting.create({ data: { key: 'auto_approve', value: 'false', description: 'Auto approve' } }),
    prisma.setting.create({ data: { key: 'notifications_enabled', value: 'true', description: 'Enable notifications' } }),
  ]);

  console.log('✓ Created settings\n');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('✅ Database seeded successfully!\n');
  console.log('📊 Summary:');
  console.log(`   • Products: ${products.length}`);
  console.log(`   • Links: ${links.length}`);
  console.log(`   • Contents: ${contents.length}`);
  console.log(`   • Click logs: 3`);
  console.log(`   • Rate limits: 4`);
  console.log(`   • Settings: 4`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });