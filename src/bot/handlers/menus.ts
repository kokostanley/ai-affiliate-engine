// ============================================
// Menu Handlers (Simplified)
// ============================================

import { Markup } from 'telegraf';
import { getSystemStats, getPendingContent, getActiveProducts } from '../database';
import { formatNumber, escapeHtml } from '../utils';

export async function handleMainMenu(ctx: any) {
  const stats = await getSystemStats();

  const message = `🏠 <b>MENU UTAMA</b>\n\n📊 <b>Status:</b>\n• Produk Aktif: ${formatNumber(stats.activeProducts)}\n• Konten Pending: ${formatNumber(stats.pendingContent)}\n• Total Klik: ${formatNumber(stats.totalClicks)}\n\nPilih menu di bawah:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📦 Produk', 'menu:products'), Markup.button.callback('✨ Generate', 'menu:generate')],
    [Markup.button.callback('⏳ Pending', 'menu:pending'), Markup.button.callback('📊 Statistik', 'menu:stats')],
    [Markup.button.callback('« Kembali', 'menu:main')],
  ]);

  await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
}

export async function handleProductsMenu(ctx: any) {
  const products = await getActiveProducts();

  if (products.length === 0) {
    await ctx.editMessageText('📦 <b>Tidak ada produk</b>', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[Markup.button.callback('« Kembali', 'menu:main')]] },
    });
    return;
  }

  let message = `📦 <b>DAFTAR PRODUK (${products.length})</b>\n\n`;

  for (const product of products.slice(0, 6)) {
    message += `• <b>${escapeHtml(product.name)}</b>\n`;
    message += `  ${product.affiliatePlatform} • ${product.category}\n\n`;
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('« Kembali', 'menu:main')],
  ]);

  await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
}

export async function handleGenerateMenu(ctx: any) {
  const products = await getActiveProducts();

  if (products.length === 0) {
    await ctx.editMessageText('❌ <b>Tidak ada produk</b>\n\nTambahkan produk terlebih dahulu.', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[Markup.button.callback('« Kembali', 'menu:main')]] },
    });
    return;
  }

  const message = `✨ <b>GENERATE KONTEN</b>\n\nPilih produk untuk generate konten:`;

  const productButtons = products.slice(0, 8).map(product =>
    Markup.button.callback(`📦 ${escapeHtml(product.name.slice(0, 25))}`, `gen:product:${product.id}`)
  );

  const keyboard = [...chunkArray(productButtons, 2), [Markup.button.callback('« Kembali', 'menu:main')]];

  await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

export async function handlePendingMenu(ctx: any) {
  const pending = await getPendingContent(10);

  if (pending.length === 0) {
    await ctx.editMessageText('✅ <b>Tidak ada konten pending</b>\n\nSemua konten sudah diproses!', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[Markup.button.callback('🔄 Refresh', 'menu:pending'), Markup.button.callback('« Kembali', 'menu:main')]] },
    });
    return;
  }

  let message = `⏳ <b>KONTEN PENDING (${pending.length})</b>\n\n`;

  for (let i = 0; i < pending.length; i++) {
    const content = pending[i];
    message += `${i + 1}. 📦 <b>${escapeHtml(content.product.name)}</b>\n`;
    message += `   📝 ${content.contentType}\n\n`;
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📋 Lihat Pertama', `pending:view:${pending[0].id}`)],
    [Markup.button.callback('🔄 Refresh', 'menu:pending')],
    [Markup.button.callback('« Kembali', 'menu:main')],
  ]);

  await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
}

export async function handleStatsMenu(ctx: any) {
  const stats = await getSystemStats();

  const message = `📊 <b>STATISTIK</b>\n\n<b>Produk:</b>\n├ Total: ${formatNumber(stats.totalProducts)}\n├ Aktif: ${formatNumber(stats.activeProducts)}\n\n<b>Konten:</b>\n├ Pending: ${formatNumber(stats.pendingContent)}\n├ Approved: ${formatNumber(stats.approvedContent)}\n\n<b>Tracking:</b>\n├ Total Klik: ${formatNumber(stats.totalClicks)}\n├ Post Hari Ini: ${formatNumber(stats.todayPosts)}\n`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'menu:stats')],
    [Markup.button.callback('« Kembali', 'menu:main')],
  ]);

  await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
}

export async function handleSettingsMenu(ctx: any) {
  const message = `⚙️ <b>PENGATURAN</b>\n\n<b>Konfigurasi Bot:</b>\n• Notifikasi ✅\n• Auto-approve (off) ❌\n• Mode quiet (off) ❌\n\n<b>Preferensi:</b>\n• Bahasa: Indonesia 🇮🇩\n• Zona Waktu: WIB (UTC+7)\n• Tone: Casual`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('« Kembali', 'menu:main')],
  ]);

  await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
}

export async function handlePlatformSelection(ctx: any, productId: string) {
  const products = await getActiveProducts();
  const product = products.find(p => p.id === productId);

  if (!product) {
    await ctx.editMessageText('❌ Produk tidak ditemukan.', {
      reply_markup: { inline_keyboard: [[Markup.button.callback('« Kembali', 'menu:generate')]] },
    });
    return;
  }

  const platforms = [
    ['🎵 TikTok', 'TIKTOK'],
    ['📸 Instagram', 'INSTAGRAM'],
    ['👥 Facebook', 'FACEBOOK'],
    ['🎬 YouTube', 'YOUTUBE'],
    ['✈️ Telegram', 'TELEGRAM'],
    ['💬 WhatsApp', 'WHATSAPP'],
  ];

  const keyboard = platforms.map(p => [Markup.button.callback(p[0], `gen:platform:${productId}:${p[1]}`)]);
  keyboard.push([Markup.button.callback('« Kembali', `gen:product:${productId}`)]);

  await ctx.editMessageText(`✨ <b>SELECT PLATFORM</b>\n\n📦 Produk: <b>${escapeHtml(product.name)}</b>\n\nPilih platform target:`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function handleContentTypeSelection(ctx: any, productId: string, platform: string) {
  const products = await getActiveProducts();
  const product = products.find(p => p.id === productId);

  if (!product) return;

  const contentTypes = [
    ['🎣 Hook', 'TIKTOK_HOOK'],
    ['📝 Script', 'TIKTOK_SCRIPT'],
    ['📄 Caption', 'CAPTION'],
    ['#️⃣ Hashtags', 'HASHTAG_SET'],
    ['🎯 Mixed', 'MIXED_CONTENT'],
  ];

  const keyboard = contentTypes.map(t => [Markup.button.callback(t[0], `gen:type:${productId}:${platform}:${t[1]}`)]);
  keyboard.push([Markup.button.callback('« Kembali', `gen:platform:${productId}`)]);

  await ctx.editMessageText(`✨ <b>SELECT CONTENT TYPE</b>\n\n📦 Produk: <b>${escapeHtml(product.name)}</b>\n🎯 Platform: ${platform}\n\nPilih tipe konten:`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}