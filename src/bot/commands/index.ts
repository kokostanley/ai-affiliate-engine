// ============================================
// Bot Commands (Simplified)
// ============================================

import { Markup } from 'telegraf';
import { getOrCreateSession, updateUserInfo, getSystemStats, getUserStats, getActiveProducts, getPendingContent, getContentById, updateContentApproval, updateUserStats, isAdmin } from '../database';
import { formatNumber, escapeHtml } from '../utils';

export async function handleStartCommand(ctx: any) {
  const telegramId = String(ctx.from?.id || '');
  const username = ctx.from?.username;
  const firstName = ctx.from?.first_name || 'User';

  const user = await getOrCreateSession(telegramId);

  if (username) {
    await updateUserInfo(telegramId, { username, firstName });
  }

  const stats = await getSystemStats();
  const userStats = await getUserStats(telegramId);

  const welcomeMessage = `🎉 <b>Selamat datang di AI Affiliate Engine!</b>\n\nHalo <b>${escapeHtml(firstName)}</b>! 👋\n\n📊 <b>Status:</b>\n• Total Produk: ${formatNumber(stats.totalProducts)}\n• Produk Aktif: ${formatNumber(stats.activeProducts)}\n• Konten Pending: ${formatNumber(stats.pendingContent)}\n• Total Klik: ${formatNumber(stats.totalClicks)}\n\n📈 <b>Statistik Anda:</b>\n• Disetujui: ${formatNumber(userStats.approvedCount)}\n• Ditolak: ${formatNumber(userStats.rejectedCount)}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📦 Produk', 'menu:products'), Markup.button.callback('✨ Generate', 'menu:generate')],
    [Markup.button.callback('⏳ Pending', 'menu:pending'), Markup.button.callback('📊 Statistik', 'menu:stats')],
    [Markup.button.callback('« Kembali', 'menu:main')],
  ]);

  await ctx.reply(welcomeMessage, { parse_mode: 'HTML', ...keyboard });
}

export async function handleHelpCommand(ctx: any) {
  const helpMessage = `📖 <b>PANDUAN PENGGUNAAN</b>\n\n<b>📌 COMMAND:</b>\n<code>/start</code> - Memulai bot\n<code>/help</code> - Menampilkan bantuan\n<code>/status</code> - Status sistem\n<code>/products</code> - Daftar produk\n<code>/generate</code> - Generate konten\n<code>/pending</code> - Konten pending\n\n<b>🔧 ADMIN:</b>\n<code>/approve [id]</code> - Setujui\n<code>/reject [id]</code> - Tolak\n<code>/pending</code> - Lihat pending`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📦 Produk', 'menu:products'), Markup.button.callback('✨ Generate', 'menu:generate')],
    [Markup.button.callback('« Menu Utama', 'menu:main')],
  ]);

  await ctx.reply(helpMessage, { parse_mode: 'HTML', ...keyboard });
}

export async function handleStatusCommand(ctx: any) {
  const stats = await getSystemStats();
  const telegramId = String(ctx.from?.id || '');

  const statusEmoji = stats.pendingContent > 0 ? '🟡' : '🟢';

  const statusMessage = `${statusEmoji} <b>STATUS SISTEM</b>\n\n📦 <b>Produk:</b>\n   • Total: ${formatNumber(stats.totalProducts)}\n   • Aktif: ${formatNumber(stats.activeProducts)}\n\n📝 <b>Konten:</b>\n   • Pending: ${formatNumber(stats.pendingContent)}\n   • Approved: ${formatNumber(stats.approvedContent)}\n\n🔗 <b>Links:</b>\n   • Total Klik: ${formatNumber(stats.totalClicks)}\n\n📅 <b>Posting:</b>\n   • Hari Ini: ${formatNumber(stats.todayPosts)}\n\n${stats.pendingContent > 0 ? '⚠️ Ada konten yang menunggu approval!' : '✅ Semua berjalan normal'}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'action:refresh_status')],
    [Markup.button.callback('« Menu Utama', 'menu:main')],
  ]);

  await ctx.reply(statusMessage, { parse_mode: 'HTML', ...keyboard });
}

export async function handleProductsCommand(ctx: any) {
  const products = await getActiveProducts();

  if (products.length === 0) {
    await ctx.reply('📦 <b>Belum ada produk</b>', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[Markup.button.callback('« Menu Utama', 'menu:main')]] },
    });
    return;
  }

  let message = `📦 <b>DAFTAR PRODUK (${products.length})</b>\n\n`;

  for (const product of products.slice(0, 10)) {
    message += `📦 <b>${escapeHtml(product.name)}</b>\n`;
    message += `   💰 Rp ${Number(product.price).toLocaleString('id-ID')}\n`;
    message += `   📊 Komisi: ${product.commission}%\n\n`;
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('« Menu Utama', 'menu:main')],
  ]);

  await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}

export async function handlePendingCommand(ctx: any) {
  const telegramId = String(ctx.from?.id || '');

  if (!(await isAdmin(telegramId))) {
    await ctx.reply('⛔ Anda bukan admin.');
    return;
  }

  const pending = await getPendingContent(10);

  if (pending.length === 0) {
    await ctx.reply('✅ <b>Tidak ada konten pending</b>\n\nSemua konten sudah diproses!', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[Markup.button.callback('« Menu Utama', 'menu:main')]] },
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
    [Markup.button.callback('« Menu Utama', 'menu:main')],
  ]);

  await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
}

export async function handleApproveCommand(ctx: any, contentId: string) {
  const telegramId = String(ctx.from?.id || '');

  if (!(await isAdmin(telegramId))) {
    await ctx.reply('⛔ Anda bukan admin.');
    return;
  }

  const content = await getContentById(contentId);
  if (!content) {
    await ctx.reply(`❌ Konten dengan ID "${contentId}" tidak ditemukan.`);
    return;
  }

  await updateContentApproval(contentId, 'approve', telegramId);
  await updateUserStats(telegramId, true);

  await ctx.reply(`✅ <b>KONTEN DISETUJI</b>\n\n📦 ${content.product.name}\n📝 ${content.contentType}\n\nKonten sudah siap untuk di-schedule!`, { parse_mode: 'HTML' });
}

export async function handleRejectCommand(ctx: any, contentId: string, reason: string) {
  const telegramId = String(ctx.from?.id || '');

  if (!(await isAdmin(telegramId))) {
    await ctx.reply('⛔ Anda bukan admin.');
    return;
  }

  const content = await getContentById(contentId);
  if (!content) {
    await ctx.reply(`❌ Konten dengan ID "${contentId}" tidak ditemukan.`);
    return;
  }

  await updateContentApproval(contentId, 'reject', telegramId, reason);
  await updateUserStats(telegramId, false);

  await ctx.reply(`❌ <b>KONTEN DITOLAK</b>\n\n📝 ID: ${contentId}\n📋 Alasan: ${escapeHtml(reason)}\n\nKonten tidak akan di-schedule.`, { parse_mode: 'HTML' });
}