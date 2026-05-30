// ============================================
// Approval Handlers (Simplified)
// ============================================

import { Markup } from 'telegraf';
import { getContentById, updateContentApproval, updateUserStats, isAdmin, getPendingContent } from '../database';

export async function handleApprove(ctx: any, contentId: string) {
  const telegramId = String(ctx.from?.id || '');

  if (!(await isAdmin(telegramId))) {
    await ctx.answerCbQuery('⛔ Hanya admin yang bisa approve', { show_alert: true });
    return;
  }

  const content = await getContentById(contentId);
  if (!content) {
    await ctx.answerCbQuery('❌ Konten tidak ditemukan', { show_alert: true });
    return;
  }

  await updateContentApproval(contentId, 'approve', telegramId);
  await updateUserStats(telegramId, true);

  await ctx.answerCbQuery('✅ Konten disetujui!', { show_alert: true });

  await ctx.editMessageText(`✅ <b>KONTEN DISETUJI</b>\n\n📦 ${content.product.name}\n📝 ${content.contentType}`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[Markup.button.callback('« Kembali', 'menu:pending')]] },
  });
}

export async function handleReject(ctx: any, contentId: string) {
  const telegramId = String(ctx.from?.id || '');

  if (!(await isAdmin(telegramId))) {
    await ctx.answerCbQuery('⛔ Hanya admin', { show_alert: true });
    return;
  }

  const content = await getContentById(contentId);
  if (!content) {
    await ctx.answerCbQuery('❌ Konten tidak ditemukan', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery();

  await ctx.editMessageText(`❌ <b>TOLAK KONTEN</b>\n\n📝 ${content.product.name}\n\nPilih alasan:`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [Markup.button.callback('🔴 Kualitas Buruk', `reject:reason:${contentId}:quality`), Markup.button.callback('🟡 Tidak Relevan', `reject:reason:${contentId}:relevance`)],
        [Markup.button.callback('« Batal', `pending:view:${contentId}`)],
      ],
    },
  });
}

export async function handleRejectWithReason(ctx: any, contentId: string, reason: string) {
  const telegramId = String(ctx.from?.id || '');

  if (!(await isAdmin(telegramId))) return;

  const reasonMap: Record<string, string> = { quality: 'Kualitas kurang baik', relevance: 'Tidak relevan', platform: 'Salah platform', other: 'Lainnya' };
  const reasonText = reasonMap[reason] || reason;

  await updateContentApproval(contentId, 'reject', telegramId, reasonText);
  await updateUserStats(telegramId, false);

  await ctx.answerCbQuery('❌ Konten ditolak', { show_alert: true });

  await ctx.editMessageText(`❌ <b>KONTEN DITOLAK</b>\n\n📋 Alasan: ${reasonText}\n\nKonten tidak akan di-schedule.`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[Markup.button.callback('« Kembali', 'menu:pending')]] },
  });
}

export async function handleRegenerate(ctx: any, contentId: string) {
  const telegramId = String(ctx.from?.id || '');

  if (!(await isAdmin(telegramId))) {
    await ctx.answerCbQuery('⛔ Hanya admin', { show_alert: true });
    return;
  }

  const content = await getContentById(contentId);
  if (!content) {
    await ctx.answerCbQuery('❌ Konten tidak ditemukan', { show_alert: true });
    return;
  }

  await updateContentApproval(contentId, 'regenerate', telegramId);

  await ctx.answerCbQuery('🔄 Permintaan regenerate dikirim', { show_alert: true });

  await ctx.editMessageText(`🔄 <b>REGENERATE</b>\n\n📝 ${content.contentType}\n🎯 ${content.platform}\n\n⏳ AI sedang membuat versi baru...`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[Markup.button.callback('« Kembali', 'menu:pending')]] },
  });
}

export async function handleViewPendingContent(ctx: any, contentId: string) {
  const content = await getContentById(contentId);

  if (!content) {
    await ctx.answerCbQuery('❌ Konten tidak ditemukan', { show_alert: true });
    return;
  }

  let message = `📋 <b>KONTEN PENDING</b>\n\n`;
  message += `📦 Produk: ${content.product.name}\n`;
  message += `📝 Tipe: ${content.contentType}\n`;
  message += `🎯 Platform: ${content.platform}\n`;
  message += `✅ Status: ${content.approvalStatus}\n\n`;

  if (content.hook) message += `🎣 <b>Hook:</b>\n${content.hook.slice(0, 150)}...\n\n`;
  if (content.caption) message += `📄 <b>Caption:</b>\n${content.caption.slice(0, 150)}...\n\n`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Approve', `approve:${contentId}`), Markup.button.callback('❌ Reject', `reject:${contentId}`)],
    [Markup.button.callback('🔄 Regenerate', `regenerate:${contentId}`)],
    [Markup.button.callback('« Kembali', 'menu:pending')],
  ]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: keyboard });
}

export async function handleRefreshPending(ctx: any) {
  const pending = await getPendingContent(10);

  if (pending.length === 0) {
    await ctx.editMessageText('✅ <b>Tidak ada konten pending</b>', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[Markup.button.callback('« Kembali', 'menu:main')]] },
    });
    return;
  }

  let message = `⏳ <b>KONTEN PENDING (${pending.length})</b>\n\n`;

  for (let i = 0; i < pending.length; i++) {
    const content = pending[i];
    message += `${i + 1}. 📦 ${content.product.name}\n`;
    message += `   📝 ${content.contentType}\n\n`;
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📋 Lihat Pertama', `pending:view:${pending[0].id}`)],
    [Markup.button.callback('« Kembali', 'menu:main')],
  ]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: keyboard });
}