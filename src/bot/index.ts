// ============================================
// AI AFFILIATE DISTRIBUTION ENGINE
// Telegram Bot - Grammy (Migrated from Telegraf)
// ============================================

import { Bot, Context, GrammyError, HttpError } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { generatePhase2Content } from '../lib/openai-content';
import 'dotenv/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ============================================
// STARTUP VALIDATION - CRITICAL
// ============================================

function validateEnvironment() {
  const errors: string[] = [];

  // Required environment variables
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    errors.push('TELEGRAM_BOT_TOKEN is required');
  }

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  // AI Configuration
  if (!process.env.AI_API_KEY || process.env.AI_API_KEY === 'dummy_key' || process.env.AI_API_KEY === 'dummy_token') {
    console.warn('⚠️ AI_API_KEY not configured - using placeholder content');
  }

  // Zernio keys (at least one should be configured)
  const zernioKeys = [
    process.env.ZERNIO_CEPAT_KEY_1,
    process.env.ZERNIO_CEPAT_KEY_2,
    process.env.ZERNIO_CRYPTO_KEY_1,
    process.env.ZERNIO_CRYPTO_KEY_2,
  ].filter(Boolean);

  if (zernioKeys.length === 0) {
    console.warn('⚠️ No Zernio API keys configured - distribution will fail');
  }

  if (errors.length > 0) {
    console.error('❌ STARTUP VALIDATION FAILED:');
    errors.forEach(e => console.error('   - ' + e));
    throw new Error('Missing required environment variables: ' + errors.join(', '));
  }

  console.log('✅ Environment validation passed');
}

validateEnvironment();

// ============================================
// CONFIG
// ============================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// ============================================
// RATE LIMITING - SECURITY FIX
// ============================================

interface RateLimitEntry {
  count: number;
  firstRequest: number;
  burstCount: number;
  burstStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Rate limit: 30 commands per minute, burst of 10
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_BURST = 10;
const RATE_LIMIT_BURST_WINDOW = 5000; // 5 seconds

function checkRateLimit(telegramId: string): { allowed: boolean; retryAfter?: number; message?: string } {
  const now = Date.now();
  const entry = rateLimitMap.get(telegramId);

  // Check burst limit first (prevents spam)
  if (entry) {
    // Reset burst if window expired
    if (now - entry.burstStart > RATE_LIMIT_BURST_WINDOW) {
      entry.burstCount = 0;
      entry.burstStart = now;
    }

    // Check burst limit
    if (entry.burstCount >= RATE_LIMIT_BURST) {
      const retryAfter = Math.ceil((RATE_LIMIT_BURST_WINDOW - (now - entry.burstStart)) / 1000);
      return {
        allowed: false,
        retryAfter,
        message: `⏳ Rate limit exceeded. Slow down! Try again in ${retryAfter}s.\n\n(You can send ${RATE_LIMIT_MAX} commands/minute)`,
      };
    }

    // Check sliding window limit
    if (now - entry.firstRequest < RATE_LIMIT_WINDOW) {
      if (entry.count >= RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - entry.firstRequest)) / 1000);
        return {
          allowed: false,
          retryAfter,
          message: `⏳ Too many commands! Please wait ${retryAfter}s before trying again.\n\nLimit: ${RATE_LIMIT_MAX} commands/minute`,
        };
      }
      entry.count++;
      entry.burstCount++;
    } else {
      // Reset window
      entry.count = 1;
      entry.firstRequest = now;
      entry.burstCount++;
      entry.burstStart = now;
    }
  } else {
    rateLimitMap.set(telegramId, {
      count: 1,
      firstRequest: now,
      burstCount: 1,
      burstStart: now,
    });
  }

  return { allowed: true };
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.firstRequest > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 300000);

console.log('✅ Rate limiting enabled: ' + RATE_LIMIT_MAX + '/min, burst ' + RATE_LIMIT_BURST);

// ============================================
// INPUT LENGTH LIMITS - SECURITY FIX
// ============================================

const MAX_LINK_LENGTH = 2000;
const MAX_COMMAND_ARGS = 500;

function validateInputLength(input: string, maxLength: number, type: string): string | null {
  if (input.length > maxLength) {
    return `❌ ${type} too long (max ${maxLength} chars). Your input: ${input.length} chars.`;
  }
  return null;
}

// ============================================
// BOT INSTANCE (Grammy)
// ============================================

const prisma = new PrismaClient();
const bot = new Bot(BOT_TOKEN);

// ============================================
// LOGGING HELPERS
// ============================================

function logInfo(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ℹ️ ${message}`, data || '');
}

function logError(message: string, error?: any) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ❌ ${message}`, error || '');
}

function logDebug(message: string, data?: any) {
  if (process.env.DEBUG === 'true') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔍 ${message}`, data || '');
  }
}

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

function detectPlatform(link: string): string {
  const linkLower = link.toLowerCase();
  if (linkLower.includes('shopee')) return 'Shopee';
  if (linkLower.includes('tokopedia')) return 'Tokopedia';
  if (linkLower.includes('lazada')) return 'Lazada';
  if (linkLower.includes('tiktok')) return 'TikTok';
  return 'Other';
}

/**
 * Runtime verification - logs all incoming commands
 */
function logCommand(cmd: string, args: string, chatId: string) {
  console.log(`[CMD] ${cmd} | args: "${args}" | chat: ${chatId}`);
}

/**
 * Safe reply - strips Markdown special chars that cause parse errors
 * Telegram Markdown: * _ ` [ ] ( ) ~ ` > # + - = | { } . !
 */
function safeReply(ctx: any, text: string, options?: any) {
  // Characters that break Telegram Markdown
  const unsafe = /[_*`\[\]()~>#+\-=|{}.!]/g;
  // Only strip if parse_mode is Markdown
  if (options?.parse_mode === 'Markdown') {
    // Escape underscores and special chars in content
    const safeText = text.replace(/_/g, '\\_').replace(/\*/g, '\\*');
    return ctx.reply(safeText, options).catch((e: any) => {
      // Fallback: send without markdown
      console.log('[safeReply] Markdown failed, sending plain:', e.message);
      return ctx.reply(text, { parse_mode: undefined }).catch(() => {
        // Last resort: truncated plain text
        return ctx.reply(text.substring(0, 4096));
      });
    });
  }
  return ctx.reply(text, options);
}

// ============================================
// ERROR HANDLER
// ============================================

bot.catch((err) => {
  const ctx = err.ctx;
  logError(`Error on update ${ctx.update.update_id}`, err.error);
  if (err.error instanceof GrammyError) {
    ctx.reply(`Error: ${err.error.description}`);
  } else if (err.error instanceof HttpError) {
    ctx.reply(`HTTP error: ${err.error.message}`);
  } else {
    ctx.reply(`Unknown error: ${err.error.message}`);
  }
});

// ============================================
// COMMANDS
// ============================================

// /start - Welcome message
bot.command('start', async (ctx) => {
  const welcomeText = `
🤖 *AI Affiliate Engine Bot*

Selamat datang! Bot ini membantu Anda mengelola link affiliate dan konten AI Phase 2.

📋 *Commands:*
• /brand - List atau pilih brand aktif
• /currentbrand - Lihat brand aktif
• /products - List produk
• /add [link] - Tambah produk via link
• /generate2 [productId] - Generate Phase 2 content
• /status - Status sistem
• /stats - Statistik
• /pending - Konten menunggu approval
• /view [id] - Lihat detail konten
• /ping - Test bot

💡 *Tips:* Pilih brand dulu dengan /brand, lalu kirim link affiliate!

*Platforms:* Shopee, TikTok, Tokopedia, Lazada, Blibli, Bukalapak
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

// /ping - Test bot connectivity
bot.command('ping', async (ctx) => {
  await ctx.reply('🏓 Pong! Bot is responsive and running.');
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
🟢 Bot: Running (Grammy)
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

    let text = `📦 *Daftar Produk (${products.length})*\n\n`;
    products.forEach((p, i) => {
      text += `${i + 1}. ${truncate(p.name, 30)}\n   ${formatPrice(p.price)} | 📝 ${p._count.contents}\n\n`;
    });

    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply('❌ Error fetching products');
  }
});

// /pending - Pending contents
bot.command('pending', async (ctx) => {
  try {
    const pending = await prisma.content.findMany({
      where: { approvalStatus: 'PENDING' },
      include: {
        product: { select: { name: true } },
        qualityScores: true,
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
      const score = c.qualityScores?.[0]?.overallScore || 0;
      const variants = c._count.contentVariants;
      const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';

      message += `${emoji} *${truncate(c.product.name, 20)}*\n`;
      message += `   📝 ${variants} variants | Score: ${score}/100\n`;
      message += `   ID: \`${c.id.substring(0, 8)}...\`\n\n`;
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: pending.slice(0, 5).map(c => [
          { text: `📝 ${truncate(c.product.name, 20)}`, callback_data: `view_${c.id}` }
        ])
      }
    });
  } catch (error) {
    await ctx.reply('❌ Error fetching pending');
  }
});

// /brand - Brand selection
bot.command('brand', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
  const telegramId = String(ctx.from?.id);

  const brands = await prisma.brand.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
  });

  if (brands.length === 0) {
    await ctx.reply('❌ Tidak ada brand yang tersedia.');
    return;
  }

  if (!args) {
    const session = await prisma.telegramSession.findUnique({ where: { telegramId } });

    let message = '🏢 *Brand Selection*\n\nPilih brand untuk sesi ini:\n\n';

    for (let i = 0; i < brands.length; i++) {
      const brand = brands[i];
      const isActive = session?.activeBrandId === brand.id;
      const indicator = isActive ? ' ✅' : '';
      message += `${i + 1}. *${brand.name}*${indicator}\n`;
      message += `   /brand ${brand.slug}\n\n`;
    }

    if (session?.activeBrandSlug) {
      message += `📌 Brand aktif: *${session.activeBrandSlug}*\n`;
    } else {
      message += `⚠️ Belum ada brand aktif.`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
    return;
  }

  const brandSlug = args.toLowerCase();
  const brand = brands.find(b => b.slug === brandSlug);

  if (!brand) {
    await ctx.reply(`❌ Brand "${args}" tidak ditemukan.\n\nBrand tersedia:\n${brands.map(b => `• ${b.name} (/brand ${b.slug})`).join('\n')}`);
    return;
  }

  await prisma.telegramSession.upsert({
    where: { telegramId },
    create: {
      telegramId,
      activeBrandId: brand.id,
      activeBrandSlug: brand.slug,
      state: 'ACTIVE',
    },
    update: {
      activeBrandId: brand.id,
      activeBrandSlug: brand.slug,
    },
  });

  const accountCount = await prisma.socialAccount.count({
    where: { brandId: brand.id, status: 'ACTIVE' },
  });

  await ctx.reply(`✅ Brand *${brand.name}* diatur sebagai aktif.\n\n` +
    `📊 ${accountCount} akun sosial\n` +
    `Gunakan /add untuk menambahkan produk dengan brand ini.`,
    { parse_mode: 'Markdown' }
  );
});

// /currentbrand - Show active brand
bot.command('currentbrand', async (ctx) => {
  const telegramId = String(ctx.from?.id);
  const session = await prisma.telegramSession.findUnique({ where: { telegramId } });

  if (!session?.activeBrandId) {
    await ctx.reply('⚠️ Belum ada brand aktif.\n\nGunakan /brand untuk memilih brand:\n/brand cepatdapat\n/brand crypto-ew');
    return;
  }

  const brand = await prisma.brand.findUnique({ where: { id: session.activeBrandId } });

  if (!brand) {
    await ctx.reply('❌ Brand aktif tidak ditemukan.');
    return;
  }

  const zernioCount = await prisma.zernioConfig.count({
    where: { brandId: brand.id, isActive: true },
  });

  const accountCount = await prisma.socialAccount.count({
    where: { brandId: brand.id, status: 'ACTIVE' },
  });

  await ctx.reply(`📌 *Brand Aktif*\n\n` +
    `🏢 *${brand.name}*\n` +
    `📊 Zernio Keys: ${zernioCount}\n` +
    `📱 Akun Sosial: ${accountCount}\n` +
    `📋 Slug: \`${brand.slug}\``,
    { parse_mode: 'Markdown' }
  );
});

// /view [id] - View content details with full breakdown
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
        qualityScores: true,
        contentVariants: { orderBy: { variantIndex: 'asc' } },
        videoPrompts: true,
        imagePrompts: true,
      },
    });

    if (!content) {
      await ctx.reply('❌ Content tidak ditemukan.');
      return;
    }

    const quality = content.qualityScores?.[0];
    const hooks = content.contentVariants.filter(v => v.variantType === 'HOOK');
    const captions = content.contentVariants.filter(v => v.variantType === 'CAPTION');
    const ctas = content.contentVariants.filter(v => v.variantType === 'CTA');
    const pippitPrompt = content.videoPrompts?.find(p => p.tool === 'PIPPIT');
    const higgsfieldPrompt = content.videoPrompts?.find(p => p.tool?.toUpperCase().includes('HIGGSFIELD'));
    const imagePrompt = content.imagePrompts?.[0];

    // Build messages array for splitting
    const messages: string[] = [];

    // Message 1: Basic Info & Status
    let msg1 = `📝 *Content Detail*\n\n`;
    msg1 += `📦 *Product:* ${content.product.name}\n`;
    msg1 += `💰 *Harga:* ${formatPrice(content.product.price)}\n`;
    msg1 += `🏪 *Platform:* ${content.product.affiliatePlatform}\n`;
    msg1 += `📋 *Status:* ${content.approvalStatus}\n`;
    msg1 += `🆔 ID: \`${content.id.substring(0, 12)}...\`\n`;
    messages.push(msg1);

    // Message 2: Quality Scores
    if (quality) {
      let msg2 = `📈 *Quality Scores*\n\n`;
      msg2 += `⭐ Overall: *${quality.overallScore}/100*\n`;
      msg2 += `🎣 Hook: ${quality.hookScore}/100\n`;
      msg2 += `🔍 Clarity: ${quality.clarityScore}/100\n`;
      msg2 += `💰 Conversion: ${quality.conversionScore}/100\n`;
      msg2 += `📱 Platform Fit: ${quality.platformFitScore}/100\n`;
      msg2 += `\n🎯 Best Platform: ${quality.bestPlatform || 'N/A'}\n`;
      msg2 += `📋 ${quality.shouldPost ? '✅' : '⚠️'} ${quality.recommendation || ''}`;
      messages.push(msg2);
    }

    // Message 3: Best Hook
    if (quality?.bestHook || hooks[0]) {
      let msg3 = `🎣 *Best Hook*\n\n`;
      msg3 += `\`\`\`\n${truncate(quality?.bestHook || hooks[0]?.contentValue || '', 500)}\n\`\`\``;
      messages.push(msg3);
    }

    // Message 4: Best Caption
    if (quality?.bestCaption || captions[0]) {
      let msg4 = `📄 *Best Caption*\n\n`;
      msg4 += `\`\`\`\n${truncate(quality?.bestCaption || captions[0]?.contentValue || '', 500)}\n\`\`\``;
      messages.push(msg4);
    }

    // Message 5: Best CTA
    if (quality?.bestCta || ctas[0]) {
      let msg5 = `🎯 *Best CTA*\n\n`;
      msg5 += `\`\`\`\n${quality?.bestCta || ctas[0]?.contentValue || 'N/A'}\n\`\`\``;
      messages.push(msg5);
    }

    // Message 6: Hashtags
    if (content.hashtags) {
      let msg6 = `#️⃣ *Hashtags*\n\n`;
      msg6 += `\`\`\`\n${content.hashtags}\n\`\`\``;
      messages.push(msg6);
    }

    // Message 7: Pippit Video Prompt
    if (pippitPrompt) {
      let msg7 = `🎬 *Pippit Video Prompt*\n\n`;
      msg7 += `\`\`\`\n${truncate(pippitPrompt.prompt, 400)}\n\`\`\``;
      if (pippitPrompt.duration) msg7 += `\n⏱️ Duration: ${pippitPrompt.duration}s`;
      if (pippitPrompt.format) msg7 += ` | 📐 Format: ${pippitPrompt.format}`;
      messages.push(msg7);
    }

    // Message 8: Higgsfield Video Prompt
    if (higgsfieldPrompt) {
      let msg8 = `🎥 *Higgsfield Video Prompt*\n\n`;
      msg8 += `\`\`\`\n${truncate(higgsfieldPrompt.prompt, 400)}\n\`\`\``;
      if (higgsfieldPrompt.duration) msg8 += `\n⏱️ Duration: ${higgsfieldPrompt.duration}s`;
      messages.push(msg8);
    }

    // Message 9: Image Prompt
    if (imagePrompt) {
      let msg9 = `🖼️ *Image Prompt*\n\n`;
      msg9 += `Type: ${imagePrompt.imageType || 'N/A'}\n`;
      msg9 += `\`\`\`\n${truncate(imagePrompt.prompt, 300)}\n\`\`\``;
      if (imagePrompt.textOverlay) msg9 += `\n📝 Overlay: ${imagePrompt.textOverlay}`;
      messages.push(msg9);
    }

    // Message 10: Carousel Outline (if available)
    if (captions.length > 1) {
      let msg10 = `🎠 *Carousel Outline*\n\n`;
      captions.slice(0, 5).forEach((cap, i) => {
        msg10 += `${i + 1}. ${truncate(cap.contentValue, 100)}\n\n`;
      });
      messages.push(msg10);
    }

    // Send messages with delays to avoid rate limiting
    for (let i = 0; i < messages.length; i++) {
      await ctx.reply(messages[i], { parse_mode: 'Markdown' });
      // Small delay between messages to avoid flood
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Send action buttons
    await ctx.reply('Actions:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `appr_${content.id}` },
            { text: '❌ Reject', callback_data: `rejt_${content.id}` },
          ],
          [
            { text: '📝 View Details', callback_data: `view_${content.id}` },
          ]
        ]
      }
    });

  } catch (error: any) {
    console.error('Error in /view command:', error);
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
      },
      include: { product: true },
    });

    await prisma.approvalLog.create({
      data: {
        contentId: content.id,
        action: 'APPROVED',
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
    await prisma.content.update({
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
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (packages.length === 0) {
      await ctx.reply('📦 No production packages yet.');
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

    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply('❌ Error fetching production packages');
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
      await ctx.reply('🎬 No render jobs yet.');
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
      text += `   Status: ${job.status}\n\n`;
    }

    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (error) {
    await ctx.reply('❌ Error fetching render jobs');
  }
});

// ============================================
// SINGLE COMMAND INTAKE WORKFLOW
// /add [link] - AUTO: Scrape → Product → AI Content → Auto-Approve → Generate → Zernio
// ============================================

/**
 * Complete /add workflow with scraping and AI content generation
 */
bot.command('add', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

  logCommand('/add', args, String(ctx.from?.id));
  if (!args) {
    await safeReply(ctx, `IMAGE AUTO-POST

Usage:
/add [affiliate_link]

Example:
/add https://shopee.co.id/product/12345

Flow (automatic):
1. Scrapes product info from link
2. Generates AI content (hooks, captions, CTAs, scripts)
3. Creates quality scores
4. Auto-approves
5. Generates image (DALL-E)
6. Uploads to Google Drive
7. Creates Zernio draft

Just send the link!`);
    return;
  }

  const telegramId = String(ctx.from?.id);

  // ============================================
  // RATE LIMIT CHECK
  // ============================================
  const rateCheck = checkRateLimit(telegramId);
  if (!rateCheck.allowed) {
    await safeReply(ctx, rateCheck.message || 'Rate limit exceeded');
    return;
  }

  const session = await prisma.telegramSession.findUnique({ where: { telegramId } });

  if (!session?.activeBrandId) {
    await safeReply(ctx, `Brand belum dipilih

/brand cepatdapat`);
    return;
  }

  const brand = await prisma.brand.findUnique({ where: { id: session.activeBrandId } });

  if (!brand) {
    await safeReply(ctx, `Brand tidak ditemukan.`);
    return;
  }

  const link = args.startsWith('http') ? args : null;
  if (!link) {
    await safeReply(ctx, `Invalid link. Use: /add [affiliate_link]`);
    return;
  }

  // Validate input length
  const lengthError = validateInputLength(link, MAX_LINK_LENGTH, 'Link');
  if (lengthError) {
    await safeReply(ctx, lengthError);
    return;
  }

  await safeReply(ctx, `⏳ Processing link...

1. Scraping product info...`);

  try {
    // === STEP 1: SCRAPE PRODUCT INFO ===
    const { scrapeProduct, isValidAffiliateLink, detectPlatform: detectPlatformFromLink } = await import('../scraper');

    // Validate link first
    if (!isValidAffiliateLink(link)) {
      await safeReply(ctx, `❌ Invalid affiliate link. Supported: Shopee, TikTok, Tokopedia, Lazada, Blibli, Bukalapak`);
      return;
    }

    // Scrape product details
    let scrapedProduct;
    try {
      scrapedProduct = await scrapeProduct(link);
      console.log('[Add] Scraped product:', scrapedProduct.name, 'Price:', scrapedProduct.price);

      // Validate scraped data - require valid product info
      if (!scrapedProduct.name || scrapedProduct.name === 'Product') {
        await safeReply(ctx, `❌ Could not extract product name from link. Please try a different link.`);
        return;
      }

      if (!scrapedProduct.price || scrapedProduct.price === 0) {
        await safeReply(ctx, `⚠️ Product found but price is missing or zero. Please try a different link.`);
        return;
      }
    } catch (scrapeError) {
      console.error('[Add] Scrape error:', scrapeError);
      await safeReply(ctx, `❌ Failed to scrape product. Please verify the link is valid and accessible.`);
      return;
    }

    const platform = scrapedProduct.platform || detectPlatformFromLink(link);
    const slug = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // === STEP 2: REUSE EXISTING PRODUCT OR CREATE NEW ===
    let product = await prisma.product.findFirst({ where: { affiliateLink: link } });
    let isNewProduct = false;

    if (product) {
      console.log('[Add] Reusing existing product:', product.id, product.name);
      // Update price/image if scraped data is better
      if (scrapedProduct.price > 0 && product.price === 0) {
        product = await prisma.product.update({
          where: { id: product.id },
          data: {
            price: scrapedProduct.price,
            commissionAmount: scrapedProduct.price * 0.1,
            imageUrl: scrapedProduct.imageUrl || product.imageUrl,
          },
        });
        console.log('[Add] Updated product price:', product.price);
      }
    } else {
      product = await prisma.product.create({
        data: {
          name: scrapedProduct.name || 'Product',
          slug,
          category: scrapedProduct.category || 'Uncategorized',
          price: scrapedProduct.price || 0,
          commission: 10,
          commissionAmount: (scrapedProduct.price || 0) * 0.1,
          affiliatePlatform: scrapedProduct.platformDisplay || platform,
          affiliateLink: link,
          imageUrl: scrapedProduct.imageUrl || null,
          description: scrapedProduct.description || null,
          status: 'ACTIVE',
        },
      });
      isNewProduct = true;
      console.log('[Add] Product created:', product.id);

      // === STEP 3: CREATE LINK ===
      await prisma.link.create({
        data: { slug, productId: product.id, originalLink: link, status: 'ACTIVE' },
      });
    }

    // === STEP 4: CREATE TRACKING RECORD ===
    let trackingId = null;
    let shortCode = null;
    try {
      const { createTrackingRecord, generateShortCode } = await import('../services/link-tracking');
      shortCode = generateShortCode();
      const trackingResult = await createTrackingRecord({
        productId: product.id,
        brandId: brand.id,
        originalLink: link,
        shortCode,
        platform: 'INSTAGRAM',
        contentType: 'IMAGE',
        provider: 'OPENAI_IMAGE',
        utmSource: 'telegram',
        utmMedium: 'bot',
        utmCampaign: brand.slug + '_image',
      });
      if (trackingResult.success && trackingResult.tracking) {
        trackingId = trackingResult.tracking.id;
        console.log('[Add] Tracking record created:', trackingId);
      }
    } catch (trackingError) {
      console.error('[Add] Failed to create tracking record:', trackingError);
    }

    // === STEP 5: GENERATE AI CONTENT ===
    await safeReply(ctx, `2. Generating AI content...`);

    const { generatePhase2Content } = await import('../lib/openai-content');
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: scrapedProduct.description || '',
      productPrice: scrapedProduct.price || 0,
      productCategory: scrapedProduct.category,
      platform: 'ALL',
    });
    console.log('[Add] AI content generated:', contentPack.hooks.length, 'hooks,', contentPack.captions.length, 'captions');

    // === STEP 6: CREATE CONTENT WITH VARIANTS ===
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_IMAGE',
        platform: 'ALL',
        hook: contentPack.hooks[0] || '',
        caption: contentPack.captions[0] || '',
        script: contentPack.scripts[0] || '',
        hashtags: contentPack.hashtags.slice(0, 30).join(','),
        cta: contentPack.ctas[0] || '',
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        status: 'DRAFT',
        approvalStatus: 'PENDING',
        tone: 'casual',
        language: 'id',
      },
    });
    console.log('[Add] Content created:', content.id);

    // === STEP 7: CREATE CONTENT VARIANTS ===
    // Create hooks (up to 20)
    for (let i = 0; i < Math.min(contentPack.hooks.length, 20); i++) {
      await prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'HOOK',
          variantIndex: i,
          contentValue: contentPack.hooks[i],
        },
      });
    }

    // Create captions (up to 10)
    for (let i = 0; i < Math.min(contentPack.captions.length, 10); i++) {
      await prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'CAPTION',
          variantIndex: i,
          contentValue: contentPack.captions[i],
        },
      });
    }

    // Create CTAs (up to 5)
    for (let i = 0; i < Math.min(contentPack.ctas.length, 5); i++) {
      await prisma.contentVariant.create({
        data: {
          contentId: content.id,
          variantType: 'CTA',
          variantIndex: i,
          contentValue: contentPack.ctas[i],
        },
      });
    }
    console.log('[Add] Content variants created');

    // === STEP 8: CREATE QUALITY SCORES ===
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        hookScore: contentPack.qualityScores.hookScore,
        overallScore: contentPack.qualityScores.overallScore,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        recommendation: contentPack.qualityScores.recommendation,
        shouldPost: contentPack.qualityScores.shouldPost,
      },
    });
    console.log('[Add] Quality scores created');

    // === STEP 9: CREATE VIDEO/IMAGE PROMPTS ===
    // Video prompts
    for (const vp of contentPack.videoPrompts) {
      await prisma.videoPrompt.create({
        data: {
          productId: product.id,
          contentId: content.id,
          tool: vp.tool,
          prompt: vp.prompt,
          duration: vp.duration,
          format: vp.format,
          hook: vp.hook,
          voiceOver: vp.voiceOver,
          sceneBreakdown: vp.sceneBreakdown,
          onScreenText: vp.onScreenText,
          suggestedMusic: vp.suggestedMusic,
          status: 'DRAFT',
        },
      });
    }

    // Image prompts
    for (const ip of contentPack.imagePrompts) {
      await prisma.imagePrompt.create({
        data: {
          productId: product.id,
          contentId: content.id,
          imageType: ip.imageType,
          prompt: ip.prompt,
          layout: ip.layout,
          background: ip.background,
          visualMood: ip.visualMood,
          productPlacement: ip.productPlacement,
          textOverlay: ip.textOverlay,
          status: 'DRAFT',
        },
      });
    }
    console.log('[Add] Video/image prompts created');

    // === STEP 10: UPDATE TRACKING STAGE ===
    if (trackingId) {
      try {
        const { updatePipelineStage } = await import('../services/link-tracking');
        await updatePipelineStage(trackingId, 'CONTENT_GENERATED', 'Content and variants generated via /add');
      } catch (e) {
        console.error('[Add] Failed to update tracking stage:', e);
      }
    }

    // === STEP 11: AUTO-APPROVE AND TRIGGER PIPELINE ===
    await safeReply(ctx, `3. Auto-approving and generating image...`);

    const { executeApprovalPipeline } = await import('../services/approval-pipeline');
    const result = await executeApprovalPipeline(content.id, {
      autoApprove: true,
      provider: 'OPENAI_IMAGE',
      platform: 'INSTAGRAM',
      brandId: brand.id,
    });

    // Get tracking info if distribution was created
    let trackingInfo = null;
    if (result.distributionId) {
      const { getTrackingByDistributionId } = await import('../services/link-tracking');
      trackingInfo = await getTrackingByDistributionId(result.distributionId);
    }

    // Build detailed response
    let response = `✅ *ADD WORKFLOW COMPLETE*

📦 *Product:* ${product.name}
💰 *Price:* Rp ${(scrapedProduct.price || 0).toLocaleString('id-ID')}
🏪 *Platform:* ${scrapedProduct.platformDisplay || platform}
🏢 *Brand:* ${brand.name}

📊 *Content Generated:*
• Hooks: ${contentPack.hooks.length}
• Captions: ${contentPack.captions.length}
• CTAs: ${contentPack.ctas.length}
• Scripts: ${contentPack.scripts.length}
• Hashtags: ${contentPack.hashtags.length}
• Quality Score: ${contentPack.qualityScores.overallScore}/100

`;
    for (const step of result.steps) {
      response += step + '\n';
    }

    if (result.productionPackageId) {
      response += `\n📦 *Package:* \`${result.productionPackageId.substring(0, 12)}...\``;
    }

    if (result.renderJobIds?.length > 0) {
      response += `\n🎨 *Render Jobs:* ${result.renderJobIds.length}`;
    }

    if (result.distributionId) {
      response += `\n📨 *Distribution ID:* \`${result.distributionId.substring(0, 12)}...\``;
    }

    if (trackingInfo) {
      const trackUrl = trackingInfo.trackingLink ? trackingInfo.trackingLink.substring(0, 60) + '...' : 'N/A';
      response += `\n🔗 *Tracking URL:* ${trackUrl}`;
      response += `\n📊 *Short Code:* ${trackingInfo.shortCode || 'N/A'}`;
      response += `\n🔄 *Stage:* ${trackingInfo.currentPipelineStage}`;
    }

    if (result.zernioPostId) {
      response += `\n📡 *Zernio Post:* \`${result.zernioPostId.substring(0, 12)}...\``;
    }

    response += `\n\n💡 *Next:* /schedule [distribution_id] [datetime] to schedule Zernio draft`;

    await safeReply(ctx, response);

  } catch (error: any) {
    console.error('[Add] Error:', error);
    await safeReply(ctx, `❌ Error: ${error.message}`);
  }
});



// addcarousel - Add carousel with full scraping and AI content
bot.command('addcarousel', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
  logCommand('addcarousel', args, String(ctx.from?.id));
  if (!args) {
    await safeReply(ctx, `CAROUSEL AUTO-POST

Usage:
/addcarousel [affiliate_link]

Example:
/addcarousel https://shopee.co.id/product/12345

Flow:
1. Scrapes product info
2. Generates AI content
3. Auto-approves
4. Creates 5 carousel slides (DALL-E)
5. Uploads to Google Drive
6. Creates Zernio draft`);
    return;
  }

  // Rate limit check
  const rateCheck = checkRateLimit(String(ctx.from?.id));
  if (!rateCheck.allowed) {
    await safeReply(ctx, rateCheck.message || 'Rate limit exceeded');
    return;
  }

  const session = await prisma.telegramSession.findUnique({ where: { telegramId: String(ctx.from?.id) } });
  if (!session?.activeBrandId) { await safeReply(ctx, '/brand cepatdapat'); return; }
  const brand = await prisma.brand.findUnique({ where: { id: session.activeBrandId } });
  if (!brand) { await safeReply(ctx, 'Brand error'); return; }

  const link = args.startsWith('http') ? args : null;
  if (!link) { await safeReply(ctx, 'Invalid link'); return; }

  // Validate input length
  const lengthError = validateInputLength(link, MAX_LINK_LENGTH, 'Link');
  if (lengthError) { await safeReply(ctx, lengthError); return; }

  await safeReply(ctx, `⏳ Processing carousel...

1. Scraping product info...`);

  try {
    // === STEP 1: SCRAPE PRODUCT INFO ===
    const { scrapeProduct, isValidAffiliateLink, detectPlatform: detectPlatformFromLink } = await import('../scraper');

    if (!isValidAffiliateLink(link)) {
      await safeReply(ctx, `❌ Invalid affiliate link`);
      return;
    }

    let scrapedProduct;
    try {
      scrapedProduct = await scrapeProduct(link);
    } catch (scrapeError) {
      scrapedProduct = {
        name: 'Product',
        price: 0,
        imageUrl: null,
        description: null,
        category: 'Uncategorized',
        platform: detectPlatformFromLink(link),
        platformDisplay: detectPlatformFromLink(link),
        affiliateLink: link,
        available: true,
        url: link,
      };
    }

    const platform = scrapedProduct.platform || detectPlatformFromLink(link);
    const slug = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // === STEP 2: REUSE EXISTING PRODUCT OR CREATE NEW ===
    let product = await prisma.product.findFirst({ where: { affiliateLink: link } });
    let isNewProduct = false;

    if (product) {
      console.log('[AddCarousel] Reusing existing product:', product.id, product.name);
      if (scrapedProduct.price > 0 && product.price === 0) {
        product = await prisma.product.update({
          where: { id: product.id },
          data: {
            price: scrapedProduct.price,
            commissionAmount: scrapedProduct.price * 0.1,
            imageUrl: scrapedProduct.imageUrl || product.imageUrl,
          },
        });
      }
    } else {
      product = await prisma.product.create({
        data: {
          name: scrapedProduct.name || 'Product',
          slug,
          category: scrapedProduct.category || 'Uncategorized',
          price: scrapedProduct.price || 0,
          commission: 10,
          commissionAmount: (scrapedProduct.price || 0) * 0.1,
          affiliatePlatform: scrapedProduct.platformDisplay || platform,
          affiliateLink: link,
          imageUrl: scrapedProduct.imageUrl || null,
          description: scrapedProduct.description || null,
          status: 'ACTIVE',
        },
      });
      isNewProduct = true;
      console.log('[AddCarousel] Product created:', product.id);

      // === STEP 3: CREATE LINK ===
      await prisma.link.create({ data: { slug, productId: product.id, originalLink: link, status: 'ACTIVE' } });
    }

    // === STEP 4: CREATE TRACKING RECORD ===
    let trackingId = null;
    try {
      const { createTrackingRecord, generateShortCode } = await import('../services/link-tracking');
      const trackingResult = await createTrackingRecord({
        productId: product.id,
        brandId: brand.id,
        originalLink: link,
        shortCode: generateShortCode(),
        platform: 'INSTAGRAM',
        contentType: 'CAROUSEL',
        provider: 'OPENAI_IMAGE',
        utmSource: 'telegram',
        utmMedium: 'bot',
        utmCampaign: brand.slug + '_carousel',
      });
      if (trackingResult.success && trackingResult.tracking) {
        trackingId = trackingResult.tracking.id;
      }
    } catch (e) { console.error('[AddCarousel] Tracking error:', e); }

    // === STEP 5: GENERATE AI CONTENT ===
    await safeReply(ctx, `2. Generating AI content...`);

    const { generatePhase2Content } = await import('../lib/openai-content');
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: scrapedProduct.description || '',
      productPrice: scrapedProduct.price || 0,
      productCategory: scrapedProduct.category,
      platform: 'ALL',
    });

    // === STEP 6: CREATE CONTENT ===
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_CAROUSEL',
        platform: 'INSTAGRAM',
        hook: contentPack.hooks[0] || '',
        caption: contentPack.captions[0] || '',
        script: contentPack.scripts[0] || '',
        hashtags: contentPack.hashtags.slice(0, 30).join(','),
        cta: contentPack.ctas[0] || '',
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        status: 'DRAFT',
        approvalStatus: 'PENDING',
        tone: 'casual',
        language: 'id',
      },
    });

    // === STEP 7: CREATE CONTENT VARIANTS ===
    for (let i = 0; i < Math.min(contentPack.hooks.length, 20); i++) {
      await prisma.contentVariant.create({ data: { contentId: content.id, variantType: 'HOOK', variantIndex: i, contentValue: contentPack.hooks[i] } });
    }
    for (let i = 0; i < Math.min(contentPack.captions.length, 10); i++) {
      await prisma.contentVariant.create({ data: { contentId: content.id, variantType: 'CAPTION', variantIndex: i, contentValue: contentPack.captions[i] } });
    }
    for (let i = 0; i < Math.min(contentPack.ctas.length, 5); i++) {
      await prisma.contentVariant.create({ data: { contentId: content.id, variantType: 'CTA', variantIndex: i, contentValue: contentPack.ctas[i] } });
    }

    // === STEP 8: CREATE QUALITY SCORES ===
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        hookScore: contentPack.qualityScores.hookScore,
        overallScore: contentPack.qualityScores.overallScore,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        recommendation: contentPack.qualityScores.recommendation,
        shouldPost: contentPack.qualityScores.shouldPost,
      },
    });

    // === STEP 9: CREATE VIDEO/IMAGE PROMPTS ===
    for (const vp of contentPack.videoPrompts) {
      await prisma.videoPrompt.create({ data: { productId: product.id, contentId: content.id, tool: vp.tool, prompt: vp.prompt, duration: vp.duration, format: vp.format, hook: vp.hook, voiceOver: vp.voiceOver, sceneBreakdown: vp.sceneBreakdown, onScreenText: vp.onScreenText, suggestedMusic: vp.suggestedMusic, status: 'DRAFT' } });
    }
    for (const ip of contentPack.imagePrompts) {
      await prisma.imagePrompt.create({ data: { productId: product.id, contentId: content.id, imageType: ip.imageType, prompt: ip.prompt, layout: ip.layout, background: ip.background, visualMood: ip.visualMood, productPlacement: ip.productPlacement, textOverlay: ip.textOverlay, status: 'DRAFT' } });
    }

    // === STEP 10: UPDATE TRACKING STAGE ===
    if (trackingId) {
      try {
        const { updatePipelineStage } = await import('../services/link-tracking');
        await updatePipelineStage(trackingId, 'CONTENT_GENERATED', 'Carousel content generated');
      } catch (e) { console.error(e); }
    }

    // === STEP 11: AUTO-APPROVE AND TRIGGER PIPELINE ===
    await safeReply(ctx, `3. Auto-approving and generating carousel...`);

    const { executeContentTypePipeline } = await import('../services/approval-pipeline');
    const result = await executeContentTypePipeline(content.id, 'CAROUSEL', {
      autoApprove: true,
      provider: 'OPENAI_IMAGE',
      platform: 'INSTAGRAM',
      brandId: brand.id,
    });

    let response = `✅ *CAROUSEL WORKFLOW COMPLETE*

📦 *Product:* ${product.name}
💰 *Price:* Rp ${(scrapedProduct.price || 0).toLocaleString('id-ID')}
🏪 *Platform:* ${scrapedProduct.platformDisplay || platform}
🏢 *Brand:* ${brand.name}

📊 *Content Generated:*
• Hooks: ${contentPack.hooks.length}
• Captions: ${contentPack.captions.length}
• Quality Score: ${contentPack.qualityScores.overallScore}/100

`;
    for (const step of result.steps) {
      response += step + '\n';
    }

    if (result.productionPackageId) {
      response += `\n📦 *Package:* \`${result.productionPackageId.substring(0, 12)}...\``;
    }
    if (result.renderJobIds?.length > 0) {
      response += `\n🎨 *Render Jobs:* ${result.renderJobIds.length} carousel slides`;
    }
    if (result.distributionId) {
      response += `\n📨 *Distribution ID:* \`${result.distributionId.substring(0, 12)}...\``;
    }

    response += `\n\n💡 *Next:* /schedule [distribution_id] [datetime] to schedule`;

    await safeReply(ctx, response);

  } catch (e) { await safeReply(ctx, 'Error: ' + e.message); }
});

// addvideo - Add video with full scraping and AI content (Pippit manual)
bot.command('addvideo', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!args) {
    await safeReply(ctx, `VIDEO AUTO-POST (Pippit Manual)

Usage:
/addvideo [affiliate_link]

Example:
/addvideo https://tiktok.com/shop/product/12345

Flow:
1. Scrapes product info
2. Generates AI content
3. Auto-approves
4. Creates WAITING_UPLOAD package
5. Use /pippit [contentId] to generate upload folder

Just send the link!`);
    return;
  }
  logCommand('addvideo', args, String(ctx.from?.id));

  // Rate limit check
  const rateCheck = checkRateLimit(String(ctx.from?.id));
  if (!rateCheck.allowed) {
    await safeReply(ctx, rateCheck.message || 'Rate limit exceeded');
    return;
  }

  const session = await prisma.telegramSession.findUnique({ where: { telegramId: String(ctx.from?.id) } });
  if (!session?.activeBrandId) { await safeReply(ctx, '/brand cepatdapat'); return; }
  const brand = await prisma.brand.findUnique({ where: { id: session.activeBrandId } });
  if (!brand) { await safeReply(ctx, 'Brand error'); return; }

  const link = args.startsWith('http') ? args : null;
  if (!link) { await safeReply(ctx, 'Invalid link'); return; }

  // Validate input length
  const lengthError = validateInputLength(link, MAX_LINK_LENGTH, 'Link');
  if (lengthError) { await safeReply(ctx, lengthError); return; }

  await safeReply(ctx, `⏳ Processing video...

1. Scraping product info...`);

  try {
    // === STEP 1: SCRAPE PRODUCT INFO ===
    const { scrapeProduct, isValidAffiliateLink, detectPlatform: detectPlatformFromLink } = await import('../scraper');

    if (!isValidAffiliateLink(link)) {
      await safeReply(ctx, `❌ Invalid affiliate link`);
      return;
    }

    let scrapedProduct;
    try {
      scrapedProduct = await scrapeProduct(link);
    } catch (scrapeError) {
      scrapedProduct = {
        name: 'Product',
        price: 0,
        imageUrl: null,
        description: null,
        category: 'Uncategorized',
        platform: detectPlatformFromLink(link),
        platformDisplay: detectPlatformFromLink(link),
        affiliateLink: link,
        available: true,
        url: link,
      };
    }

    const platform = scrapedProduct.platform || detectPlatformFromLink(link);
    const slug = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // === STEP 2: REUSE EXISTING PRODUCT OR CREATE NEW ===
    let product = await prisma.product.findFirst({ where: { affiliateLink: link } });
    let isNewProduct = false;

    if (product) {
      console.log('[AddCarousel] Reusing existing product:', product.id, product.name);
      if (scrapedProduct.price > 0 && product.price === 0) {
        product = await prisma.product.update({
          where: { id: product.id },
          data: {
            price: scrapedProduct.price,
            commissionAmount: scrapedProduct.price * 0.1,
            imageUrl: scrapedProduct.imageUrl || product.imageUrl,
          },
        });
      }
    } else {
      product = await prisma.product.create({
        data: {
          name: scrapedProduct.name || 'Product',
          slug,
          category: scrapedProduct.category || 'Uncategorized',
          price: scrapedProduct.price || 0,
          commission: 10,
          commissionAmount: (scrapedProduct.price || 0) * 0.1,
          affiliatePlatform: scrapedProduct.platformDisplay || platform,
          affiliateLink: link,
          imageUrl: scrapedProduct.imageUrl || null,
          description: scrapedProduct.description || null,
          status: 'ACTIVE',
        },
      });
      isNewProduct = true;
      console.log('[AddCarousel] Product created:', product.id);

      // === STEP 3: CREATE LINK ===
      await prisma.link.create({ data: { slug, productId: product.id, originalLink: link, status: 'ACTIVE' } });
    }

    // === STEP 4: CREATE TRACKING RECORD ===
    let trackingId = null;
    try {
      const { createTrackingRecord, generateShortCode } = await import('../services/link-tracking');
      const trackingResult = await createTrackingRecord({
        productId: product.id,
        brandId: brand.id,
        originalLink: link,
        shortCode: generateShortCode(),
        platform: 'TIKTOK',
        contentType: 'VIDEO',
        provider: 'PIPPIT_MANUAL',
        utmSource: 'telegram',
        utmMedium: 'bot',
        utmCampaign: brand.slug + '_video',
      });
      if (trackingResult.success && trackingResult.tracking) {
        trackingId = trackingResult.tracking.id;
      }
    } catch (e) { console.error('[AddVideo] Tracking error:', e); }

    // === STEP 5: GENERATE AI CONTENT ===
    await safeReply(ctx, `2. Generating AI content...`);

    const { generatePhase2Content } = await import('../lib/openai-content');
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: scrapedProduct.description || '',
      productPrice: scrapedProduct.price || 0,
      productCategory: scrapedProduct.category,
      platform: 'ALL',
    });

    // === STEP 6: CREATE CONTENT ===
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_FULL',
        platform: 'TIKTOK',
        hook: contentPack.hooks[0] || '',
        caption: contentPack.captions[0] || '',
        script: contentPack.scripts[0] || '',
        hashtags: contentPack.hashtags.slice(0, 30).join(','),
        cta: contentPack.ctas[0] || '',
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        status: 'DRAFT',
        approvalStatus: 'PENDING',
        tone: 'casual',
        language: 'id',
      },
    });

    // === STEP 7: CREATE CONTENT VARIANTS ===
    for (let i = 0; i < Math.min(contentPack.hooks.length, 20); i++) {
      await prisma.contentVariant.create({ data: { contentId: content.id, variantType: 'HOOK', variantIndex: i, contentValue: contentPack.hooks[i] } });
    }
    for (let i = 0; i < Math.min(contentPack.captions.length, 10); i++) {
      await prisma.contentVariant.create({ data: { contentId: content.id, variantType: 'CAPTION', variantIndex: i, contentValue: contentPack.captions[i] } });
    }
    for (let i = 0; i < Math.min(contentPack.ctas.length, 5); i++) {
      await prisma.contentVariant.create({ data: { contentId: content.id, variantType: 'CTA', variantIndex: i, contentValue: contentPack.ctas[i] } });
    }

    // === STEP 8: CREATE QUALITY SCORES ===
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        hookScore: contentPack.qualityScores.hookScore,
        overallScore: contentPack.qualityScores.overallScore,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        recommendation: contentPack.qualityScores.recommendation,
        shouldPost: contentPack.qualityScores.shouldPost,
      },
    });

    // === STEP 9: CREATE VIDEO/IMAGE PROMPTS ===
    for (const vp of contentPack.videoPrompts) {
      await prisma.videoPrompt.create({ data: { productId: product.id, contentId: content.id, tool: vp.tool, prompt: vp.prompt, duration: vp.duration, format: vp.format, hook: vp.hook, voiceOver: vp.voiceOver, sceneBreakdown: vp.sceneBreakdown, onScreenText: vp.onScreenText, suggestedMusic: vp.suggestedMusic, status: 'DRAFT' } });
    }
    for (const ip of contentPack.imagePrompts) {
      await prisma.imagePrompt.create({ data: { productId: product.id, contentId: content.id, imageType: ip.imageType, prompt: ip.prompt, layout: ip.layout, background: ip.background, visualMood: ip.visualMood, productPlacement: ip.productPlacement, textOverlay: ip.textOverlay, status: 'DRAFT' } });
    }

    // === STEP 10: UPDATE TRACKING STAGE ===
    if (trackingId) {
      try {
        const { updatePipelineStage } = await import('../services/link-tracking');
        await updatePipelineStage(trackingId, 'CONTENT_GENERATED', 'Video content generated');
      } catch (e) { console.error(e); }
    }

    // === STEP 11: AUTO-APPROVE AND TRIGGER PIPELINE ===
    await safeReply(ctx, `3. Auto-approving and creating Pippit package...`);

    const { executeContentTypePipeline } = await import('../services/approval-pipeline');
    const result = await executeContentTypePipeline(content.id, 'VIDEO', {
      autoApprove: true,
      provider: 'PIPPIT_MANUAL',
      platform: 'TIKTOK',
      brandId: brand.id,
    });

    let response = `✅ *VIDEO WORKFLOW COMPLETE*

📦 *Product:* ${product.name}
💰 *Price:* Rp ${(scrapedProduct.price || 0).toLocaleString('id-ID')}
🏪 *Platform:* ${scrapedProduct.platformDisplay || platform}
🏢 *Brand:* ${brand.name}

📊 *Content Generated:*
• Hooks: ${contentPack.hooks.length}
• Captions: ${contentPack.captions.length}
• Scripts: ${contentPack.scripts.length}
• Quality Score: ${contentPack.qualityScores.overallScore}/100

`;
    for (const step of result.steps) {
      response += step + '\n';
    }

    if (result.productionPackageId) {
      response += `\n📦 *Package:* \`${result.productionPackageId.substring(0, 12)}...\``;
    }
    if (result.distributionId) {
      response += `\n📨 *Distribution ID:* \`${result.distributionId.substring(0, 12)}...\``;
    }

    response += `\n\n📋 *NEXT STEPS:*
1. /pippit ${content.id.substring(0, 8)} - Create upload folder
2. Generate video at pippit.ai
3. Upload MP4 to cloud
4. /attachvideo ${content.id.substring(0, 8)} [cloudUrl]`;

    await safeReply(ctx, response);

  } catch (e) { await safeReply(ctx, 'Error: ' + e.message); }
});
// /showflow - Show complete pipeline flow status
bot.command('showflow', async (ctx) => {
  try {
    const telegramId = String(ctx.from?.id || '');
    const session = await prisma.telegramSession.findUnique({
      where: { telegramId },
    });

    const brandId = session?.activeBrandId;

    // Get all pipeline stats with simple counts
    const [
      pendingContent,
      approvedContent,
      productionPackages,
      renderJobs,
      distributionItems,
      brands,
    ] = await Promise.all([
      prisma.content.count({ where: { approvalStatus: 'PENDING' } }),
      prisma.content.count({ where: { approvalStatus: 'APPROVED' } }),
      prisma.productionPackage.count(),
      prisma.renderJob.count(),
      prisma.distributionQueue.count(brandId ? { where: { brandId } } : {}),
      prisma.brand.count({ where: { status: 'ACTIVE' } }),
    ]);

    const [
      queuedJobs,
      completedJobs,
      failedJobs,
      distDraft,
      distQueued,
      distZernioDraft,
      distPosted,
      distFailed,
    ] = await Promise.all([
      prisma.renderJob.count({ where: { status: 'queued' } }),
      prisma.renderJob.count({ where: { status: 'completed' } }),
      prisma.renderJob.count({ where: { status: 'failed' } }),
      prisma.distributionQueue.count(brandId ? { where: { brandId, status: 'DRAFT' } } : { where: { status: 'DRAFT' } }),
      prisma.distributionQueue.count(brandId ? { where: { brandId, status: 'QUEUED' } } : { where: { status: 'QUEUED' } }),
      prisma.distributionQueue.count(brandId ? { where: { brandId, status: 'ZERNIO_DRAFT_CREATED' } } : { where: { status: 'ZERNIO_DRAFT_CREATED' } }),
      prisma.distributionQueue.count(brandId ? { where: { brandId, status: 'POSTED_CONFIRMED' } } : { where: { status: 'POSTED_CONFIRMED' } }),
      prisma.distributionQueue.count(brandId ? { where: { brandId, status: 'FAILED' } } : { where: { status: 'FAILED' } }),
    ]);

    // Get recent render jobs with details
    const recentJobs = await prisma.renderJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { productionPackage: { include: { product: true } } },
    });

    // Get recent distribution items
    const recentDist = await prisma.distributionQueue.findMany({
      where: brandId ? { brandId } : {},
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { brand: true },
    });

    // Build the message
    let message = `🔄 *PIPELINE FLOW STATUS*\n\n`;

    message += `📊 *Summary*\n`;
    message += `├ Content Pending: ${pendingContent}\n`;
    message += `├ Content Approved: ${approvedContent}\n`;
    message += `├ Brands: ${brands}\n\n`;

    message += `🎬 *RENDER JOBS*\n`;
    message += `├ Queued: ${queuedJobs}\n`;
    message += `├ Completed: ${completedJobs}\n`;
    message += `├ Failed: ${failedJobs}\n`;
    message += `└ Total: ${renderJobs}\n\n`;

    message += `📨 *DISTRIBUTION*\n`;
    message += `├ Draft: ${distDraft}\n`;
    message += `├ Queued: ${distQueued}\n`;
    message += `├ Zernio Draft: ${distZernioDraft}\n`;
    message += `├ Zernio Scheduled: ${distZernioDraft > 0 ? '—' : '0'}\n`;
    message += `├ Posted Confirmed: ${distPosted}\n`;
    message += `└ Failed: ${distFailed}\n\n`;

    if (distZernioDraft > 0) {
      message += `⚠️ *Zernio Drafts:* ${distZernioDraft} items waiting\n`;
      message += `   Use /schedule [id] [datetime] to schedule\n`;
      message += `   Or check Zernio dashboard to publish manually\n\n`;
    }

    // Recent jobs
    if (recentJobs.length > 0) {
      message += `📋 *Recent Render Jobs*\n`;
      for (const job of recentJobs) {
        const status = job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : '⏳';
        message += `${status} ${job.tool} - ${job.productionPackage?.product?.name || 'N/A'}\n`;
      }
      message += '\n';
    }

    // Recent distribution
    if (recentDist.length > 0) {
      message += `📋 *Recent Distribution*\n`;
      for (const dist of recentDist) {
        let statusEmoji = '📝';
        if (dist.status === 'POSTED_CONFIRMED') statusEmoji = '✅';
        else if (dist.status === 'ZERNIO_DRAFT_CREATED') statusEmoji = '📝';
        else if (dist.status === 'ZERNIO_SCHEDULED') statusEmoji = '🕐';
        else if (dist.status === 'FAILED') statusEmoji = '❌';
        else if (dist.status === 'QUEUED') statusEmoji = '⏳';
        message += `${statusEmoji} ${dist.status}\n`;
        if (dist.scheduledAt) {
          message += `   🕐 Scheduled: ${new Date(dist.scheduledAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
        }
        if (dist.postId) {
          message += `   ID: \`${dist.postId.substring(0, 12)}...\``;
        }
        message += '\n';
      }
    }

    // Pipeline diagram
    message += `\n📐 *CONTENT TYPES*\n`;
    message += `\`\`\`\n`;
    message += `🖼️ /add [link]      → IMAGE auto-post\n`;
    message += `🎠 /addcarousel [link] → CAROUSEL (5-7 slides)\n`;
    message += `🎬 /addvideo [link] → VIDEO (Pippit manual)\n`;
    message += `\`\`\`\n\n`;

    message += `📊 *POSTING MIX (Recommended)*\n`;
    message += `• 70% → IMAGE/CAROUSEL (auto-generated)\n`;
    message += `• 30% → VIDEO (manual Pippit)\n\n`;

    message += `💡 *Daily Example (3 posts)*\n`;
    message += `• Morning: 🖼️ Image post\n`;
    message += `• Afternoon: 🎠 Carousel\n`;
    message += `• Evening: 🖼️ Image OR 🎬 Video\n\n`;

    message += `📋 *Actions:*\n`;
    message += `• /pending - View & approve content\n`;
    message += `• /approve - Generate assets & create Zernio draft\n`;
    message += `• /schedule [id] [datetime] - Schedule draft\n`;
    message += `• /zerniostatus [postId] - Check Zernio post`;

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[ShowFlow] Error:', error);
    await ctx.reply(`❌ Error fetching pipeline status: ${error.message}`);
  }
});

// /linktrack - Show tracking status for affiliate links
bot.command('linktrack', handleLinkTrackCommand);

// ============================================
// CONTENT CALENDAR COMMANDS
// ============================================

import * as calendar from '../services/calendar';
import { handleLinkTrackCommand } from './commands/linktrack';

// /queue - Show content queue status
bot.command('queue', async (ctx) => {
  try {
    const telegramId = String(ctx.from?.id || '');
    const session = await prisma.telegramSession.findUnique({
      where: { telegramId },
    });
    const brandId = session?.activeBrandId || undefined;

    // Get queue stats
    const stats = await calendar.getQueueStats(brandId);

    // Get pending items
    const pending = await calendar.getPendingQueue(brandId, 10);

    // Get schedule
    const schedule = await calendar.getPostingSchedule(brandId);

    let message = `📅 *CONTENT QUEUE*\n\n`;

    message += `📊 *Queue Stats*\n`;
    message += `├ Pending: ${stats.pending}\n`;
    message += `├ Scheduled: ${stats.scheduled}\n`;
    message += `├ Posted: ${stats.posted}\n`;
    message += `└ Skipped: ${stats.skipped}\n\n`;

    if (Object.keys(stats.byType).length > 0) {
      message += `📋 *By Content Type:*\n`;
      for (const [type, count] of Object.entries(stats.byType)) {
        message += `├ ${type}: ${count}\n`;
      }
      message += '\n';
    }

    // Show next slots for today/tomorrow
    const today = new Date().getDay();
    const tomorrow = (today + 1) % 7;
    const todaySlots = schedule.byDay[calendar.DAY_NAMES[today]] || [];
    const tomorrowSlots = schedule.byDay[calendar.DAY_NAMES[tomorrow]] || [];

    if (todaySlots.length > 0) {
      message += `🕐 *Today (${calendar.DAY_NAMES[today]}):*\n`;
      for (const slot of todaySlots) {
        message += `├ ${slot.time} - ${slot.platform} (${slot.contentType})\n`;
      }
      message += '\n';
    }

    if (tomorrowSlots.length > 0) {
      message += `🕐 *Tomorrow (${calendar.DAY_NAMES[tomorrow]}):*\n`;
      for (const slot of tomorrowSlots) {
        message += `├ ${slot.time} - ${slot.platform} (${slot.contentType})\n`;
      }
      message += '\n';
    }

    // Show pending items
    if (pending.length > 0) {
      message += `📋 *Pending Items:*\n`;
      for (const item of pending.slice(0, 5)) {
        const typeEmoji = item.contentType === 'IMAGE' ? '🖼️' : item.contentType === 'CAROUSEL' ? '🎠' : '🎬';
        message += `${typeEmoji} ${item.contentType} - ${item.platform}\n`;
        message += `   ID: \`${item.id.substring(0, 8)}...\``;
        if (item.scheduledFor) {
          message += ` | 🕐 ${new Date(item.scheduledFor).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
        }
        message += '\n';
      }
      if (pending.length > 5) {
        message += `... +${pending.length - 5} more\n`;
      }
      message += '\n';
    }

    message += `💡 *Commands:*\n`;
    message += `• /queueset [platform] [day] [time] [type] - Set schedule\n`;
    message += `• /queueprocess - Assign times to queue\n`;
    message += `• /queueclear - Clear pending queue`;

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[Queue] Error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /queueset - Set posting schedule
bot.command('queueset', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (!args) {
    const helpText = `
📅 *SET POSTING SCHEDULE*

Usage:
• /queueset [platform] [day] [time] [type]

Examples:
• /queueset INSTAGRAM Monday 08:00 IMAGE
• /queueset TIKTOK Tuesday 18:00 CAROUSEL
• /queueset INSTAGRAM Friday 12:00 VIDEO

Days: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
Time: HH:MM format
Types: IMAGE, CAROUSEL, VIDEO
Platforms: INSTAGRAM, TIKTOK, FACEBOOK
    `;
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
    return;
  }

  // Parse args
  const parts = args.split(/\s+/);
  if (parts.length < 4) {
    await ctx.reply('❌ Invalid format. Use: /queueset [platform] [day] [time] [type]');
    return;
  }

  const platform = parts[0].toUpperCase();
  const dayStr = parts[1].toLowerCase();
  const timeStr = parts[2];
  const contentType = parts[3].toUpperCase();

  // Validate platform
  const validPlatforms = ['INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'ALL'];
  if (!validPlatforms.includes(platform)) {
    await ctx.reply(`❌ Invalid platform. Use: ${validPlatforms.join(', ')}`);
    return;
  }

  // Validate day
  const dayMap: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };
  const dayOfWeek = dayMap[dayStr];
  if (dayOfWeek === undefined) {
    await ctx.reply('❌ Invalid day. Use: Sunday, Monday, Tuesday, etc.');
    return;
  }

  // Validate time
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) {
    await ctx.reply('❌ Invalid time. Use HH:MM format (e.g., 08:00, 18:30)');
    return;
  }
  const hour = parseInt(timeMatch[1]);
  const minute = parseInt(timeMatch[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    await ctx.reply('❌ Invalid time. Hour must be 0-23, minute must be 0-59');
    return;
  }

  // Validate content type
  const validTypes = ['IMAGE', 'CAROUSEL', 'VIDEO'];
  if (!validTypes.includes(contentType)) {
    await ctx.reply(`❌ Invalid type. Use: ${validTypes.join(', ')}`);
    return;
  }

  // Set the schedule
  const result = await calendar.setScheduleSlot(platform, dayOfWeek, hour, minute, contentType);

  if (result.success) {
    const dayName = calendar.DAY_NAMES[dayOfWeek];
    const timeFormatted = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    await ctx.reply(`✅ *Schedule Set!*

📅 ${dayName} at ${timeFormatted}
📱 Platform: ${platform}
🖼️ Type: ${contentType}

Use /queue to view all schedules.`);
  } else {
    await ctx.reply(`❌ Failed to set schedule: ${result.error}`);
  }
});

// /queueclear - Clear pending queue
bot.command('queueclear', async (ctx) => {
  try {
    const telegramId = String(ctx.from?.id || '');
    const session = await prisma.telegramSession.findUnique({
      where: { telegramId },
    });
    const brandId = session?.activeBrandId || undefined;

    const result = await calendar.clearQueue(brandId);

    if (result.success) {
      await ctx.reply(`✅ *Queue Cleared*

Deleted ${result.deleted} pending items from queue.`);
    } else {
      await ctx.reply(`❌ Failed to clear queue: ${result.error}`);
    }
  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /queueprocess - Process queue and assign times
bot.command('queueprocess', async (ctx) => {
  try {
    const telegramId = String(ctx.from?.id || '');
    const session = await prisma.telegramSession.findUnique({
      where: { telegramId },
    });
    const brandId = session?.activeBrandId || undefined;

    await ctx.reply('⏳ Processing queue...');

    const result = await calendar.processQueue(brandId);

    if (result.errors.length === 0) {
      await ctx.reply(`✅ *Queue Processed!*

📋 Processed: ${result.processed}
📅 Scheduled: ${result.scheduled}
❌ Errors: ${result.errors.length}

Use /queue to view updated schedule.`);
    } else {
      await ctx.reply(`⚠️ *Queue Processed with Errors*

📋 Processed: ${result.processed}
📅 Scheduled: ${result.scheduled}
❌ Errors: ${result.errors.length}

${result.errors.slice(0, 3).join('\n')}`);
    }
  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /pippit - PIPPIT MANUAL WORKFLOW
// Shows Pippit manual queue and creates WAITING_UPLOAD folder
bot.command('pippit', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
    const contentId = args || null;

    // If contentId provided, generate files for that content
    if (contentId) {
      await generateWaitingUploadFolder(ctx, contentId);
      return;
    }

    // Otherwise show status
    await showPippitStatus(ctx);

  } catch (error: any) {
    console.error('[Pippit] Error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// Generate WAITING_UPLOAD folder for content
async function generateWaitingUploadFolder(ctx: any, contentId: string) {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    include: {
      product: true,
      qualityScores: true,
      contentVariants: { orderBy: { variantIndex: 'asc' } },
      videoPrompts: true,
    },
  });

  if (!content) {
    await ctx.reply(`❌ Content not found: ${contentId.substring(0, 8)}...`);
    return;
  }

  const quality = content.qualityScores?.[0];
  const hooks = content.contentVariants.filter(v => v.variantType === 'HOOK');
  const captions = content.contentVariants.filter(v => v.variantType === 'CAPTION');
  const pippitPrompt = content.videoPrompts?.find(p => p.tool === 'PIPPIT');

  // Create folder
  const folderName = `WAITING_UPLOAD_${contentId.substring(0, 8)}_${content.product.slug}`;
  const tempDir = os.tmpdir();
  const folderPath = path.join(tempDir, folderName);

  fs.mkdirSync(folderPath, { recursive: true });

  // 1. README.txt
  const readme = `PIPPIT MANUAL VIDEO CREATION PACKAGE
============================================

CONTENT ID: ${contentId}
PRODUCT: ${content.product.name}
PRICE: Rp ${Number(content.product.price || 0).toLocaleString('id-ID')}
LINK: ${content.product.affiliateLink}

QUALITY SCORE: ${quality?.overallScore || 'N/A'}/100
BEST PLATFORM: ${quality?.bestPlatform || 'TikTok'}

INSTRUCTIONS
============
1. Open this folder
2. Copy pippit-prompt.txt
3. Go to pippit.ai or Pippit dashboard
4. Paste the prompt
5. Set duration: ${pippitPrompt?.duration || 30}s
6. Set format: ${pippitPrompt?.format || '9:16'} (TikTok/Shorts)
7. Generate video
8. Download MP4
9. Upload to Google Drive/Dropbox
10. Come back here and send:
   /attachvideo ${contentId} [cloud_video_url]
`;

  fs.writeFileSync(path.join(folderPath, 'README.txt'), readme);

  // 2. pippit-prompt.txt
  const promptText = pippitPrompt?.prompt || quality?.bestHook || content.hook || hooks[0]?.contentValue || 'Create engaging product video';
  const promptFile = `PIPPIT PROMPT - COPY THIS
=======================

${promptText}
${content.script ? '\nSCRIPT:\n' + content.script : ''}
${pippitPrompt?.duration ? '\nDURATION: ' + pippitPrompt.duration + ' seconds' : ''}
${pippitPrompt?.format ? '\nFORMAT: ' + pippitPrompt.format : ''}
${content.tone ? '\nTONE: ' + content.tone : ''}`;

  fs.writeFileSync(path.join(folderPath, 'pippit-prompt.txt'), promptFile);

  // 3. script.txt
  const scriptFile = `VIDEO SCRIPT
============

HOOK (first 3 seconds):
${quality?.bestHook || hooks[0]?.contentValue || ''}

SCRIPT:
${content.script || ''}

PRODUCT: ${content.product.name}
PRICE: Rp ${Number(content.product.price || 0).toLocaleString('id-ID')}
LINK: ${content.product.affiliateLink}

CALL TO ACTION:
${quality?.bestCta || content.cta || 'Klik link di bio untuk order!'}
`;

  fs.writeFileSync(path.join(folderPath, 'script.txt'), scriptFile);

  // 4. voiceover.txt
  const voiceoverFile = `VOICEOVER SCRIPT
================

${pippitPrompt?.voiceOver || content.script || ''}

ALTERNATIVE HOOKS:
${hooks.slice(0, 3).map((h, i) => `${i + 1}. ${h.contentValue}`).join('\n\n')}`;

  fs.writeFileSync(path.join(folderPath, 'voiceover.txt'), voiceoverFile);

  // 5. subtitle.txt
  const subtitleFile = `SUBTITLE/CAPTION OVERLAY
========================

KEY TEXT TO DISPLAY:
${quality?.bestHook || hooks[0]?.contentValue || ''}

TIMING:
0-3s:  HOOK (big text)
3-10s: Product intro + price
10-20s: Benefits
20-27s: Social proof
27-30s: CTA + price reminder

FONT: Bold, white text, dark outline`;

  fs.writeFileSync(path.join(folderPath, 'subtitle.txt'), subtitleFile);

  // 6. caption.txt
  const captionFile = `POST CAPTION
============

${quality?.bestCaption || captions[0]?.contentValue || content.caption || ''}

ALTERNATIVE CAPTIONS:
${captions.slice(0, 3).map((c, i) => `${i + 1}. ${c.contentValue}`).join('\n\n')}`;

  fs.writeFileSync(path.join(folderPath, 'caption.txt'), captionFile);

  // 7. hashtags.txt
  const hashtagFile = `HASHTAGS
=========

${content.hashtags || ''}

RECOMMENDED:
#ProdukIndonesia #ShopeeIndonesia #TikTokShop
#Trending #Viral #FYP #ForYou
#2024 #Challenge`;

  fs.writeFileSync(path.join(folderPath, 'hashtags.txt'), hashtagFile);

  // Reply with confirmation and instructions
  await ctx.reply(`✅ *WAITING_UPLOAD FOLDER CREATED*

📁 Folder: ${folderName}

📄 Files created:
• README.txt - Instructions
• pippit-prompt.txt - Pippit prompt
• script.txt - Video script
• voiceover.txt - Voiceover guide
• subtitle.txt - Subtitle overlay
• caption.txt - Post caption
• hashtags.txt - Hashtags

📍 Location: ${folderPath}

📋 *NEXT STEPS:*
1. Go to Pippit website
2. Generate video using the prompt
3. Download MP4
4. Upload to Google Drive/Dropbox
5. Send me the cloud URL:
   \`/attachvideo ${contentId} [cloud_video_url]\``,
    { parse_mode: 'Markdown' }
  );
}

// Show PIPPIT workflow status
async function showPippitStatus(ctx: any) {
  // Get PIPPIT_MANUAL distribution items
  const pippitItems = await prisma.distributionQueue.findMany({
    where: { provider: 'PIPPIT_MANUAL' },
    orderBy: { createdAt: 'desc' },
    include: { brand: true, product: true },
  });

  const draftItems = pippitItems.filter(i => i.status === 'DRAFT');
  const readyItems = pippitItems.filter(i => i.status === 'READY');
  const queuedItems = pippitItems.filter(i => i.status === 'QUEUED');
  const postedItems = pippitItems.filter(i => i.status === 'POSTED_CONFIRMED');

  let message = `🎬 *PIPPIT MANUAL WORKFLOW*\n\n`;

  message += `📊 *Status*\n`;
  message += `├ Draft: ${draftItems.length}\n`;
  message += `├ Ready: ${readyItems.length}\n`;
  message += `├ Queued: ${queuedItems.length}\n`;
  message += `└ Posted: ${postedItems.length}\n\n`;

  // Draft items needing upload
  if (draftItems.length > 0) {
    message += `📤 *WAITING UPLOAD*\n`;
    for (const item of draftItems.slice(0, 5)) {
      message += `• ${item.product?.name || 'N/A'}\n`;
      message += `  ID: \`${item.id.substring(0, 12)}...\`\n`;
    }
    message += '\n';
  }

  // Ready items
  if (readyItems.length > 0) {
    message += `✅ *READY FOR ZERNIO*\n`;
    for (const item of readyItems.slice(0, 5)) {
      message += `• ${item.product?.name || 'N/A'}\n`;
      message += `  Video: ${item.videoUrl ? 'Uploaded ✓' : 'Missing ✗'}\n`;
    }
    message += '\n';
  }

  message += `📋 *WORKFLOW*\n`;
  message += `\`\`\`\n`;
  message += `1. /add [link] - Add product\n`;
  message += `2. Approve content\n`;
  message += `3. /pippit [contentId] - Create folder\n`;
  message += `4. Generate video at pippit.ai\n`;
  message += `5. Upload MP4 to cloud\n`;
  message += `6. /attachvideo [contentId] [cloudUrl]\n`;
  message += `7. Zernio posts to TikTok\n`;
  message += `\`\`\`\n\n`;

  message += `💡 *Usage:*\n`;
  message += `• \`/pippit [contentId]\` - Create upload folder\n`;
  message += `• \`/attachvideo [id] [url]\` - Attach video\n`;
  message += `• \`/pippit\` - Show status`;

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

// /attachvideo - Attach video URL to distribution item
bot.command('attachvideo', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (!args) {
    await ctx.reply(`📎 *Usage:* /attachvideo [contentId] [cloudVideoUrl]

Example:
\`/attachvideo abc123def... https://drive.google.com/file/d/xxx\`

This marks the distribution as READY for Zernio posting.`);
    return;
  }

  const parts = args.match(/^(\S+)\s+(.+)$/);
  if (!parts) {
    await ctx.reply(`❌ Invalid format. Use: /attachvideo [contentId] [cloudUrl]`);
    return;
  }

  const contentId = parts[1];
  const cloudUrl = parts[2];

  try {
    // Find distribution item by contentId
    const distItem = await prisma.distributionQueue.findFirst({
      where: {
        productId: contentId,
        provider: 'PIPPIT_MANUAL',
        status: 'DRAFT',
      },
      include: { brand: true, product: true },
    });

    if (!distItem) {
      await ctx.reply(`❌ No PIPPIT_MANUAL distribution found for content ID: ${contentId.substring(0, 12)}...`);
      return;
    }

    // Update with video URL
    await prisma.distributionQueue.update({
      where: { id: distItem.id },
      data: {
        videoUrl: cloudUrl,
        status: 'READY',
      },
    });

    await ctx.reply(`✅ *VIDEO ATTACHED*

📦 Product: ${distItem.product?.name || 'N/A'}
🎬 Brand: ${distItem.brand?.name || 'N/A'}
🔗 URL: ${cloudUrl.substring(0, 50)}...

📊 Status changed: DRAFT → READY

⏳ Video is now queued for Zernio posting.
🔄 Use /showflow to monitor progress.`);

  } catch (error: any) {
    console.error('[AttachVideo] Error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /zerniostatus - Check Zernio post status
bot.command('zerniostatus', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (!args) {
    await ctx.reply(`📎 *Usage:* /zerniostatus [postId]

Example:
\`/zerniostatus 6a2173e52511e72140ab6e45\`

This checks the actual Zernio status for a post and compares with local DB.`);
    return;
  }

  const postId = args;

  await ctx.reply(`⏳ Checking Zernio status for: \`${postId}\``);

  try {
    // Get brand context
    const telegramId = String(ctx.from?.id || '');
    const session = await prisma.telegramSession.findUnique({
      where: { telegramId },
    });

    // Get API key based on brand
    let apiKey: string | null = null;
    if (session?.activeBrandSlug) {
      const slug = session.activeBrandSlug.toLowerCase();
      if (slug.includes('cepat') || slug.includes('dapat')) {
        apiKey = process.env.ZERNIO_CEPAT_KEY_1 || null;
      } else if (slug.includes('crypto') || slug.includes('ew')) {
        apiKey = process.env.ZERNIO_CRYPTO_KEY_1 || null;
      }
    }

    // Fallback to CEPAT key
    if (!apiKey) {
      apiKey = process.env.ZERNIO_CEPAT_KEY_1 || null;
    }

    if (!apiKey) {
      await ctx.reply('❌ No Zernio API key configured');
      return;
    }

    // Check Zernio API
    const response = await fetch(`https://api.zernio.com/v1/posts/${postId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      await ctx.reply(`❌ Zernio API error: ${response.status}`);
      return;
    }

    const data: any = await response.json();
    const post = data.post || data;

    // Check local DB
    const localItem = await prisma.distributionQueue.findFirst({
      where: { postId },
      include: { brand: true }
    });

    // Build response
    let message = `🔍 *ZERNIO POST STATUS*\n\n`;

    message += `*Zernio Response:*\n`;
    message += `├ Status: \`${post.status || 'unknown'}\`\n`;
    message += `├ Post ID: \`${post._id || postId}\`\n`;
    message += `├ Platforms: ${JSON.stringify(post.platforms || [])}\n`;
    message += `├ Media Items: ${post.mediaItems?.length || 0}\n`;
    message += `├ publishAttempts: ${post.publishAttempts || 0}\n`;
    message += `└ scheduledFor: ${post.scheduledFor || 'not set'}\n\n`;

    message += `*Post URL:*\n`;
    message += `${post.url || '⚠️ NOT AVAILABLE (draft only)'}\n\n`;

    if (localItem) {
      message += `*Local Database:*\n`;
      message += `├ Distribution ID: \`${localItem.id.substring(0, 12)}...\`\n`;
      message += `├ DB Status: \`${localItem.status}\`\n`;
      message += `├ Local postUrl: ${localItem.postUrl || 'none'}\n`;
      message += `├ postedAt: ${localItem.postedAt || 'not set'}\n`;
      message += `└ scheduledAt: ${localItem.scheduledAt || 'not set'}\n\n`;

      // Status comparison
      const zernioStatus = post.status?.toUpperCase();
      const localStatus = localItem.status;

      message += `*Status Comparison:*\n`;
      message += `├ Zernio: \`${zernioStatus}\`\n`;
      message += `└ Local: \`${localStatus}\`\n\n`;

      if (zernioStatus === 'PUBLISHED' && localStatus !== 'POSTED_CONFIRMED') {
        message += `⚠️ *MISMATCH:* Zernio shows published but DB doesn't!\n`;
        message += `💡 Run: /confirmpost ${localItem.id}\n`;
      } else if (zernioStatus === 'DRAFT' && localStatus === 'POSTED_CONFIRMED') {
        message += `❌ *ERROR:* DB shows posted but Zernio is still draft!\n`;
      } else if (zernioStatus === 'DRAFT' && !post.url) {
        message += `⚠️ *NOT PUBLISHED:* Post is still in draft status.\n`;
        message += `💡 Check Zernio dashboard to publish/schedule manually.\n`;
      } else if (zernioStatus === 'PUBLISHED' || post.url) {
        message += `✅ *CONFIRMED:* Post is actually published!\n`;
      }
    } else {
      message += `*Local Database:*\n`;
      message += `└ No distribution item found for this postId\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[ZernioStatus] Error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /schedule - Schedule a Zernio draft for future publishing
bot.command('schedule', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (!args) {
    await ctx.reply(`📎 *Schedule Zernio Draft*

Usage:
• /schedule [distributionId] [datetime]

Examples:
• /schedule abc123def 2026-06-05 10:00
• /schedule abc123def tomorrow 14:00
• /schedule abc123def +2h

Find distribution ID from /showflow output.

⚠️ Draft must exist in Zernio first.`);
    return;
  }

  // Parse args: distributionId and datetime
  const parts = args.match(/^(\S+)\s+(.+)$/);
  if (!parts) {
    await ctx.reply(`❌ Invalid format. Use: /schedule [distributionId] [datetime]`);
    return;
  }

  const distributionId = parts[1];
  const datetimeStr = parts[2];

  // Parse datetime
  let scheduledDate: Date;
  const datetimeLower = datetimeStr.toLowerCase();

  if (datetimeLower === 'tomorrow') {
    scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 1);
    scheduledDate.setHours(10, 0, 0, 0);
  } else if (datetimeLower.startsWith('+')) {
    // Relative time like +2h, +30m
    const match = datetimeLower.match(/\+(\d+)(h|m|d)/);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      scheduledDate = new Date();
      if (unit === 'm') scheduledDate.setMinutes(scheduledDate.getMinutes() + amount);
      else if (unit === 'h') scheduledDate.setHours(scheduledDate.getHours() + amount);
      else if (unit === 'd') scheduledDate.setDate(scheduledDate.getDate() + amount);
    } else {
      await ctx.reply(`❌ Invalid relative time. Use: +1h, +30m, +1d`);
      return;
    }
  } else {
    // Try to parse as date string
    try {
      scheduledDate = new Date(datetimeStr);
      if (isNaN(scheduledDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch {
      await ctx.reply(`❌ Invalid datetime format. Try:
• 2026-06-05 10:00
• tomorrow 14:00
• +2h (2 hours from now)`);
      return;
    }
  }

  // Must be in the future
  if (scheduledDate.getTime() <= Date.now()) {
    await ctx.reply(`❌ Scheduled time must be in the future.`);
    return;
  }

  await ctx.reply(`⏳ Scheduling draft ${distributionId.substring(0, 8)}... for ${scheduledDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);

  try {
    // Import distribution service
    const { scheduleDraft } = await import('../services/distribution');

    const result = await scheduleDraft(distributionId, scheduledDate);

    if (result.success) {
      await ctx.reply(`✅ *Post Scheduled!*

📋 Distribution ID: \`${distributionId.substring(0, 8)}...\`
🕐 Scheduled for: ${scheduledDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
🔗 Zernio Post ID: \`${result.scheduledPostId?.substring(0, 12)}...\`

Zernio will auto-publish at the scheduled time.`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ *Scheduling Failed*

Error: ${result.error}

Make sure:
• Distribution has a Zernio draft (status: ZERNIO_DRAFT_CREATED)
• Video/image is attached`);
    }
  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /storage - Storage status
bot.command('storage', async (ctx) => {
  try {
    const { testGoogleDriveConnection, getGoogleDriveStorageInfo, isGoogleDriveConfigured, getConfiguredProviders } = await import('../services/cloud-storage');

    const googleResult = await testGoogleDriveConnection();
    const providers = getConfiguredProviders();
    const localProvider = providers.find(p => p.provider === 'LOCAL');

    // Get temp files count
    const tempDir = process.env.LOCAL_TEMP_DIR || './tmp';
    let tempFiles = 0;
    let tempSize = 0;

    try {
      if (require('fs').existsSync(tempDir)) {
        const files = require('fs').readdirSync(tempDir);
        tempFiles = files.length;
        for (const file of files) {
          try {
            const stats = require('fs').statSync(require('path').join(tempDir, file));
            tempSize += stats.size;
          } catch {}
        }
      }
    } catch {}

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    let message = `📦 *STORAGE STATUS*\n\n`;

    // Provider status
    message += `🔧 *Cloud Storage Provider*\n`;
    message += `├ Google Drive: ${googleResult.connected ? '✅ Connected' : '❌ Not Configured'}\n`;
    message += `├ Dropbox: ${providers.find(p => p.provider === 'DROPBOX')?.configured ? '✅ Configured' : '❌ Not Configured'}\n`;
    message += `└ Local Temp: ${localProvider?.configured ? '✅ Active' : '❌ Disabled'}\n\n`;

    // Google Drive details
    if (googleResult.connected) {
      message += `📁 *Google Drive*\n`;
      message += `├ Status: ✅ Connected\n`;
      message += `├ ${googleResult.message}\n`;
      message += `└ Folder: AI-Affiliate-Engine/\n`;
    } else {
      message += `📁 *Google Drive*\n`;
      message += `├ Status: ❌ Not configured\n`;
      message += `├ Will create: AI-Affiliate-Engine/Crypto-EW\n`;
      message += `└ Will create: AI-Affiliate-Engine/Pippit-Manual\n`;
    }

    message += `\n📂 *Local Temp (Cache)*\n`;
    message += `├ Files: ${tempFiles}\n`;
    message += `├ Size: ${formatBytes(tempSize)}\n`;
    message += `└ Auto Cleanup: ON\n`;

    // Next steps
    if (!googleResult.connected) {
      message += `\n\n💡 *To enable Google Drive:*\n`;
      message += `1. Add GOOGLE_CLIENT_ID to .env\n`;
      message += `2. Add GOOGLE_CLIENT_SECRET to .env\n`;
      message += `3. Run: npm run setup:google-drive\n`;
      message += `4. Authorize with Google account\n`;
      message += `5. Folders will be created automatically\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ============================================
// CALLBACK HANDLERS
// ============================================

import { executeApprovalPipeline, getContentPipelineStatus } from '../services/approval-pipeline';

bot.callbackQuery(/^appr_(.+)$/, async (ctx) => {
  const contentId = ctx.match[1];
  const telegramId = String(ctx.from?.id || '');

  try {
    // Get current session for brand info
    const session = await prisma.telegramSession.findUnique({
      where: { telegramId },
    });

    console.log(`[Approval] User ${telegramId} approving content ${contentId}`);
    console.log(`[Approval] Active brand: ${session?.activeBrandSlug || 'none'}`);

    // Execute the approval pipeline
    const result = await executeApprovalPipeline(contentId, {
      autoApprove: true,
      provider: 'HIGGSFIELD_AUTO',
      platform: 'TIKTOK',
      brandId: session?.activeBrandId || undefined,
    });

    await ctx.answerCallbackQuery(result.success ? '✅ Pipeline started!' : '⚠️ ' + (result.error || 'Check logs'));

    // Build response message
    let response = result.success
      ? `✅ *Content Approved!*\n\n📋 Pipeline Steps:\n`
      : `❌ *Approval Failed*\n\n`;

    for (const step of result.steps) {
      response += `${step}\n`;
    }

    if (result.success) {
      response += `\n📊 *Summary:*\n`;
      response += `• Production Package: ${result.productionPackageId || 'N/A'}\n`;
      response += `• Render Jobs: ${result.renderJobIds?.length || 0}\n`;
      response += `• Distribution: ${result.distributionItemId || 'N/A'}\n`;

      if (result.distributionItemId) {
        response += `\n🔄 Distribution queued for processing`;
      }
    }

    await ctx.reply(response, { parse_mode: 'Markdown' });

    // Log approval
    await prisma.approvalLog.create({
      data: {
        contentId,
        action: 'APPROVED_PIPELINE',
        notes: JSON.stringify({ steps: result.steps }),
      },
    });

  } catch (error: any) {
    console.error('[Approval] Error:', error);
    await ctx.answerCallbackQuery('❌ Error');
    await ctx.reply(`❌ Error approving content: ${error.message}`);
  }
});

bot.callbackQuery(/^rejt_(.+)$/, async (ctx) => {
  const contentId = ctx.match[1];

  try {
    await prisma.content.update({
      where: { id: contentId },
      data: {
        approvalStatus: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: 'Rejected via Telegram',
      },
    });

    await prisma.approvalLog.create({
      data: {
        contentId,
        action: 'REJECTED',
      },
    });

    await ctx.answerCallbackQuery('❌ Rejected!');
    await ctx.reply('❌ Content rejected.');
  } catch (error) {
    await ctx.answerCallbackQuery('❌ Error');
    await ctx.reply('❌ Error rejecting content');
  }
});

bot.callbackQuery(/^view_(.+)$/, async (ctx) => {
  const contentId = ctx.match[1];

  try {
    // Get pipeline status for this content
    const pipelineStatus = await getContentPipelineStatus(contentId);

    if (!pipelineStatus) {
      await ctx.answerCallbackQuery('❌ Content not found');
      return;
    }

    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        product: true,
        qualityScores: true,
      },
    });

    if (!content) {
      await ctx.answerCallbackQuery('❌ Content not found');
      return;
    }

    await ctx.answerCallbackQuery();

    // Build detailed response
    let message = `📋 *Content Pipeline Status*\n\n`;

    message += `📦 *Product:* ${content.product.name}\n`;
    message += `📝 *Content Status:* ${content.approvalStatus}\n\n`;

    // Production packages
    if (pipelineStatus.production.length > 0) {
      message += `🎬 *Production Packages:*\n`;
      for (const pkg of pipelineStatus.production) {
        message += `  • ${pkg.status}`;
        if (pkg.renderJobs.length > 0) {
          message += ` | Jobs: ${pkg.renderJobs.map(j => `${j.tool}(${j.status})`).join(', ')}`;
        }
        message += `\n`;
      }
    } else {
      message += `🎬 *Production:* Not started\n`;
    }

    // Distribution
    if (pipelineStatus.distribution.length > 0) {
      message += `\n📨 *Distribution Queue:*\n`;
      for (const dist of pipelineStatus.distribution.slice(0, 3)) {
        message += `  • ${dist.status}`;
        if (dist.postUrl) message += ` | ${dist.postUrl}`;
        message += `\n`;
      }
    } else {
      message += `\n📨 *Distribution:* Not created\n`;
    }

    message += `\n🔄 Use /approve ${contentId.substring(0, 8)} to trigger pipeline`;

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    await ctx.answerCallbackQuery('❌ Error');
  }
});

// Distribution processing callback
bot.callbackQuery(/^dist_(.+)$/, async (ctx) => {
  const distributionId = ctx.match[1];

  try {
    await ctx.answerCallbackQuery('⏳ Processing...');

    const result = await executeDistributionPipeline(distributionId);

    let message = result.success
      ? `✅ *Distribution Processed*\n\n`
      : `⚠️ *Distribution Incomplete*\n\n`;

    for (const step of result.steps) {
      message += `${step}\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error: any) {
    await ctx.answerCallbackQuery('❌ Error');
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// ============================================
// TEXT HANDLER (for direct link submission)
// ============================================

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Ignore commands
  if (text.startsWith('/')) return;

  const supportedPlatforms = ['shopee', 'tokopedia', 'lazada', 'tiktok'];
  const isLink = text.startsWith('http') && supportedPlatforms.some(p => text.toLowerCase().includes(p));

  if (isLink) {
    await ctx.reply('⏳ Processing link... Use /add [link] for proper processing with Phase 2 generation.');
  }
});

// ============================================
// STARTUP LOGS
// ============================================

async function getBotInfo() {
  try {
    const me = await bot.api.getMe();
    logInfo('Bot Information:', {
      username: me.username,
      firstName: me.first_name,
      canJoinGroups: me.can_join_groups,
      supportsInlineQueries: me.supports_inline_queries
    });
    return me.username;
  } catch (error) {
    logError('Failed to get bot info');
    return 'unknown';
  }
}

async function logRegisteredCommands() {
  try {
    const commands = [
      { command: 'start', description: 'Start the bot' },
      { command: 'help', description: 'Show help' },
      { command: 'ping', description: 'Test bot' },
      { command: 'add', description: 'Add IMAGE to queue' },
      { command: 'addcarousel', description: 'Add CAROUSEL to queue' },
      { command: 'addvideo', description: 'Add VIDEO (Pippit) to queue' },
      { command: 'queue', description: 'View queue' },
      { command: 'queueset', description: 'Set schedule' },
      { command: 'queueprocess', description: 'Process queue' },
      { command: 'queueclear', description: 'Clear queue' },
      { command: 'status', description: 'System status' },
      { command: 'stats', description: 'Analytics' },
      { command: 'products', description: 'List products' },
      { command: 'pending', description: 'Pending contents' },
      { command: 'brand', description: 'Brand selection' },
      { command: 'currentbrand', description: 'View active brand' },
      { command: 'view', description: 'View content' },
      { command: 'approve', description: 'Approve & generate' },
      { command: 'reject', description: 'Reject content' },
      { command: 'showflow', description: 'Pipeline status' },
      { command: 'schedule', description: 'Schedule post' },
      { command: 'pippit', description: 'Pippit manual workflow' },
      { command: 'attachvideo', description: 'Attach video URL' },
      { command: 'production', description: 'Production packages' },
      { command: 'render', description: 'Render jobs' },
      { command: 'storage', description: 'Storage status' },
      { command: 'zerniostatus', description: 'Check Zernio post' },
      { command: 'linktrack', description: 'Link tracking status' },
    ];
    logInfo('📋 Command handlers registered:', { count: commands.length });
    commands.forEach(cmd => {
      logInfo(`  /${cmd.command} - ${cmd.description}`);
    });

    // Register commands with Telegram
    try {
      const result = await bot.api.setMyCommands(commands.map(c => ({ command: c.command, description: c.description })));
      logInfo('✅ Telegram setMyCommands result:', JSON.stringify(result));
    } catch (err: any) {
      logError('❌ Telegram setMyCommands failed:', err.message || err);
    }
  } catch (error) {
    logError('Failed to log commands');
  }
}

// ============================================
// CHECK FOR WEBHOOK CONFLICTS
// ============================================

async function ensureNoWebhook() {
  try {
    const webhookInfo = await bot.api.getWebhookInfo();
    logInfo('Webhook info:', webhookInfo);

    if (webhookInfo.url) {
      logInfo('⚠️ Webhook is set! Deleting webhook to enable polling...');
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      logInfo('✅ Webhook deleted');
    } else {
      logInfo('✅ No webhook active - polling will work');
    }

    // Also clear any pending updates
    logInfo('Clearing any pending updates...');
    try {
      await bot.api.getUpdates({ offset: -1, limit: 1, timeout: 0 });
      logInfo('✅ Pending updates cleared');
    } catch (e: any) {
      // This might fail with 409 Conflict if another instance is polling
      if (e.message?.includes('409')) {
        logError('⚠️ Conflict: Another bot instance might be running!');
      }
    }
  } catch (error) {
    logError('Error checking webhook:', error);
  }
}

// ============================================
// START BOT
// ============================================

console.log('\n============================================');
console.log('🤖 AI AFFILIATE ENGINE - TELEGRAM BOT');
console.log('============================================');
logInfo('Initializing bot...');
logInfo('Token:', BOT_TOKEN ? 'SET ✓' : 'NOT SET ✗');

// Graceful start
async function startBot() {
  try {
    // Get bot info
    const botUsername = await getBotInfo();

    // CRITICAL: Ensure webhook is deleted before polling
    await ensureNoWebhook();

    // Log registered commands
    await logRegisteredCommands();

    // Send startup notification
    if (ADMIN_CHAT_ID) {
      await bot.api.sendMessage(
        ADMIN_CHAT_ID,
        `🟢 *Bot Started Successfully!*\n\n` +
        `🤖 Username: @${botUsername}\n` +
        `📅 Time: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n` +
        `🔧 Mode: Grammy (migrated from Telegraf)\n\n` +
        `Available commands: /help`
      );
    }

    logInfo('Starting long polling...');

    // Start bot with explicit allowed updates
    await bot.start({
      allowed_updates: ['message', 'callback_query'],
    });

    logInfo('✅ Polling started successfully!');
    logInfo('📡 Listening for commands...');
    console.log('============================================\n');

  } catch (error: any) {
    logError('Failed to start bot:', error.message);
    process.exit(1);
  }
}

// Handle shutdown
process.once('SIGINT', () => {
  console.log('🛑 Stopping bot...');
  bot.stop();
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Stopping bot...');
  bot.stop();
  process.exit(0);
});

// Start the bot
startBot();

export default bot;
