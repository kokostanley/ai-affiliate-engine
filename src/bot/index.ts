// ============================================
// AI AFFILIATE DISTRIBUTION ENGINE
// Telegram Bot - Phase 4 Enhanced
// ============================================

import { Telegraf, Markup, Context } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { generatePhase2Content } from '../lib/openai-content';
import 'dotenv/config';

// ============================================
// CONFIG
// ============================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const prisma = new PrismaClient();

// ============================================
// BOT INSTANCE
// ============================================

const bot = new Telegraf(BOT_TOKEN);

// ============================================
// HELPERS
// ============================================

function formatPrice(price: number): string {
  return `Rp ${price.toLocaleString('id-ID')}`;
}

function truncate(text: string, len: number): string {
  if (!text) return '';
  return text.length > len ? text.substring(0, len) + '...' : text;
}

// ============================================
// COMMANDS
// ============================================

// /start - Welcome message
bot.command('start', async (ctx) => {
  const welcomeText = `
🤖 *AI Affiliate Engine Bot*

Selamat datang! Bot ini membantu Anda mengelola link affiliate dan konten AI Phase 2.

📋 *Commands:*
• /help - Bantuan
• /products - List produk
• /add [link] - Tambah produk via link
• /generate2 [productId] - Generate Phase 2 content
• /status - Status sistem
• /stats - Statistik
• /pending - Konten menunggu approval
• /view [id] - Lihat detail konten

💡 *Tips:* Kirim link Shopee/TikTok/Tokopedia/Lazada untuk auto-generate Phase 2!
`;
  await ctx.reply(welcomeText, { parse_mode: 'Markdown' });
});

// /help - Help message
bot.command('help', async (ctx) => {
  const helpText = `
📖 *Panduan Penggunaan Phase 2*

*Menambah Produk:*
1. Kirim: /add [affiliate_link]
2. Bot auto-generate Phase 2 content

*Generate Ulang:*
1. Ketik: /generate2 [productId]
2. Akan generate 20 hooks, 10 captions, dll

*Approval Workflow:*
1. Ketik /pending
2. Pilih konten untuk review
3. Klik ✅ Approve / ❌ Reject

*Yang Didapat:*
✅ 20 Hook variations
✅ 10 Caption variations
✅ 5 CTA variations
✅ 5 Video scripts
✅ 30 Hashtags
✅ 4 Video AI prompts
✅ 4 Image AI prompts
✅ Quality score per content
`;
  await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// /status - System status
bot.command('status', async (ctx) => {
  try {
    const [products, content, pending, approved, rejected] = await Promise.all([
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.content.count(),
      prisma.content.count({ where: { approvalStatus: 'PENDING' } }),
      prisma.content.count({ where: { approvalStatus: 'APPROVED' } }),
      prisma.content.count({ where: { approvalStatus: 'REJECTED' } }),
    ]);

    const statusText = `
📊 *System Status*

🛒 Products: ${products} aktif
📝 Total Content: ${content}
⏳ Pending: ${pending}
✅ Approved: ${approved}
❌ Rejected: ${rejected}

🟢 Database: Connected
🟢 AI Phase 2: Active
🟢 Bot: Running
`;
    await ctx.reply(statusText, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply('❌ Error fetching status');
  }
});

// /stats - Analytics
bot.command('stats', async (ctx) => {
  try {
    const topProducts = await prisma.product.findMany({
      include: {
        links: { select: { clicks: true } },
        _count: { select: { contents: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    let statsText = `📈 *Top Products*\n\n`;

    for (let i = 0; i < topProducts.length; i++) {
      const p = topProducts[i];
      const clicks = p.links.reduce((sum, l) => sum + l.clicks, 0);
      statsText += `${i + 1}. ${p.name}\n   💰 ${formatPrice(p.price)} | 👆 ${clicks} clicks | 📝 ${p._count.contents} content\n\n`;
    }

    await ctx.reply(statsText, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply('❌ Error fetching stats');
  }
});

// /products - List products
bot.command('products', async (ctx) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: { _count: { select: { contents: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (products.length === 0) {
      await ctx.reply('📦 Belum ada produk. Gunakan /add [link] untuk menambah.');
      return;
    }

    const buttons = products.map(p => [
      Markup.button.callback(
        `📦 ${truncate(p.name, 25)}`,
        `gen2_${p.id}`
      )
    ]);

    await ctx.reply(
      `📦 *Daftar Produk (${products.length})*\n\nPilih produk untuk generate Phase 2:`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  } catch (error) {
    await ctx.reply('❌ Error fetching products');
  }
});

// /pending - Pending contents with Phase 2 details
bot.command('pending', async (ctx) => {
  try {
    const pending = await prisma.content.findMany({
      where: { approvalStatus: 'PENDING' },
      include: {
        product: { select: { name: true } },
        qualityScore: true,
        _count: { select: { contentVariants: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (pending.length === 0) {
      await ctx.reply('✅ Tidak ada konten menunggu approval.');
      return;
    }

    let message = `⏳ *Konten Pending (${pending.length})*\n\n`;

    for (const c of pending) {
      const score = c.qualityScore?.overallScore || 0;
      const variants = c._count.contentVariants;
      const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';

      message += `${emoji} *${truncate(c.product.name, 20)}*\n`;
      message += `   📝 ${variants} variants | Score: ${score}/100\n`;
      message += `   ID: \`${c.id.substring(0, 8)}...\`\n\n`;
    }

    const buttons = pending.map(c => [
      Markup.button.callback(`📝 ${truncate(c.product.name, 20)}`, `view_${c.id}`)
    ]);

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    await ctx.reply('❌ Error fetching pending');
  }
});

// /add [link] - Add product with Phase 2 generation
bot.command('add', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Kirim format: /add [affiliate_link]\n\nContoh: /add https://shopee.co.id/product/12345');
    return;
  }

  const link = args.trim();

  if (!link.startsWith('http')) {
    await ctx.reply('❌ Link tidak valid. Pastikan dimulai dengan http:// atau https://');
    return;
  }

  const supportedPlatforms = ['shopee', 'tokopedia', 'lazada', 'tiktok'];
  const isSupported = supportedPlatforms.some(p => link.toLowerCase().includes(p));

  if (!isSupported) {
    await ctx.reply('⚠️ Platform belum didukung.\n\nSupported: Shopee, Tokopedia, Lazada, TikTok');
    return;
  }

  await ctx.reply('⏳ Processing... Generating Phase 2 content...');

  try {
    const slug = `prod_${Date.now()}`;

    // Create product
    const product = await prisma.product.create({
      data: {
        name: 'Product ' + new Date().toLocaleTimeString(),
        slug,
        category: 'Uncategorized',
        price: 0,
        commission: 10,
        commissionAmount: 0,
        affiliatePlatform: detectPlatform(link),
        affiliateLink: link,
        status: 'ACTIVE',
      },
    });

    // Create link
    await prisma.link.create({
      data: {
        slug,
        productId: product.id,
        originalLink: link,
        status: 'ACTIVE',
      },
    });

    // Generate Phase 2 content
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productPrice: 0,
      productCategory: 'Uncategorized',
    });

    // Create main content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_FULL',
        platform: 'ALL',
        hook: contentPack.hooks[0],
        caption: contentPack.captions[0],
        hashtags: contentPack.hashtags.slice(0, 30).join(','),
        cta: contentPack.ctas[0],
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: 'casual',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    // Create content variants
    const variantPromises: any[] = [];

    contentPack.hooks.forEach((hook, index) => {
      variantPromises.push(prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'HOOK',
          variantIndex: index + 1,
          contentValue: hook,
        },
      }));
    });

    contentPack.captions.forEach((caption, index) => {
      variantPromises.push(prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'CAPTION',
          variantIndex: index + 1,
          contentValue: caption,
        },
      }));
    });

    contentPack.ctas.forEach((cta, index) => {
      variantPromises.push(prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'CTA',
          variantIndex: index + 1,
          contentValue: cta,
        },
      }));
    });

    await Promise.all(variantPromises);

    // Create quality score
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        hookScore: contentPack.qualityScores.hookScore,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        overallScore: contentPack.qualityScores.overallScore,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        shouldPost: contentPack.qualityScores.shouldPost,
        recommendation: contentPack.qualityScores.recommendation,
      },
    });

    // Send summary with buttons
    const summaryText = `
✅ *Phase 2 Content Generated!*

📦 *Produk:* ${product.name}
🔗 *Link:* ${link}
🏪 *Platform:* ${product.affiliatePlatform}

📊 *Content Stats:*
• Hooks: ${contentPack.hooks.length}
• Captions: ${contentPack.captions.length}
• CTAs: ${contentPack.ctas.length}

📈 *Quality Score:* ${contentPack.qualityScores.overallScore}/100
🎯 *Best Platform:* ${contentPack.qualityScores.bestPlatform}
${contentPack.qualityScores.shouldPost ? '✅' : '⚠️'} *Recommendation:* ${contentPack.qualityScores.shouldPost ? 'Ready to post' : 'Needs review'}

📝 *Hook Preview:*
${truncate(contentPack.hooks[0], 100)}

🆔 Content ID: \`${content.id}\`
`;

    await ctx.reply(summaryText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `appr_${content.id}` },
            { text: '❌ Reject', callback_data: `rejt_${content.id}` },
          ],
          [
            { text: '📝 View All Variants', callback_data: `view_${content.id}` },
            { text: '🔄 Regenerate', callback_data: `regen_${content.id}` },
          ]
        ]
      }
    });

  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /generate2 [productId] - Generate Phase 2 for existing product
bot.command('generate2', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Format: /generate2 [product_id]\n\nContoh: /generate2 cmpxxxxxx');
    return;
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: args } });
    if (!product) {
      await ctx.reply('❌ Produk tidak ditemukan');
      return;
    }

    await ctx.reply(`⏳ Generating Phase 2 content untuk "${product.name}"...`);

    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: product.description || '',
      productPrice: Number(product.price),
      productCategory: product.category,
    });

    // Create main content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_FULL',
        platform: 'ALL',
        hook: contentPack.hooks[0],
        script: contentPack.scripts[0],
        caption: contentPack.captions[0],
        hashtags: contentPack.hashtags.slice(0, 30).join(','),
        cta: contentPack.ctas[0],
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: 'casual',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    // Create variants
    const variantPromises: any[] = [];

    contentPack.hooks.forEach((hook, index) => {
      variantPromises.push(prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'HOOK',
          variantIndex: index + 1,
          contentValue: hook,
        },
      }));
    });

    contentPack.captions.forEach((caption, index) => {
      variantPromises.push(prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'CAPTION',
          variantIndex: index + 1,
          contentValue: caption,
        },
      }));
    });

    contentPack.ctas.forEach((cta, index) => {
      variantPromises.push(prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'CTA',
          variantIndex: index + 1,
          contentValue: cta,
        },
      }));
    });

    await Promise.all(variantPromises);

    // Create quality score
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        hookScore: contentPack.qualityScores.hookScore,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        overallScore: contentPack.qualityScores.overallScore,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        shouldPost: contentPack.qualityScores.shouldPost,
        recommendation: contentPack.qualityScores.recommendation,
      },
    });

    await ctx.reply(`✅ Phase 2 content generated!\n\n` +
      `📦 Product: ${product.name}\n` +
      `📝 ${contentPack.hooks.length} hooks, ${contentPack.captions.length} captions, ${contentPack.ctas.length} CTAs\n` +
      `📈 Quality Score: ${contentPack.qualityScores.overallScore}/100\n\n` +
      `🆔 Content ID: \`${content.id}\`\n\n` +
      `Ketik /view ${content.id} untuk detail lengkap`,
      { parse_mode: 'Markdown' }
    );

  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /view [id] - View content details
bot.command('view', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Format: /view [content_id]');
    return;
  }

  try {
    const content = await prisma.content.findUnique({
      where: { id: args },
      include: {
        product: true,
        qualityScore: true,
        contentVariants: { orderBy: { variantIndex: 'asc' } },
      },
    });

    if (!content) {
      await ctx.reply('❌ Content tidak ditemukan');
      return;
    }

    // Group variants
    const hooks = content.contentVariants.filter(v => v.variantType === 'HOOK');
    const captions = content.contentVariants.filter(v => v.variantType === 'CAPTION');
    const ctas = content.contentVariants.filter(v => v.variantType === 'CTA');

    const quality = content.qualityScore;

    let detailText = `
📝 *Content Detail*

📦 *Product:* ${content.product.name}
💰 *Harga:* ${formatPrice(content.product.price)}
🏪 *Platform:* ${content.product.affiliatePlatform}

📊 *Stats:*
• Hooks: ${hooks.length}
• Captions: ${captions.length}
• CTAs: ${ctas.length}

${quality ? `📈 *Quality Scores:*
• Overall: ${quality.overallScore}/100
• Hook: ${quality.hookScore}/100
• Clarity: ${quality.clarityScore}/100
• Conversion: ${quality.conversionScore}/100
• Platform Fit: ${quality.platformFitScore}/100` : ''}

${quality?.shouldPost ? '✅' : '⚠️'} *Status:* ${content.approvalStatus}

📝 *Best Hook:*
${truncate(quality?.bestHook || content.hook || '', 150)}
`;

    await ctx.reply(detailText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `appr_${content.id}` },
            { text: '❌ Reject', callback_data: `rejt_${content.id}` },
          ],
          [
            { text: '🔄 Regenerate Hooks', callback_data: `regen_hooks_${content.id}` },
            { text: '📋 View All Variants', callback_data: `variants_${content.id}` },
          ]
        ]
      }
    });

  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /approve [id] - Approve content
bot.command('approve', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Format: /approve [content_id]');
    return;
  }

  try {
    const content = await prisma.content.update({
      where: { id: args },
      data: {
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: ctx.from.username || 'admin',
      },
      include: { product: true },
    });

    await prisma.approvalLog.create({
      data: {
        contentId: content.id,
        action: 'APPROVED',
        actionBy: ctx.from.username || 'admin',
        notes: 'Approved via Telegram bot',
      },
    });

    await ctx.reply(`✅ *Content Approved!*\n\n📦 Product: ${content.product.name}\n⏰ Time: ${new Date().toLocaleString('id-ID')}\n\nKonten siap untuk di-schedule!`);

  } catch (error) {
    await ctx.reply('❌ Content tidak ditemukan');
  }
});

// /reject [id] [reason] - Reject content
bot.command('reject', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const contentId = args[0];
  const reason = args.slice(1).join(' ') || 'No reason provided';

  if (!contentId) {
    await ctx.reply('📎 Format: /reject [content_id] [reason]');
    return;
  }

  try {
    const content = await prisma.content.update({
      where: { id: contentId },
      data: {
        approvalStatus: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await ctx.reply(`❌ *Content Rejected!*\n\nAlasan: ${reason}`);

  } catch (error) {
    await ctx.reply('❌ Content tidak ditemukan');
  }
});

// /production - List production packages
bot.command('production', async (ctx) => {
  try {
    const packages = await prisma.productionPackage.findMany({
      include: {
        product: true,
        content: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (packages.length === 0) {
      await ctx.reply('📦 No production packages yet.\n\nUse /production [content_id] to generate one.');
      return;
    }

    let text = `📦 *Production Packages (${packages.length})*\n\n`;

    for (const pkg of packages) {
      const status = pkg.status === 'production_ready' ? '✅' :
                   pkg.status === 'rendered' ? '🟣' :
                   pkg.status === 'rendering' ? '⏳' : '⚪';

      text += `${status} *${pkg.product.name}*\n`;
      text += `   Status: ${pkg.status} | Platform: ${pkg.bestPlatform || 'TBD'}\n`;
      text += `   ID: \`${pkg.id.substring(0, 8)}...\`\n\n`;
    }

    text += '\nUse /showpack [id] for details';

    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply('❌ Error fetching production packages');
  }
});

// /showpack [id] - Show production package details
bot.command('showpack', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Format: /showpack [package_id]\n\nOr tap a package from /production list.');
    return;
  }

  try {
    const pkg = await prisma.productionPackage.findUnique({
      where: { id: args },
      include: {
        product: true,
        content: true,
      },
    });

    if (!pkg) {
      await ctx.reply('❌ Package not found');
      return;
    }

    const hasVideoPrompts = pkg.videoPromptPippit || pkg.videoPromptVeo || pkg.videoPromptSeedance || pkg.videoPromptSora;
    const hasImagePrompts = pkg.imagePromptThumbnail || pkg.imagePromptSocial || pkg.imagePromptCarousel || pkg.imagePromptAd;
    const hasScripts = pkg.voiceoverScript || pkg.subtitleScript;

    const detailText = `
📦 *Production Package*

📦 *Product:* ${pkg.product.name}
🏪 *Platform:* ${pkg.bestPlatform || 'TBD'}
📊 *Score:* ${pkg.overallScore}/100
📈 *Status:* ${pkg.status}

*Video Prompts:* ${hasVideoPrompts ? '✅' : '❌'}
*Image Prompts:* ${hasImagePrompts ? '✅' : '❌'}
*Scripts:* ${hasScripts ? '✅' : '❌'}

🆔 ID: \`${pkg.id}\`
📅 Created: ${new Date(pkg.createdAt).toLocaleString('id-ID')}
${pkg.exportedAt ? `📤 Exported: ${new Date(pkg.exportedAt).toLocaleString('id-ID')}` : ''}

Best Hook:
${pkg.content.hook?.substring(0, 100) || 'N/A'}...
`;

    await ctx.reply(detailText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Mark Ready', callback_data: `pkg_ready_${pkg.id}` },
            { text: '🟣 Mark Rendered', callback_data: `pkg_rendered_${pkg.id}` },
          ],
          [
            { text: '🔄 Regenerate', callback_data: `pkg_regen_${pkg.id}` },
            { text: '📤 Export', callback_data: `pkg_export_${pkg.id}` },
          ],
        ]
      }
    });

  } catch (error) {
    await ctx.reply(`❌ Error: ${error}`);
  }
});

// /genproduction [content_id] - Generate production package
bot.command('genproduction', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    // List approved content without packages
    const approvedContent = await prisma.content.findMany({
      where: {
        approvalStatus: 'APPROVED',
        productionPackages: { none: {} }
      },
      include: { product: true },
      take: 5,
    });

    if (approvedContent.length === 0) {
      await ctx.reply('✅ All approved content has production packages, or no approved content yet.');
      return;
    }

    let text = '📋 *Approved Content for Production:*\n\n';
    for (const c of approvedContent) {
      text += `• ${c.product.name}\n   ID: \`${c.id.substring(0, 8)}...\`\n\n`;
    }
    text += '\nUse /genproduction [content_id]';

    await ctx.reply(text, { parse_mode: 'Markdown' });
    return;
  }

  await ctx.reply('⏳ Generating production package...');

  try {
    // Get content
    const content = await prisma.content.findUnique({
      where: { id: args },
      include: { product: true, qualityScores: { take: 1 } },
    });

    if (!content) {
      await ctx.reply('❌ Content not found');
      return;
    }

    if (content.approvalStatus !== 'APPROVED') {
      await ctx.reply('❌ Content must be approved first');
      return;
    }

    // Generate production prompts
    const { generateProductionPrompts } = await import('../lib/openai-content');

    const prompts = await generateProductionPrompts({
      productName: content.product.name,
      productDescription: content.product.description || '',
      productPrice: Number(content.product.price),
      bestHook: content.qualityScores?.[0]?.bestHook || content.hook,
      bestCaption: content.qualityScores?.[0]?.bestCaption || content.caption,
      bestCta: content.qualityScores?.[0]?.bestCta || content.cta,
      hashtags: content.hashtags,
    });

    // Create production package
    const pkg = await prisma.productionPackage.create({
      data: {
        contentId: content.id,
        productId: content.productId,
        status: 'production_ready',
        bestPlatform: content.qualityScores?.[0]?.bestPlatform || 'TikTok',
        overallScore: content.qualityScores?.[0]?.overallScore || 0,
        videoPromptPippit: prompts.videoPromptPippit,
        videoPromptVeo: prompts.videoPromptVeo,
        videoPromptSeedance: prompts.videoPromptSeedance,
        videoPromptSora: prompts.videoPromptSora,
        imagePromptThumbnail: prompts.imagePromptThumbnail,
        imagePromptSocial: prompts.imagePromptSocial,
        imagePromptCarousel: prompts.imagePromptCarousel,
        imagePromptAd: prompts.imagePromptAd,
        voiceoverScript: prompts.voiceoverScript,
        subtitleScript: prompts.subtitleScript,
      },
    });

    const successText = `
✅ *Production Package Generated!*

📦 *Product:* ${content.product.name}
🏪 *Platform:* ${pkg.bestPlatform}
📊 *Score:* ${pkg.overallScore}/100

*Included:*
✅ 4 Video Prompts (Pippit, Veo, Seedance, Sora)
✅ 4 Image Prompts (Thumbnail, Social, Carousel, Ad)
✅ Voiceover Script
✅ Subtitle Script

🆔 Package ID: \`${pkg.id}\`

Use /showpack ${pkg.id} untuk detail lengkap
`;

    await ctx.reply(successText, { parse_mode: 'Markdown' });

  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /render - List render jobs
bot.command('render', async (ctx) => {
  try {
    const jobs = await prisma.renderJob.findMany({
      include: {
        productionPackage: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (jobs.length === 0) {
      await ctx.reply('🎬 No render jobs yet.\n\nUse /renderpkg [package_id] to create jobs.');
      return;
    }

    let text = `🎬 *Render Jobs (${jobs.length})*\n\n`;

    for (const job of jobs) {
      const status = job.status === 'completed' ? '✅' :
                     job.status === 'processing' ? '⏳' :
                     job.status === 'failed' ? '❌' : '⏳';
      const type = job.jobType === 'VIDEO' ? '🎬' : '🖼️';

      text += `${status} ${type} *${job.tool}*\n`;
      text += `   ${job.productionPackage.product.name}\n`;
      text += `   Status: ${job.status}\n`;
      text += `   ID: \`${job.id.substring(0, 8)}...\`\n\n`;
    }

    text += '\nUse /renderjob [id] for details';

    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply('❌ Error fetching render jobs');
  }
});

// /renderpkg [package_id] - Create render jobs for package
bot.command('renderpkg', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Format: /renderpkg [package_id]\n\nUse /production to find package IDs.');
    return;
  }

  try {
    const pkg = await prisma.productionPackage.findUnique({
      where: { id: args },
      include: { product: true },
    });

    if (!pkg) {
      await ctx.reply('❌ Package not found');
      return;
    }

    // Create video render jobs
    const jobs = [];

    if (pkg.videoPromptPippit) {
      jobs.push({
        productionPackageId: pkg.id,
        jobType: 'VIDEO',
        tool: 'PIPPIT',
        prompt: pkg.videoPromptPippit,
        duration: 30,
        format: '9:16',
        status: 'queued',
      });
    }

    if (pkg.videoPromptVeo) {
      jobs.push({
        productionPackageId: pkg.id,
        jobType: 'VIDEO',
        tool: 'VEO',
        prompt: pkg.videoPromptVeo,
        duration: 45,
        format: '16:9',
        status: 'queued',
      });
    }

    if (pkg.imagePromptThumbnail) {
      jobs.push({
        productionPackageId: pkg.id,
        jobType: 'IMAGE',
        tool: 'DALL_E',
        prompt: pkg.imagePromptThumbnail,
        status: 'queued',
      });
    }

    if (jobs.length === 0) {
      await ctx.reply('⚠️ No prompts available in this package');
      return;
    }

    await prisma.renderJob.createMany({ data: jobs });

    await ctx.reply(`🎬 *Render Jobs Created!*\n\nPackage: ${pkg.product.name}\n\nCreated ${jobs.length} jobs:\n${jobs.map(j => `• ${j.jobType === 'VIDEO' ? '🎬' : '🖼️'} ${j.tool}`).join('\n')}\n\nUse /render to see all jobs`,
      { parse_mode: 'Markdown' });

  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /renderjob [id] - Show render job details
bot.command('renderjob', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Format: /renderjob [job_id]');
    return;
  }

  try {
    const job = await prisma.renderJob.findUnique({
      where: { id: args },
      include: { productionPackage: { include: { product: true } } },
    });

    if (!job) {
      await ctx.reply('❌ Job not found');
      return;
    }

    const status = job.status === 'completed' ? '✅' :
                   job.status === 'processing' ? '⏳' :
                   job.status === 'failed' ? '❌' : '⏳';

    let text = `
🎬 *Render Job Details*

${status} *Tool:* ${job.tool}
📦 *Type:* ${job.jobType}
📊 *Status:* ${job.status}
${job.duration ? `⏱️ *Duration:* ${job.duration}s` : ''}
${job.format ? `📐 *Format:* ${job.format}` : ''}

*Product:* ${job.productionPackage.product.name}

${job.errorMessage ? `❌ *Error:* ${job.errorMessage}` : ''}
${job.outputUrl ? `📎 *Output:* ${job.outputUrl}` : ''}

🆔 ID: \`${job.id}\`
`;

    await ctx.reply(text, { parse_mode: 'Markdown' });

  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /renderstatus - Quick render stats
bot.command('renderstatus', async (ctx) => {
  try {
    const [total, queued, processing, completed, failed] = await Promise.all([
      prisma.renderJob.count(),
      prisma.renderJob.count({ where: { status: 'queued' } }),
      prisma.renderJob.count({ where: { status: 'processing' } }),
      prisma.renderJob.count({ where: { status: 'completed' } }),
      prisma.renderJob.count({ where: { status: 'failed' } }),
    ]);

    await ctx.reply(`
📊 *Render Queue Status*

🎬 Total: ${total}
⏳ Queued: ${queued}
🔄 Processing: ${processing}
✅ Completed: ${completed}
❌ Failed: ${failed}
`, { parse_mode: 'Markdown' });

  } catch (error) {
    await ctx.reply('❌ Error fetching stats');
  }
});

// ============================================
// CALLBACK HANDLERS
// ============================================

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  try {
    // Approve
    if (data.startsWith('appr_')) {
      const contentId = data.replace('appr_', '');

      await prisma.content.update({
        where: { id: contentId },
        data: {
          approvalStatus: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: ctx.from.username || 'admin',
        },
      });

      await prisma.approvalLog.create({
        data: {
          contentId,
          action: 'APPROVED',
          actionBy: ctx.from.username || 'admin',
        },
      });

      await ctx.answerCallbackQuery('✅ Approved!');
      await ctx.reply('✅ Content approved! Ready for scheduling.');
    }

    // Reject
    if (data.startsWith('rejt_')) {
      const contentId = data.replace('rejt_', '');

      await prisma.content.update({
        where: { id: contentId },
        data: {
          approvalStatus: 'REJECTED',
          rejectedAt: new Date(),
          rejectionReason: 'Rejected via Telegram',
        },
      });

      await ctx.answerCallbackQuery('❌ Rejected!');
      await ctx.reply('❌ Content rejected.');
    }

    // Package Ready
    if (data.startsWith('pkg_ready_')) {
      const pkgId = data.replace('pkg_ready_', '');
      await prisma.productionPackage.update({
        where: { id: pkgId },
        data: { status: 'production_ready' },
      });
      await ctx.answerCallbackQuery('✅ Marked Ready!');
      await ctx.reply('✅ Package marked as production ready.');
    }

    // Package Rendered
    if (data.startsWith('pkg_rendered_')) {
      const pkgId = data.replace('pkg_rendered_', '');
      await prisma.productionPackage.update({
        where: { id: pkgId },
        data: { status: 'rendered', renderedAt: new Date() },
      });
      await ctx.answerCallbackQuery('🟣 Marked Rendered!');
      await ctx.reply('🟣 Package marked as rendered.');
    }

    // Package Export
    if (data.startsWith('pkg_export_')) {
      const pkgId = data.replace('pkg_export_', '');
      await ctx.answerCallbackQuery('📤 Exporting...');

      const pkg = await prisma.productionPackage.findUnique({
        where: { id: pkgId },
        include: { product: true, content: true },
      });

      if (pkg) {
        await prisma.productionPackage.update({
          where: { id: pkgId },
          data: { exportedAt: new Date() },
        });

        await ctx.reply(`📤 *Export Ready!*\n\nProduct: ${pkg.product.name}\nPlatform: ${pkg.bestPlatform}\n\nAll production assets are ready to use.`);
      }
    }

    // Package Regenerate
    if (data.startsWith('pkg_regen_')) {
      const pkgId = data.replace('pkg_regen_', '');
      await ctx.answerCallbackQuery('🔄 Regenerating...');

      const existing = await prisma.productionPackage.findUnique({
        where: { id: pkgId },
        include: { content: { include: { qualityScores: { take: 1 } } }, product: true },
      });

      if (existing && existing.content) {
        const { generateProductionPrompts } = await import('../lib/openai-content');

        const prompts = await generateProductionPrompts({
          productName: existing.product.name,
          productDescription: existing.product.description || '',
          productPrice: Number(existing.product.price),
          bestHook: existing.content.qualityScores?.[0]?.bestHook || existing.content.hook,
          bestCaption: existing.content.qualityScores?.[0]?.bestCaption || existing.content.caption,
          bestCta: existing.content.qualityScores?.[0]?.bestCta || existing.content.cta,
        });

        await prisma.productionPackage.update({
          where: { id: pkgId },
          data: {
            videoPromptPippit: prompts.videoPromptPippit,
            videoPromptVeo: prompts.videoPromptVeo,
            videoPromptSeedance: prompts.videoPromptSeedance,
            videoPromptSora: prompts.videoPromptSora,
            imagePromptThumbnail: prompts.imagePromptThumbnail,
            imagePromptSocial: prompts.imagePromptSocial,
            imagePromptCarousel: prompts.imagePromptCarousel,
            imagePromptAd: prompts.imagePromptAd,
            voiceoverScript: prompts.voiceoverScript,
            subtitleScript: prompts.subtitleScript,
          },
        });

        await ctx.reply('🔄 Production package regenerated!');
      }
    }
      });

      await ctx.answerCallbackQuery('❌ Rejected!');
      await ctx.reply('❌ Content rejected.');
    }

    // View content
    if (data.startsWith('view_')) {
      const contentId = data.replace('view_', '');

      const content = await prisma.content.findUnique({
        where: { id: contentId },
        include: {
          product: true,
          qualityScore: true,
          contentVariants: { orderBy: { variantIndex: 'asc' } },
        },
      });

      if (content) {
        const hooks = content.contentVariants.filter(v => v.variantType === 'HOOK');
        const quality = content.qualityScore;

        let reply = `📝 *${content.product.name}*\n\n`;
        reply += `📈 Quality: ${quality?.overallScore || 0}/100\n`;
        reply += `📝 Hooks: ${hooks.length} variants\n\n`;
        reply += `*Best Hook:*\n${truncate(quality?.bestHook || content.hook || '', 100)}\n\n`;
        reply += `Status: ${content.approvalStatus}`;

        await ctx.answerCallbackQuery();
        await ctx.reply(reply, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approve', callback_data: `appr_${content.id}` },
                { text: '❌ Reject', callback_data: `rejt_${content.id}` },
              ]
            ]
          }
        });
      }
    }

    // Generate Phase 2 for product
    if (data.startsWith('gen2_')) {
      const productId = data.replace('gen2_', '');

      await ctx.answerCallbackQuery('⏳ Generating...');

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        await ctx.reply('❌ Produk tidak ditemukan');
        return;
      }

      const contentPack = await generatePhase2Content({
        productName: product.name,
        productDescription: product.description || '',
        productPrice: Number(product.price),
        productCategory: product.category,
      });

      const content = await prisma.content.create({
        data: {
          productId: product.id,
          contentType: 'PHASE2_FULL',
          platform: 'ALL',
          hook: contentPack.hooks[0],
          caption: contentPack.captions[0],
          hashtags: contentPack.hashtags.slice(0, 30).join(','),
          cta: contentPack.ctas[0],
          telegramText: contentPack.telegramText,
          whatsappText: contentPack.whatsappText,
          status: 'DRAFT',
          approvalStatus: 'PENDING',
        },
      });

      // Create variants
      const variantPromises: any[] = [];
      contentPack.hooks.forEach((hook, index) => {
        variantPromises.push(prisma.contentVariant.create({
          data: {
            contentId: content.id,
            variantType: 'HOOK',
            variantIndex: index + 1,
            contentValue: hook,
          },
        }));
      });
      contentPack.captions.forEach((caption, index) => {
        variantPromises.push(prisma.contentVariant.create({
          data: {
            contentId: content.id,
            variantType: 'CAPTION',
            variantIndex: index + 1,
            contentValue: caption,
          },
        }));
      });
      await Promise.all(variantPromises);

      await prisma.qualityScore.create({
        data: {
          contentId: content.id,
          hookScore: contentPack.qualityScores.hookScore,
          clarityScore: contentPack.qualityScores.clarityScore,
          conversionScore: contentPack.qualityScores.conversionScore,
          platformFitScore: contentPack.qualityScores.platformFitScore,
          overallScore: contentPack.qualityScores.overallScore,
          bestHook: contentPack.qualityScores.bestHook,
          bestCaption: contentPack.qualityScores.bestCaption,
          bestCta: contentPack.qualityScores.bestCta,
          bestPlatform: contentPack.qualityScores.bestPlatform,
          shouldPost: contentPack.qualityScores.shouldPost,
          recommendation: contentPack.qualityScores.recommendation,
        },
      });

      await ctx.reply(`✅ Phase 2 generated!\n\n` +
        `📦 ${product.name}\n` +
        `📈 Score: ${contentPack.qualityScores.overallScore}/100\n\n` +
        `ID: \`${content.id}\``,
        { parse_mode: 'Markdown' }
      );
    }

    // Regenerate
    if (data.startsWith('regen_')) {
      const parts = data.replace('regen_', '').split('_');
      const type = parts[0];
      const contentId = parts.slice(1).join('_');

      await ctx.answerCallbackQuery('⏳ Regenerating...');

      const content = await prisma.content.findUnique({
        where: { id: contentId },
        include: { product: true },
      });

      if (content) {
        const contentPack = await generatePhase2Content({
          productName: content.product.name,
          productPrice: Number(content.product.price),
          productCategory: content.product.category,
        });

        // Delete old variants of type
        if (type !== 'all') {
          await prisma.contentVariant.deleteMany({
            where: { contentId, variantType: type.toUpperCase() }
          });

          // Create new variants
          const items = type === 'hooks' ? contentPack.hooks : contentPack.captions;
          const variantType = type === 'hooks' ? 'HOOK' : 'CAPTION';

          for (let i = 0; i < items.length; i++) {
            await prisma.contentVariant.create({
              data: {
                contentId,
                variantType,
                variantIndex: i + 1,
                contentValue: items[i],
              },
            });
          }
        }

        await ctx.reply(`🔄 Regenerated ${type}!\n\nNew ${type}: ${truncate(contentPack.hooks[0] || contentPack.captions[0] || '', 80)}`);
      }
    }

    // View all variants
    if (data.startsWith('variants_')) {
      const contentId = data.replace('variants_', '');

      const content = await prisma.content.findUnique({
        where: { id: contentId },
        include: { contentVariants: { orderBy: { variantIndex: 'asc' } } },
      });

      if (content) {
        const hooks = content.contentVariants.filter(v => v.variantType === 'HOOK');

        let reply = `📝 *All Hooks (${hooks.length})*\n\n`;
        hooks.slice(0, 5).forEach((h, i) => {
          reply += `${i + 1}. ${truncate(h.contentValue, 80)}\n\n`;
        });

        if (hooks.length > 5) {
          reply += `... dan ${hooks.length - 5} hooks lagi. Ketik /view ${contentId} untuk semua.`;
        }

        await ctx.answerCallbackQuery();
        await ctx.reply(reply, { parse_mode: 'Markdown' });
      }
    }

    // Render job callbacks
    if (data.startsWith('rj_start_')) {
      const jobId = data.replace('rj_start_', '');
      await prisma.renderJob.update({
        where: { id: jobId },
        data: { status: 'processing', startedAt: new Date() },
      });
      await ctx.answerCallbackQuery('⏳ Processing...');
      await ctx.reply('⏳ Job started processing');
    }

    if (data.startsWith('rj_complete_')) {
      const jobId = data.replace('rj_complete_', '');
      await prisma.renderJob.update({
        where: { id: jobId },
        data: { status: 'completed', completedAt: new Date() },
      });
      await ctx.answerCallbackQuery('✅ Completed!');
      await ctx.reply('✅ Job marked as completed');
    }

    if (data.startsWith('rj_fail_')) {
      const jobId = data.replace('rj_fail_', '');
      await prisma.renderJob.update({
        where: { id: jobId },
        data: { status: 'failed', errorMessage: 'Failed via Telegram', completedAt: new Date() },
      });
      await ctx.answerCallbackQuery('❌ Failed');
      await ctx.reply('❌ Job marked as failed');
    }

    if (data.startsWith('rj_retry_')) {
      const jobId = data.replace('rj_retry_', '');
      await prisma.renderJob.update({
        where: { id: jobId },
        data: { status: 'queued', errorMessage: null },
      });
      await ctx.answerCallbackQuery('🔄 Queued for retry');
      await ctx.reply('🔄 Job queued for retry');
    }

  } catch (error: any) {
    await ctx.answerCallbackQuery(`Error: ${error.message}`);
    await ctx.reply(`Error: ${error.message}`);
  }
});

// ============================================
// TEXT HANDLER (for direct link submission)
// ============================================

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text.startsWith('/')) return;

  const supportedPlatforms = ['shopee', 'tokopedia', 'lazada', 'tiktok'];
  const isLink = text.startsWith('http') && supportedPlatforms.some(p => text.toLowerCase().includes(p));

  if (isLink) {
    ctx.reply('⏳ Processing link... Generating Phase 2 content...');

    try {
      const slug = `prod_${Date.now()}`;

      const product = await prisma.product.create({
        data: {
          name: 'Product ' + new Date().toLocaleTimeString(),
          slug,
          category: 'Uncategorized',
          price: 0,
          commission: 10,
          commissionAmount: 0,
          affiliatePlatform: detectPlatform(text),
          affiliateLink: text,
          status: 'ACTIVE',
        },
      });

      await prisma.link.create({
        data: {
          slug,
          productId: product.id,
          originalLink: text,
          status: 'ACTIVE',
        },
      });

      const contentPack = await generatePhase2Content({
        productName: product.name,
        productPrice: 0,
        productCategory: 'Uncategorized',
      });

      const content = await prisma.content.create({
        data: {
          productId: product.id,
          contentType: 'PHASE2_FULL',
          platform: 'ALL',
          hook: contentPack.hooks[0],
          caption: contentPack.captions[0],
          hashtags: contentPack.hashtags.slice(0, 30).join(','),
          cta: contentPack.ctas[0],
          telegramText: contentPack.telegramText,
          whatsappText: contentPack.whatsappText,
          tone: 'casual',
          language: 'id',
          status: 'DRAFT',
          approvalStatus: 'PENDING',
        },
      });

      await prisma.qualityScore.create({
        data: {
          contentId: content.id,
          hookScore: contentPack.qualityScores.hookScore,
          clarityScore: contentPack.qualityScores.clarityScore,
          conversionScore: contentPack.qualityScores.conversionScore,
          platformFitScore: contentPack.qualityScores.platformFitScore,
          overallScore: contentPack.qualityScores.overallScore,
          bestHook: contentPack.qualityScores.bestHook,
          bestCaption: contentPack.qualityScores.bestCaption,
          bestCta: contentPack.qualityScores.bestCta,
          bestPlatform: contentPack.qualityScores.bestPlatform,
          shouldPost: contentPack.qualityScores.shouldPost,
          recommendation: contentPack.qualityScores.recommendation,
        },
      });

      await ctx.reply(`✅ Product added & Phase 2 generated!\n\n` +
        `📦 ${product.name}\n` +
        `📈 Score: ${contentPack.qualityScores.overallScore}/100\n` +
        `📝 Hook: ${truncate(contentPack.hooks[0], 80)}\n\n` +
        `ID: \`${content.id}\``,
        { parse_mode: 'Markdown' }
      );

    } catch (error: any) {
      await ctx.reply(`Error: ${error.message}`);
    }
  }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

function detectPlatform(link: string): string {
  const linkLower = link.toLowerCase();
  if (linkLower.includes('shopee')) return 'Shopee';
  if (linkLower.includes('tokopedia')) return 'Tokopedia';
  if (linkLower.includes('lazada')) return 'Lazada';
  if (linkLower.includes('tiktok')) return 'TikTok';
  return 'Other';
}

// ============================================
// START BOT
// ============================================

bot.launch().then(() => {
  console.log('🤖 Telegram Bot Phase 2 started!');
}).catch((error) => {
  console.error('❌ Failed to start bot:', error.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

export default bot;