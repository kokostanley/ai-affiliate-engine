/**
 * Automation Commands
 * Telegram bot commands for automation management
 */

import { Context, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { automationManager } from '../../services/automation-manager';
import { smartScheduler } from '../../services/smart-scheduler';
import { Platform, ContentType, ALL_PLATFORMS, ALL_CONTENT_TYPES } from '../../lib/content-variations';

const prisma = new PrismaClient();

/**
 * Handle /autopost command
 */
export async function handleAutopostCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id.toString() || '';
  const args = ctx.message?.text.split(' ').slice(1) || [];

  // Get user's active brand
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  if (!session?.activeBrandId) {
    await ctx.reply('⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand.');
    return;
  }

  const brandId = session.activeBrandId;

  // Parse command
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case 'on':
    case 'enable':
      await enableAutomation(ctx, brandId);
      break;

    case 'off':
    case 'disable':
      await disableAutomation(ctx, brandId);
      break;

    case 'status':
      await showAutomationStatus(ctx, brandId);
      break;

    default:
      await showAutopostHelp(ctx);
  }
}

/**
 * Enable automation
 */
async function enableAutomation(ctx: Context, brandId: string): Promise<void> {
  try {
    await automationManager.enableAutomation(brandId);
    await ctx.reply(
      '✅ *Automation Diaktifkan!*\n\n' +
      'Sekarang setiap link yang kamu paste akan diproses otomatis.\n' +
      'Konten akan di-generate dan diposting sesuai jadwal.'
    );
  } catch (error: any) {
    await ctx.reply(`❌ Gagal mengaktifkan automation: ${error.message}`);
  }
}

/**
 * Disable automation
 */
async function disableAutomation(ctx: Context, brandId: string): Promise<void> {
  try {
    await automationManager.disableAutomation(brandId);
    await ctx.reply('🔴 *Automation Dinonaktifkan!*\n\nLink yang kamu paste tidak akan diproses otomatis.');
  } catch (error: any) {
    await ctx.reply(`❌ Gagal menonaktifkan automation: ${error.message}`);
  }
}

/**
 * Show automation status
 */
async function showAutomationStatus(ctx: Context, brandId: string): Promise<void> {
  try {
    const status = await automationManager.getStatus(brandId);

    const statusEmoji = status.enabled ? '🟢' : '🔴';
    const pausedEmoji = status.paused ? '⏸️' : '';

    const message = [
      `${statusEmoji} *AUTOMATION STATUS* ${pausedEmoji}`,
      '─────────────────────',
      `Enabled: ${status.enabled ? 'Ya' : 'Tidak'}`,
      `Posts/Hari: ${status.todayPosts}/${status.postsPerDay}`,
      `Platforms: ${status.platforms.join(', ')}`,
      `Content Types: ${status.contentTypes.join(', ')}`,
      `Jadwal: ${status.postingTimes.join(', ')}`,
      status.nextPostTime
        ? `Next Post: ${new Date(status.nextPostTime).toLocaleString('id-ID')}`
        : 'Next Post: -',
      status.paused
        ? `Paused Until: ${new Date(status.pausedUntil!).toLocaleString('id-ID')}`
        : '',
    ].filter(Boolean).join('\n');

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Gagal mengambil status: ${error.message}`);
  }
}

/**
 * Show autopost help
 */
async function showAutopostHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    '📚 *AUTOPOST COMMANDS*\n\n' +
    '/autopost on - Aktifkan automation\n' +
    '/autopost off - Nonaktifkan automation\n' +
    '/autopost status - Lihat status automation\n\n' +
    'Automation akan otomatis memproses link affiliate yang kamu paste.'
  );
}

/**
 * Handle /schedule command
 */
export async function handleScheduleCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id.toString() || '';
  const args = ctx.message?.text.split(' ').slice(1) || [];

  // Get user's active brand
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  if (!session?.activeBrandId) {
    await ctx.reply('⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand.');
    return;
  }

  const brandId = session.activeBrandId;

  // Parse command
  const subcommand = args[0]?.toLowerCase();

  if (subcommand === 'set') {
    await setSchedule(ctx, brandId, args.slice(1));
  } else {
    await showSchedule(ctx, brandId);
  }
}

/**
 * Show current schedule
 */
async function showSchedule(ctx: Context, brandId: string): Promise<void> {
  try {
    const schedule = await smartScheduler.getTodaySchedule(brandId);

    const slotsText = schedule.slots.map((slot) => {
      const post = schedule.posts.find(
        (p: any) => new Date(p.scheduledFor).getTime() === new Date(slot.scheduledFor).getTime()
      );
      const status = post ? getStatusEmoji(post.status) : '⭕';
      const time = new Date(slot.scheduledFor).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${status} ${time} - ${slot.platform} (${slot.contentType})`;
    }).join('\n');

    const message = [
      '📅 *TODAY\'S SCHEDULE*',
      '─────────────────────',
      slotsText,
      '─────────────────────',
      `Sisa slot: ${schedule.remaining}`,
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Gagal mengambil jadwal: ${error.message}`);
  }
}

/**
 * Set schedule times
 */
async function setSchedule(ctx: Context, brandId: string, times: string[]): Promise<void> {
  if (times.length === 0) {
    await ctx.reply('⚠️ Format: /schedule set 09:00,14:00,19:00');
    return;
  }

  // Validate times
  const validTimes: string[] = [];
  for (const time of times) {
    if (/^\d{2}:\d{2}$/.test(time)) {
      const [hours, minutes] = time.split(':').map(Number);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        validTimes.push(time);
      }
    }
  }

  if (validTimes.length === 0) {
    await ctx.reply('⚠️ Format waktu salah. Gunakan: /schedule set 09:00,14:00,19:00');
    return;
  }

  try {
    await smartScheduler.updateScheduleConfig(brandId, {
      postingTimes: validTimes,
      postsPerDay: validTimes.length,
    });

    await ctx.reply(
      `✅ *Jadwal Diupdate!*\n\n` +
      `Waktu posting baru: ${validTimes.join(', ')}\n` +
      `Posts per hari: ${validTimes.length}`
    );
  } catch (error: any) {
    await ctx.reply(`❌ Gagal update jadwal: ${error.message}`);
  }
}

/**
 * Handle /pause command
 */
export async function handlePauseCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id.toString() || '';
  const args = ctx.message?.text.split(' ').slice(1) || [];

  // Get user's active brand
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  if (!session?.activeBrandId) {
    await ctx.reply('⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand.');
    return;
  }

  const brandId = session.activeBrandId;
  const hours = parseInt(args[0]) || 24;

  try {
    await automationManager.pauseAutomation(brandId, hours);
    await ctx.reply(
      `⏸️ *Automation Dijeda!*\n\n` +
      `Automation akan dijeda selama ${hours} jam.\n` +
      `Gunakan /resume untuk melanjutkan.`
    );
  } catch (error: any) {
    await ctx.reply(`❌ Gagal menjeda automation: ${error.message}`);
  }
}

/**
 * Handle /resume command
 */
export async function handleResumeCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id.toString() || '';

  // Get user's active brand
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  if (!session?.activeBrandId) {
    await ctx.reply('⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand.');
    return;
  }

  const brandId = session.activeBrandId;

  try {
    await automationManager.resumeAutomation(brandId);
    await ctx.reply(
      '▶️ *Automation Dilanjutkan!*\n\n' +
      'Automation sudah aktif kembali.'
    );
  } catch (error: any) {
    await ctx.reply(`❌ Gagal melanjutkan automation: ${error.message}`);
  }
}

/**
 * Handle /config command
 */
export async function handleConfigCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id.toString() || '';

  // Get user's active brand
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  if (!session?.activeBrandId) {
    await ctx.reply('⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand.');
    return;
  }

  const brandId = session.activeBrandId;

  try {
    const status = await automationManager.getStatus(brandId);
    const config = await automationManager.getAutomationConfig(brandId);

    const message = [
      '⚙️ *AUTOMATION CONFIG*',
      '─────────────────────',
      `Posts/Hari: ${status.postsPerDay}`,
      `Platforms: ${status.platforms.join(', ')}`,
      `Content Types: ${status.contentTypes.join(', ')}`,
      `Jadwal: ${status.postingTimes.join(', ')}`,
      `Auto-Approve: ${config?.autoApprove ? 'Ya' : 'Tidak'}`,
      `Niche: ${config?.niche || 'home_appliance'}`,
      '─────────────────────',
      'Gunakan command lain untuk mengubah config:',
      '/autopost - Manage automation',
      '/schedule - Atur jadwal posting',
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Gagal mengambil config: ${error.message}`);
  }
}

/**
 * Handle /rotations command
 */
export async function handleRotationsCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id.toString() || '';

  // Get user's active brand
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  if (!session?.activeBrandId) {
    await ctx.reply('⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand.');
    return;
  }

  await ctx.reply(
    '🔄 *POV ROTATIONS*\n\n' +
    'Sistem menggunakan berbagai POV (Point of View) untuk variasi konten:\n\n' +
    '• product_review - Review jujur produk\n' +
    '• unboxing - Unboxing dan first impression\n' +
    '• comparison - Perbandingan dengan produk lain\n' +
    '• how_to - Tutorial penggunaan\n' +
    '• before_after - Transformasi hasil\n' +
    '• lifestyle - Gaya hidup sehari-hari\n' +
    '• testimonial - Review dari customer\n' +
    '• problem_solution - Solusi masalah\n\n' +
    'POV akan di-rotasi otomatis untuk variasi konten.'
  );
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'POSTED':
      return '✅';
    case 'POSTING':
      return '🔄';
    case 'SCHEDULED':
      return '📅';
    case 'PENDING':
      return '⏳';
    case 'FAILED':
      return '❌';
    case 'SKIPPED':
      return '⏭️';
    default:
      return '⚪';
  }
}
