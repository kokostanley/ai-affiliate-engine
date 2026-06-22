/**
 * Pippit URL Auto-Detect Handler
 * Detects pasted URLs and prompts user to select platform for posting
 */

import { Context, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// URL patterns that are media URLs
const MEDIA_PATTERNS = [
  // Video
  /\.mp4/i,
  /\.webm/i,
  /\.mov/i,
  // Image
  /\.png$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.gif$/i,
  /\.webp$/i,
];

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s<>"]+/gi;
  return text.match(urlPattern) || [];
}

/**
 * Check if URL is media (video/image)
 */
export function isMediaUrl(url: string): boolean {
  return MEDIA_PATTERNS.some(pattern => pattern.test(url)) ||
    url.includes('pippit') ||
    url.includes('drive.google') ||
    url.includes('dropbox') ||
    url.includes('cdn') ||
    url.includes('imgix') ||
    url.includes('cloudfront');
}

/**
 * Detect URLs and handle pasted URLs
 * Returns true if handled, false otherwise
 */
export async function handlePastedUrl(ctx: Context, text: string): Promise<boolean> {
  const urls = extractUrls(text);
  if (urls.length === 0) return false;

  // Check if URL looks like media
  const mediaUrls = urls.filter(url => isMediaUrl(url));
  if (mediaUrls.length === 0) return false;

  const mediaUrl = mediaUrls[0]; // Take first media URL

  // Get user's brand
  const telegramId = ctx.from?.id.toString() || '';
  const session = await prisma.telegramSession.findUnique({ where: { telegramId } });

  if (!session?.activeBrandId) {
    await ctx.reply('⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand.');
    return true;
  }

  const brand = await prisma.brand.findUnique({
    where: { id: session.activeBrandId },
    include: { socialAccounts: true },
  });

  if (!brand) {
    await ctx.reply('❌ Brand tidak ditemukan.');
    return true;
  }

  // Determine content type
  const isVideo = /\.(mp4|webm|mov)/i.test(mediaUrl) || mediaUrl.includes('mp4');
  const contentType = isVideo ? 'VIDEO' : 'IMAGE';

  // Build platform keyboard based on content type
  const keyboard = new InlineKeyboard();

  if (isVideo) {
    // Video platforms: TikTok, YouTube, Facebook, Instagram Reels
    if (brand.socialAccounts.some(a => a.platform === 'TIKTOK' && a.status === 'ACTIVE')) {
      keyboard.row().text('TikTok', `pippit:TIKTOK:${mediaUrl}`);
    }
    if (brand.socialAccounts.some(a => a.platform === 'YOUTUBE' && a.status === 'ACTIVE')) {
      keyboard.row().text('YouTube', `pippit:YOUTUBE:${mediaUrl}`);
    }
    if (brand.socialAccounts.some(a => a.platform === 'FACEBOOK' && a.status === 'ACTIVE')) {
      keyboard.row().text('Facebook', `pippit:FACEBOOK:${mediaUrl}`);
    }
    if (brand.socialAccounts.some(a => a.platform === 'INSTAGRAM' && a.status === 'ACTIVE')) {
      keyboard.row().text('Instagram Reels', `pippit:INSTAGRAM:${mediaUrl}`);
    }
  } else {
    // Image platforms: Instagram, Facebook
    if (brand.socialAccounts.some(a => a.platform === 'INSTAGRAM' && a.status === 'ACTIVE')) {
      keyboard.row().text('Instagram', `pippit:INSTAGRAM:${mediaUrl}`);
    }
    if (brand.socialAccounts.some(a => a.platform === 'FACEBOOK' && a.status === 'ACTIVE')) {
      keyboard.row().text('Facebook', `pippit:FACEBOOK:${mediaUrl}`);
    }
  }

  keyboard.row().text('Batal', 'pippit:cancel');

  const emoji = isVideo ? '🎬' : '🖼️';
  const shortUrl = mediaUrl.length > 50 ? mediaUrl.substring(0, 47) + '...' : mediaUrl;

  await ctx.reply(
    `${emoji} *Media URL Detected!\n\n` +
    `URL: ${shortUrl}\n` +
    `Type: ${contentType}\n` +
    `Brand: ${brand.name}\n\n` +
    `*Pilih platform untuk posting:*`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );

  return true;
}

/**
 * Handle platform selection callback
 */
export async function handlePippitCallback(
  ctx: Context,
  platform: string,
  mediaUrl: string
): Promise<{ success: boolean; message: string }> {
  const telegramId = ctx.from?.id.toString() || '';
  const session = await prisma.telegramSession.findUnique({ where: { telegramId } });

  if (!session?.activeBrandId) {
    return { success: false, message: 'No active brand' };
  }

  const isVideo = /\.(mp4|webm|mov)/i.test(mediaUrl) || mediaUrl.includes('mp4');
  const contentType = isVideo ? 'VIDEO' : 'IMAGE';

  // Create distribution
  const distribution = await prisma.distributionQueue.create({
    data: {
      brandId: session.activeBrandId,
      contentType,
      platform,
      provider: 'PIPPIT_MANUAL',
      status: 'QUEUED',
      approvalStatus: 'APPROVED',
      videoUrl: isVideo ? mediaUrl : null,
      thumbnailUrl: mediaUrl,
      caption: 'Generated via Pippit URL paste',
      hashtags: '#pippit #affiliate',
      postUrl: mediaUrl,
      approvedAt: new Date(),
    },
  });

  return {
    success: true,
    message: `Queued untuk ${platform}. Queue ID: ${distribution.id.substring(0, 8)}...`,
  };
}
