// ============================================
// LINK TRACKING COMMAND
// /linktrack - Show tracking status for affiliate links
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Format stage with emoji
 */
function getStageEmoji(stage: string): string {
  const stageEmojis: Record<string, string> = {
    'PRODUCT_CREATED': '📦',
    'CONTENT_GENERATED': '📝',
    'APPROVED': '✅',
    'DISTRIBUTED': '📨',
    'POSTED': '🎉',
    'ACTIVE': '🟢',
    'PAUSED': '⏸️',
    'EXPIRED': '❌',
  };
  return stageEmojis[stage] || '⬜';
}

/**
 * Format stage name for display
 */
function formatStageName(stage: string): string {
  return stage.replace(/_/g, ' ').toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format number with locale
 */
function formatNumber(num: number): string {
  return num.toLocaleString('id-ID');
}

/**
 * Format price in IDR
 */
function formatPrice(price: number): string {
  return `Rp ${price.toLocaleString('id-ID')}`;
}

/**
 * Truncate text
 */
function truncate(text: string, len: number): string {
  if (!text) return '';
  return text.length > len ? text.substring(0, len) + '...' : text;
}

/**
 * Handle /linktrack command
 * Shows tracking status for affiliate links
 */
export async function handleLinkTrackCommand(ctx: any) {
  const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
  const telegramId = String(ctx.from?.id || '');

  // Get user's active brand
  const session = await prisma.telegramSession.findUnique({
    where: { telegramId },
  });

  const brandId = session?.activeBrandId;

  // If no args, show all links summary
  if (!args) {
    await showAllLinksSummary(ctx, brandId);
    return;
  }

  // Parse command type
  const parts = args.split(' ');
  const subCommand = parts[0].toLowerCase();
  const targetId = parts[1] || '';

  // Handle subcommands
  if (subCommand === 'pause' && targetId) {
    await handlePauseLink(ctx, targetId);
    return;
  }

  if (subCommand === 'activate' && targetId) {
    await handleActivateLink(ctx, targetId);
    return;
  }

  if (subCommand === 'stats') {
    await showAggregateStats(ctx, brandId);
    return;
  }

  // Otherwise, treat as tracking ID
  await showLinkDetails(ctx, args);
}

/**
 * Show summary of all tracked links
 */
async function showAllLinksSummary(ctx: any, brandId?: string) {
  try {
    const where = brandId ? { brandId } : {};

    const [links, stats] = await Promise.all([
      prisma.affiliateLinkTracking.findMany({
        where,
        include: {
          product: { select: { name: true } },
          brand: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.affiliateLinkTracking.aggregate({
        where,
        _count: true,
        _sum: { clicks: true, sales: true, revenue: true },
      }),
    ]);

    if (links.length === 0) {
      await ctx.reply(`📊 *LINK TRACKING*

Belum ada link yang di-track.

Gunakan:
• /add [link] - Tambah produk baru
• /linktrack [id] - Lihat detail link`);
      return;
    }

    let message = `📊 *LINK TRACKING SUMMARY*\n\n`;

    // Stats summary
    message += `📈 *Total Links:* ${links.length}\n`;
    message += `👆 *Total Clicks:* ${formatNumber(stats._sum.clicks || 0)}\n`;
    message += `💰 *Total Sales:* ${formatNumber(stats._sum.sales || 0)}\n`;
    message += `💵 *Total Revenue:* ${formatPrice(stats._sum.revenue || 0)}\n\n`;

    // Links list
    message += `📋 *Recent Links:*\n`;
    for (const link of links) {
      const stageEmoji = getStageEmoji(link.currentPipelineStage);
      const statusEmoji = link.status === 'ACTIVE' ? '🟢' : link.status === 'PAUSED' ? '⏸️' : '❌';

      message += `\n${stageEmoji} ${statusEmoji} ${truncate(link.originalLink, 30)}\n`;
      message += `   Stage: ${formatStageName(link.currentPipelineStage)}\n`;
      message += `   Clicks: ${link.clicks} | Sales: ${link.sales}\n`;
      message += `   ID: \`${link.id.substring(0, 8)}...\``;
    }

    message += `\n\n💡 *Commands:*\n`;
    message += `• /linktrack [id] - Detail link\n`;
    message += `• /linktrack stats - Aggregate stats\n`;
    message += `• /linktrack pause [id] - Pause link\n`;
    message += `• /linktrack activate [id] - Activate link`;

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[LinkTrack] Error showing summary:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Show detailed tracking for a specific link
 */
async function showLinkDetails(ctx: any, trackingId: string) {
  try {
    // Try to find by tracking ID, shortCode, or distributionId
    let tracking = await prisma.affiliateLinkTracking.findUnique({
      where: { id: trackingId },
      include: {
        product: { select: { id: true, name: true, slug: true, price: true, affiliateLink: true } },
        brand: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!tracking) {
      tracking = await prisma.affiliateLinkTracking.findFirst({
        where: { shortCode: trackingId },
        include: {
          product: { select: { id: true, name: true, slug: true, price: true, affiliateLink: true } },
          brand: { select: { id: true, name: true, slug: true } },
        },
      });
    }

    if (!tracking) {
      // Try as distribution ID
      tracking = await prisma.affiliateLinkTracking.findFirst({
        where: { distributionId: trackingId },
        include: {
          product: { select: { id: true, name: true, slug: true, price: true, affiliateLink: true } },
          brand: { select: { id: true, name: true, slug: true } },
        },
      });
    }

    if (!tracking) {
      await ctx.reply(`❌ Tracking record not found: \`${trackingId.substring(0, 12)}...\`

Use /linktrack to see all tracked links.`);
      return;
    }

    // Build detailed message
    let message = `🔗 *LINK TRACKING DETAILS*\n\n`;

    // Product info
    if (tracking.product) {
      message += `📦 *Product:* ${tracking.product.name}\n`;
      message += `💰 *Price:* ${formatPrice(tracking.product.price)}\n\n`;
    }

    // Brand info
    if (tracking.brand) {
      message += `🏢 *Brand:* ${tracking.brand.name}\n\n`;
    }

    // Pipeline stage
    const stageEmoji = getStageEmoji(tracking.currentPipelineStage);
    message += `🔄 *Pipeline Stage:*\n`;
    message += `${stageEmoji} ${formatStageName(tracking.currentPipelineStage)}\n\n`;

    // Platform & Content info
    if (tracking.platform || tracking.contentType) {
      message += `📱 *Platform:* ${tracking.platform || 'N/A'}\n`;
      message += `🖼️ *Content Type:* ${tracking.contentType || 'N/A'}\n\n`;
    }

    // Performance stats
    message += `📊 *PERFORMANCE*\n`;
    message += `├ Clicks: ${formatNumber(tracking.clicks)}\n`;
    message += `├ Unique Clicks: ${formatNumber(tracking.uniqueClicks)}\n`;
    message += `├ Leads: ${formatNumber(tracking.leads)}\n`;
    message += `├ Sales: ${formatNumber(tracking.sales)}\n`;
    message += `├ Revenue: ${formatPrice(tracking.revenue)}\n`;
    message += `├ Commission: ${formatPrice(tracking.commission)}\n`;
    message += `└ Conversion Rate: ${(tracking.conversionRate * 100).toFixed(2)}%\n\n`;

    // Status
    const statusEmoji = tracking.status === 'ACTIVE' ? '🟢' : tracking.status === 'PAUSED' ? '⏸️' : '❌';
    message += `📍 *Status:* ${statusEmoji} ${tracking.status}\n\n`;

    // Post info
    if (tracking.postUrl) {
      message += `🔗 *Post URL:* ${truncate(tracking.postUrl, 50)}\n\n`;
    }

    // Timestamps
    message += `⏱️ *Created:* ${new Date(tracking.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
    if (tracking.lastClickedAt) {
      message += `👆 *Last Click:* ${new Date(tracking.lastClickedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
    }

    // Pipeline history
    let pipelineHistory: any[] = [];
    try {
      pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
    } catch {}

    if (pipelineHistory.length > 0) {
      message += `\n📜 *Pipeline History:*\n`;
      for (let i = 0; i < Math.min(pipelineHistory.length, 5); i++) {
        const entry = pipelineHistory[i];
        const entryStageEmoji = getStageEmoji(entry.stage);
        const timestamp = new Date(entry.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        message += `${entryStageEmoji} ${formatStageName(entry.stage)} - ${timestamp}\n`;
      }
    }

    // Actions
    message += `\n💡 *Actions:*\n`;
    if (tracking.status === 'ACTIVE') {
      message += `• /linktrack pause ${tracking.id.substring(0, 8)}\n`;
    } else if (tracking.status === 'PAUSED') {
      message += `• /linktrack activate ${tracking.id.substring(0, 8)}\n`;
    }
    message += `• /view ${tracking.productId?.substring(0, 8) || ''} - View content`;

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[LinkTrack] Error showing details:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Pause a tracking link
 */
async function handlePauseLink(ctx: any, trackingId: string) {
  try {
    // Try to find by partial ID
    const tracking = await prisma.affiliateLinkTracking.findFirst({
      where: {
        OR: [
          { id: trackingId },
          { id: { startsWith: trackingId } },
        ],
      },
    });

    if (!tracking) {
      await ctx.reply(`❌ Tracking record not found: \`${trackingId}\``);
      return;
    }

    if (tracking.status === 'PAUSED') {
      await ctx.reply(`⏸️ Link already paused: \`${tracking.id.substring(0, 8)}...\``);
      return;
    }

    // Pause the link
    await prisma.affiliateLinkTracking.update({
      where: { id: tracking.id },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
      },
    });

    // Log the event
    await prisma.linkEventLog.create({
      data: {
        trackingId: tracking.id,
        eventType: 'STATUS_CHANGE',
        metadata: JSON.stringify({ status: 'PAUSED', note: 'Paused via Telegram' }),
      },
    });

    await ctx.reply(`⏸️ *Link Paused*

📦 Product: ${tracking.product?.name || 'N/A'}
🔗 ID: \`${tracking.id.substring(0, 8)}...\`

Use /linktrack activate ${tracking.id.substring(0, 8)} to reactivate.`, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[LinkTrack] Error pausing link:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Activate a paused tracking link
 */
async function handleActivateLink(ctx: any, trackingId: string) {
  try {
    // Try to find by partial ID
    const tracking = await prisma.affiliateLinkTracking.findFirst({
      where: {
        OR: [
          { id: trackingId },
          { id: { startsWith: trackingId } },
        ],
      },
    });

    if (!tracking) {
      await ctx.reply(`❌ Tracking record not found: \`${trackingId}\``);
      return;
    }

    if (tracking.status === 'ACTIVE') {
      await ctx.reply(`🟢 Link already active: \`${tracking.id.substring(0, 8)}...\``);
      return;
    }

    // Update pipeline history
    let pipelineHistory: any[] = [];
    try {
      pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
    } catch {}
    pipelineHistory.push({
      stage: 'ACTIVE',
      timestamp: new Date().toISOString(),
      note: 'Link reactivated via Telegram',
    });

    // Activate the link
    await prisma.affiliateLinkTracking.update({
      where: { id: tracking.id },
      data: {
        status: 'ACTIVE',
        currentPipelineStage: 'ACTIVE',
        pipelineHistory: JSON.stringify(pipelineHistory),
      },
    });

    // Log the event
    await prisma.linkEventLog.create({
      data: {
        trackingId: tracking.id,
        eventType: 'STATUS_CHANGE',
        metadata: JSON.stringify({ status: 'ACTIVE', note: 'Reactivated via Telegram' }),
      },
    });

    await ctx.reply(`🟢 *Link Activated*

📦 Product: ${tracking.product?.name || 'N/A'}
🔗 ID: \`${tracking.id.substring(0, 8)}...\`

Tracking has resumed!`, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[LinkTrack] Error activating link:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

/**
 * Show aggregate stats for all links
 */
async function showAggregateStats(ctx: any, brandId?: string) {
  try {
    const where = brandId ? { brandId } : {};

    const links = await prisma.affiliateLinkTracking.findMany({
      where,
      select: {
        clicks: true,
        uniqueClicks: true,
        leads: true,
        sales: true,
        revenue: true,
        commission: true,
        conversionRate: true,
        currentPipelineStage: true,
        platform: true,
        status: true,
      },
    });

    // Calculate aggregates
    const totals = links.reduce(
      (acc, link) => ({
        clicks: acc.clicks + link.clicks,
        uniqueClicks: acc.uniqueClicks + link.uniqueClicks,
        leads: acc.leads + link.leads,
        sales: acc.sales + link.sales,
        revenue: acc.revenue + link.revenue,
        commission: acc.commission + link.commission,
      }),
      { clicks: 0, uniqueClicks: 0, leads: 0, sales: 0, revenue: 0, commission: 0 }
    );

    // Count by stage
    const byStage: Record<string, number> = {};
    for (const link of links) {
      byStage[link.currentPipelineStage] = (byStage[link.currentPipelineStage] || 0) + 1;
    }

    // Count by platform
    const byPlatform: Record<string, { clicks: number; revenue: number }> = {};
    for (const link of links) {
      const platform = link.platform || 'UNKNOWN';
      if (!byPlatform[platform]) {
        byPlatform[platform] = { clicks: 0, revenue: 0 };
      }
      byPlatform[platform].clicks += link.clicks;
      byPlatform[platform].revenue += link.revenue;
    }

    // Count by status
    const activeCount = links.filter(l => l.status === 'ACTIVE').length;
    const pausedCount = links.filter(l => l.status === 'PAUSED').length;

    // Build message
    let message = `📊 *AGGREGATE LINK STATS*\n\n`;

    // Overall stats
    message += `📈 *Overview*\n`;
    message += `├ Total Links: ${links.length}\n`;
    message += `├ Active: ${activeCount} 🟢\n`;
    message += `├ Paused: ${pausedCount} ⏸️\n`;
    message += `└ Avg Conversion: ${(totals.sales / totals.clicks * 100 || 0).toFixed(2)}%\n\n`;

    // Performance
    message += `📊 *Performance*\n`;
    message += `├ Clicks: ${formatNumber(totals.clicks)}\n`;
    message += `├ Unique Clicks: ${formatNumber(totals.uniqueClicks)}\n`;
    message += `├ Leads: ${formatNumber(totals.leads)}\n`;
    message += `├ Sales: ${formatNumber(totals.sales)}\n`;
    message += `├ Revenue: ${formatPrice(totals.revenue)}\n`;
    message += `└ Commission: ${formatPrice(totals.commission)}\n\n`;

    // By stage
    message += `🔄 *By Stage*\n`;
    for (const [stage, count] of Object.entries(byStage)) {
      const emoji = getStageEmoji(stage);
      message += `${emoji} ${formatStageName(stage)}: ${count}\n`;
    }
    message += `\n`;

    // By platform
    if (Object.keys(byPlatform).length > 0) {
      message += `📱 *By Platform*\n`;
      for (const [platform, data] of Object.entries(byPlatform).sort((a, b) => b[1].clicks - a[1].clicks)) {
        message += `${platform}: ${data.clicks} clicks, ${formatPrice(data.revenue)}\n`;
      }
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[LinkTrack] Error showing stats:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

export default handleLinkTrackCommand;