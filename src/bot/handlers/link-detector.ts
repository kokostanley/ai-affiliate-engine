/**
 * Link Detector Handler
 * Auto-detects Shopee/TikTok affiliate links from any message
 */

import { Context, InlineKeyboard } from 'grammy';
import { PrismaClient } from '@prisma/client';
import { extractLinks, detectLinkPlatform, automationManager } from '../../services/automation-manager';
import { Platform, ContentType } from '../../lib/content-variations';

const prisma = new PrismaClient();

export interface LinkDetectionResult {
  detected: boolean;
  platform: 'SHOPEE' | 'TIKTOK' | 'OTHER';
  links: string[];
  productNames: string[];
}

/**
 * Handle link detection from message
 */
export async function handleLinkMessage(ctx: Context, message: string): Promise<LinkDetectionResult | null> {
  // Extract links from message
  const links = extractLinks(message);

  if (links.length === 0) {
    return null;
  }

  const detectedLinks: string[] = [];
  const productNames: string[] = [];

  for (const link of links) {
    const platform = detectLinkPlatform(link);

    if (platform !== 'OTHER') {
      detectedLinks.push(link);
      productNames.push(extractProductName(link));
    }
  }

  if (detectedLinks.length === 0) {
    return null;
  }

  return {
    detected: true,
    platform: detectLinkPlatform(detectedLinks[0]),
    links: detectedLinks,
    productNames,
  };
}

/**
 * Handle link detection with inline keyboard for content type selection
 */
export async function handleLinkWithSelection(ctx: Context, message: string): Promise<void> {
  const result = await handleLinkMessage(ctx, message);

  if (!result || !result.detected) {
    return;
  }

  const link = result.links[0];
  const productName = result.productNames[0];
  const platform = result.platform;

  // Get user's active brand
  const telegramId = ctx.from?.id.toString() || '';
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  if (!session?.activeBrandId) {
    await ctx.reply(
      '⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand terlebih dahulu.'
    );
    return;
  }

  // Show confirmation with detected platform
  await ctx.reply(
    `🔗 *Link terdeteksi!*\n\n` +
    `📱 Platform: ${platform}\n` +
    `📦 Product: ${productName}\n\n` +
    `Pilih jenis konten yang ingin dibuat:`,
    {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .row()
        .text('📸 Image', `process:image:${link}`)
        .text('🎠 Carousel', `process:carousel:${link}`)
        .row()
        .text('🎬 Video', `process:video:${link}`)
        .text('🔄 Auto', `process:auto:${link}`),
    }
  );
}

/**
 * Handle process callback from inline keyboard
 */
export async function handleProcessCallback(
  ctx: Context,
  type: string,
  data: string[]
): Promise<void> {
  // Extract the link from data
  const link = data.join(':');

  if (!link) {
    await ctx.answerCallbackQuery('Error: Link not found');
    return;
  }

  // Get user's active brand
  const telegramId = ctx.from?.id.toString() || '';
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  if (!session?.activeBrandId) {
    await ctx.answerCallbackQuery('Error: No active brand');
    await ctx.reply('⚠️ Kamu belum pilih brand. Gunakan /brand untuk memilih brand.');
    return;
  }

  // Determine content type
  let contentType: ContentType = 'IMAGE';
  let autoMode = false;

  switch (type) {
    case 'image':
      contentType = 'IMAGE';
      break;
    case 'carousel':
      contentType = 'CAROUSEL';
      break;
    case 'video':
      contentType = 'VIDEO';
      break;
    case 'auto':
      autoMode = true;
      break;
  }

  // Show processing message
  await ctx.answerCallbackQuery('⏳ Processing...');
  await ctx.reply('🔄 Sedang memproses link affiliate...\n\nIni akan memakan waktu beberapa menit.');

  try {
    if (autoMode) {
      // Process with auto-selection (will create multiple content types)
      const result = await automationManager.processLink(link, session.activeBrandId, {
        autoApprove: true,
      });

      if (result.success) {
        await ctx.reply(
          `✅ *Auto Processing Selesai!*\n\n` +
          `📦 Product: ${result.contentId}\n` +
          `📋 Distribution: ${result.distributionId}\n` +
          `⏰ Scheduled: ${result.queueId}\n\n` +
          `Konten akan diposting sesuai jadwal.`
        );
      } else {
        await ctx.reply(`❌ Gagal memproses: ${result.errors[0] || 'Unknown error'}`);
      }
    } else {
      // Process with specific content type
      const result = await automationManager.processLink(link, session.activeBrandId, {
        autoApprove: true,
        targetContentType: contentType,
      });

      if (result.success) {
        await ctx.reply(
          `✅ *Processing Selesai!*\n\n` +
          `📦 Product: ${result.contentId}\n` +
          `📋 Distribution: ${result.distributionId}\n` +
          `⏰ Scheduled: ${result.queueId}\n\n` +
          `Konten akan diposting sesuai jadwal.`
        );
      } else {
        await ctx.reply(`❌ Gagal memproses: ${result.errors[0] || 'Unknown error'}`);
      }
    }
  } catch (error: any) {
    console.error('[LinkDetector] Error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Extract product name from link
 */
function extractProductName(link: string): string {
  try {
    const url = new URL(link);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || '';
    // Clean up the name
    const name = lastPart
      .replace(/\.[^.]+$/, '') // Remove extension
      .replace(/-/g, ' ')
      .replace(/\d+\.html$/, '')
      .substring(0, 50);
    return name || 'Unknown Product';
  } catch {
    return 'Unknown Product';
  }
}

/**
 * Validate affiliate link
 */
export function isValidAffiliateLink(link: string): boolean {
  const platform = detectLinkPlatform(link);
  return platform !== 'OTHER';
}

/**
 * Get supported platforms
 */
export function getSupportedPlatforms(): string[] {
  return ['SHOPEE', 'TIKTOK'];
}
