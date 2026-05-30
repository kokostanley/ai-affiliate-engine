// ============================================
// AI AFFILIATE DISTRIBUTION ENGINE
// Telegram Bot - Full Featured
// ============================================

import { Telegraf, Markup, Context } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { generateContentPack } from '../lib/openai-content';
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
  return text.length > len ? text.substring(0, len) + '...' : text;
}

async function isAdmin(ctx: Context): Promise<boolean> {
  const chatId = ctx.chat?.id.toString();
  return chatId === ADMIN_CHAT_ID || chatId === '5985049933';
}

// ============================================
// COMMANDS
// ============================================

// /start - Welcome message
bot.command('start', async (ctx) => {
  const welcomeText = `
🤖 *AI Affiliate Engine Bot*

Selamat datang! Bot ini membantu Anda mengelola link affiliate dan konten AI.

📋 *Commands:*
• /help - Bantuan
• /products - List produk
• /add [link] - Tambah produk via link
• /status - Status sistem
• /stats - Statistik
• /pending - Konten menunggu approval
• /approve [id] - Approve konten
• /reject [id] - Tolak konten

💡 *Tips:* Kirim link Shopee/TikTok/Tokopedia/Lazada untuk auto-generate konten!
`;

  await ctx.reply(welcomeText, { parse_mode: 'Markdown' });
});

// /help - Help message
bot.command('help', async (ctx) => {
  const helpText = `
📖 *Panduan Penggunaan*

*Menambah Produk:*
1. Kirim command: /add [affiliate_link]
2. Bot akan auto-scrape & generate konten
3. Review & approve konten

*Platform Supported:*
✅ Shopee
✅ TikTok Shop
✅ Tokopedia
✅ Lazada

*Shortcut:*
• Kirim link langsung = auto add
• Ketik nama produk = search

*Status Konten:*
🟡 PENDING - Menunggu review
🟢 APPROVED - Sudah approved
🔴 REJECTED - Ditolak
`;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

// /status - System status
bot.command('status', async (ctx) => {
  try {
    const [products, links, contents, pending, clicks] = await Promise.all([
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.link.count(),
      prisma.content.count(),
      prisma.content.count({ where: { approvalStatus: 'PENDING' } }),
      prisma.link.aggregate({ _sum: { clicks: true } }),
    ]);

    const statusText = `
📊 *System Status*

🛒 Products: ${products} aktif
🔗 Links: ${links} total
📝 Contents: ${contents} total
⏳ Pending: ${pending} menunggu
👆 Total Clicks: ${clicks._sum.clicks || 0}

🟢 Database: Connected
🟢 AI: Configured
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
      include: { links: { select: { clicks: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const statsText = `
📈 *Top Products*

${topProducts.map((p, i) => {
  const clicks = p.links.reduce((sum, l) => sum + l.clicks, 0);
  return `${i + 1}. ${p.name}\n   💰 ${formatPrice(p.price)} | 👆 ${clicks} clicks`;
}).join('\n\n')}
`;

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
      Markup.button.callback(`${p.name.substring(0, 25)}`, `view_${p.id}`)
    ]);

    const listText = `📦 *Daftar Produk (${products.length})*\n\nPilih produk untuk detail:`;

    await ctx.reply(listText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    await ctx.reply('❌ Error fetching products');
  }
});

// /pending - Pending contents
bot.command('pending', async (ctx) => {
  try {
    const pending = await prisma.content.findMany({
      where: { approvalStatus: 'PENDING' },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (pending.length === 0) {
      await ctx.reply('✅ Tidak ada konten menunggu approval.');
      return;
    }

    const buttons = pending.map(c => [
      Markup.button.callback(`📝 ${truncate(c.product.name, 20)}`, `content_${c.id}`)
    ]);

    await ctx.reply(`⏳ *Konten Pending (${pending.length})*\n\nPilih untuk review:`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    await ctx.reply('❌ Error fetching pending');
  }
});

// /add [link] - Add product workflow
bot.command('add', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Kirim format: /add [affiliate_link]\n\nContoh: /add https://shopee.co.id/product/12345');
    return;
  }

  const link = args.trim();

  // Validate basic URL
  if (!link.startsWith('http')) {
    await ctx.reply('❌ Link tidak valid. Pastikan dimulai dengan http:// atau https://');
    return;
  }

  // Check supported platforms
  const supportedPlatforms = ['shopee', 'tokopedia', 'lazada', 'tiktok'];
  const isSupported = supportedPlatforms.some(p => link.toLowerCase().includes(p));

  if (!isSupported) {
    await ctx.reply('⚠️ Platform belum didukung.\n\nSupported: Shopee, Tokopedia, Lazada, TikTok');
    return;
  }

  await ctx.reply('⏳ Processing...');

  try {
    // Create product
    const slug = `prod_${Date.now()}`;

    const product = await prisma.product.create({
      data: {
        name: 'New Product ' + new Date().toLocaleTimeString(),
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

    // Generate AI content
    const contentPack = await generateContentPack({
      productName: 'New Product',
      productPrice: 0,
      productCategory: 'Uncategorized',
    });

    // Save content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'MIXED_CONTENT',
        platform: 'ALL',
        hook: contentPack.hooks[0],
        caption: contentPack.captions[0],
        hashtags: contentPack.hashtags.slice(0, 15).join(' '),
        cta: contentPack.ctas[0],
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: 'casual',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    const successText = `
✅ *Produk Ditambahkan!*

📦 *Nama:* ${product.name}
🔗 *Link:* ${link}
🏪 *Platform:* ${product.affiliatePlatform}

📝 *Konten Generated:*
${truncate(contentPack.hooks[0], 100)}

⏳ Status: Menunggu approval
ID: \`${content.id}\`

Ketik /approve ${content.id} untuk approve
`;

    await ctx.reply(successText, { parse_mode: 'Markdown' });

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
        approvedBy: ctx.from.username || ctx.from.first_name,
      },
    });

    await ctx.reply(`✅ Content approved!\n\nID: ${content.id}\nProduct: ${content.productId}`);

    // Log approval
    await prisma.approvalLog.create({
      data: {
        contentId: content.id,
        action: 'APPROVED',
        actionBy: ctx.from.username || 'unknown',
        notes: 'Approved via Telegram bot',
      },
    });

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

    await ctx.reply(`❌ Content rejected!\n\nID: ${content.id}\nAlasan: ${reason}`);

  } catch (error) {
    await ctx.reply('❌ Content tidak ditemukan');
  }
});

// /generate [productId] - Regenerate content
bot.command('generate', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    await ctx.reply('📎 Format: /generate [product_id]');
    return;
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: args } });
    if (!product) {
      await ctx.reply('❌ Produk tidak ditemukan');
      return;
    }

    await ctx.reply('⏳ Generating content...');

    const contentPack = await generateContentPack({
      productName: product.name,
      productDescription: product.description || '',
      productPrice: Number(product.price),
      productCategory: product.category,
    });

    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'MIXED_CONTENT',
        platform: 'ALL',
        hook: contentPack.hooks[0],
        caption: contentPack.captions[0],
        hashtags: contentPack.hashtags.slice(0, 15).join(' '),
        cta: contentPack.ctas[0],
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: 'casual',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    await ctx.reply(`✅ Content generated!\n\nHook: ${truncate(contentPack.hooks[0], 80)}\n\nID: ${content.id}`);

  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /regenerate [productId] - Regenerate all content for product
bot.command('regenerate', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ');

  if (!args) {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      take: 5,
    });

    const buttons = products.map(p => [
      Markup.button.callback(p.name.substring(0, 30), `regen_${p.id}`)
    ]);

    await ctx.reply('📦 Pilih produk untuk regenerate:', {
      ...Markup.inlineKeyboard(buttons)
    });
    return;
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: args } });
    if (!product) {
      await ctx.reply('❌ Produk tidak ditemukan');
      return;
    }

    await ctx.reply('⏳ Regenerating content...');

    const contentPack = await generateContentPack({
      productName: product.name,
      productDescription: product.description || '',
      productPrice: Number(product.price),
      productCategory: product.category,
    });

    await prisma.content.updateMany({
      where: { productId: args, approvalStatus: 'PENDING' },
      data: { approvalStatus: 'REGENERATED' },
    });

    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'MIXED_CONTENT',
        platform: 'ALL',
        hook: contentPack.hooks[0],
        caption: contentPack.captions[0],
        hashtags: contentPack.hashtags.slice(0, 15).join(' '),
        cta: contentPack.ctas[0],
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: 'casual',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    await ctx.reply(`🔄 Content regenerated!\n\nNew Hook: ${truncate(contentPack.hooks[0], 80)}\n\nID: ${content.id}`);

  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ============================================
// CALLBACK HANDLERS
// ============================================

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  try {
    // View product
    if (data.startsWith('view_')) {
      const productId = data.replace('view_', '');
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { links: true, contents: true },
      });

      if (product) {
        const text = `
📦 *Product Detail*

*Nama:* ${product.name}
*Kategori:* ${product.category}
*Harga:* ${formatPrice(product.price)}
*Komisi:* ${product.commission}%

*Platform:* ${product.affiliatePlatform}
*Link:* ${product.affiliateLink}

*Stats:*
• Links: ${product.links.length}
• Contents: ${product.contents.length}
• Status: ${product.status}
`;
        await ctx.reply(text, { parse_mode: 'Markdown' });
      }
    }

    // View content
    if (data.startsWith('content_')) {
      const contentId = data.replace('content_', '');
      const content = await prisma.content.findUnique({
        where: { id: contentId },
        include: { product: true },
      });

      if (content) {
        const text = `
📝 *Content Detail*

*Product:* ${content.product.name}
*Type:* ${content.contentType}
*Platform:* ${content.platform}
*Tone:* ${content.tone}

*Hook:*
${content.hook}

*Caption:*
${truncate(content.caption, 200)}

*Hashtags:*
${content.hashtags}

*CTA:*
${content.cta}
`;
        await ctx.reply(text, { parse_mode: 'Markdown',
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

    // Approve from callback
    if (data.startsWith('appr_')) {
      const contentId = data.replace('appr_', '');
      await prisma.content.update({
        where: { id: contentId },
        data: { approvalStatus: 'APPROVED', approvedAt: new Date() },
      });
      await ctx.reply('✅ Approved!');
    }

    // Reject from callback
    if (data.startsWith('rejt_')) {
      const contentId = data.replace('rejt_', '');
      await prisma.content.update({
        where: { id: contentId },
        data: { approvalStatus: 'REJECTED', rejectedAt: new Date() },
      });
      await ctx.reply('❌ Rejected!');
    }

    // Regenerate from callback
    if (data.startsWith('regen_')) {
      const productId = data.replace('regen_', '');
      await ctx.reply('⏳ Generating...');

      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (product) {
        const contentPack = await generateContentPack({
          productName: product.name,
          productPrice: Number(product.price),
          productCategory: product.category,
        });

        await prisma.content.create({
          data: {
            productId: product.id,
            contentType: 'MIXED_CONTENT',
            platform: 'ALL',
            hook: contentPack.hooks[0],
            caption: contentPack.captions[0],
            hashtags: contentPack.hashtags.slice(0, 15).join(' '),
            cta: contentPack.ctas[0],
            telegramText: contentPack.telegramText,
            status: 'DRAFT',
            approvalStatus: 'PENDING',
          },
        });

        await ctx.reply(`✅ Content regenerated!\n\nHook: ${truncate(contentPack.hooks[0], 80)}`);
      }
    }

    ctx.answerCallbackQuery();

  } catch (error: any) {
    await ctx.reply(`Error: ${error.message}`);
    ctx.answerCallbackQuery();
  }
});

// ============================================
// TEXT HANDLER (for direct link submission)
// ============================================

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Skip if it's a command
  if (text.startsWith('/')) return;

  // Check if it's a valid affiliate link
  const supportedPlatforms = ['shopee', 'tokopedia', 'lazada', 'tiktok'];
  const isLink = text.startsWith('http') && supportedPlatforms.some(p => text.toLowerCase().includes(p));

  if (isLink) {
    ctx.reply('⏳ Processing link...');

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

      const contentPack = await generateContentPack({
        productName: 'New Product',
        productPrice: 0,
        productCategory: 'Uncategorized',
      });

      const content = await prisma.content.create({
        data: {
          productId: product.id,
          contentType: 'MIXED_CONTENT',
          platform: 'ALL',
          hook: contentPack.hooks[0],
          caption: contentPack.captions[0],
          hashtags: contentPack.hashtags.slice(0, 15).join(' '),
          cta: contentPack.ctas[0],
          telegramText: contentPack.telegramText,
          whatsappText: contentPack.whatsappText,
          tone: 'casual',
          language: 'id',
          status: 'DRAFT',
          approvalStatus: 'PENDING',
        },
      });

      await ctx.reply(`✅ Product & content created!\n\nHook: ${truncate(contentPack.hooks[0], 80)}\n\nID: ${content.id}`);
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
  console.log('🤖 Telegram Bot started!');
  console.log(`📱 Bot token: ${BOT_TOKEN.substring(0, 10)}...`);
}).catch((error) => {
  console.error('❌ Failed to start bot:', error.message);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

export default bot;