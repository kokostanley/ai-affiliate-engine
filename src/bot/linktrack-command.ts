// ============================================
// LINK TRACKING COMMAND
// /linktrack [linkId|distributionId] - Show link status and stats
// ============================================

import { Bot } from 'grammy';
import * as linkTracking from '../services/link-tracking';

export function registerLinktrackCommand(bot: Bot) {
  // /linktrack - Show link tracking status
  bot.command('linktrack', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!args) {
      await ctx.reply('USAGE: /linktrack [trackingId|shortCode|distributionId]');
      return;
    }

    try {
      let tracking = await linkTracking.getTrackingRecord(args);
      if (!tracking) {
        tracking = await linkTracking.getTrackingByShortCode(args);
      }
      if (!tracking) {
        tracking = await linkTracking.getTrackingByDistributionId(args);
      }

      if (!tracking) {
        await ctx.reply('Tracking not found: ' + args.substring(0, 20));
        return;
      }

      const stageEmoji = getStageEmoji(tracking.currentPipelineStage);
      let message = stageEmoji + ' ' + formatStage(tracking.currentPipelineStage) + '\n\n';
      
      if (tracking.product) {
        message += 'Product: ' + truncate(tracking.product.name, 30) + '\n';
        message += 'Price: Rp ' + Number(tracking.product.price).toLocaleString('id-ID') + '\n';
      }
      if (tracking.brand) {
        message += 'Brand: ' + tracking.brand.name + '\n';
      }
      message += 'Platform: ' + (tracking.platform || 'N/A') + '\n';
      message += 'Status: ' + tracking.status + '\n\n';

      message += 'Clicks: ' + tracking.clicks + ' | Unique: ' + tracking.uniqueClicks + '\n';
      message += 'Leads: ' + tracking.leads + ' | Sales: ' + tracking.sales + '\n';
      message += 'Revenue: Rp ' + Number(tracking.revenue).toLocaleString('id-ID') + '\n';
      message += 'Commission: Rp ' + Number(tracking.commission).toLocaleString('id-ID') + '\n';
      message += 'Conversion: ' + (tracking.conversionRate * 100).toFixed(2) + '%\n\n';

      message += 'ID: ' + tracking.id.substring(0, 12) + '...\n';

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: tracking.status === 'PAUSED' ? 'Activate' : 'Pause', 
                callback_data: 'lt_act_' + tracking.id + '_' + (tracking.status === 'PAUSED' ? 'on' : 'off') },
            ]
          ]
        }
      });
    } catch (error) {
      await ctx.reply('Error: ' + (error as Error).message);
    }
  });

  // Callback for activate/pause
  bot.callbackQuery(/^lt_act_(.+?)_(on|off)$/, async (ctx) => {
    const id = ctx.match[1];
    const action = ctx.match[2];
    try {
      const result = action === 'off' 
        ? await linkTracking.pauseLink(id)
        : await linkTracking.activateLink(id);
      if (result.success) {
        await ctx.answerCallbackQuery('Done');
        await ctx.reply('Link ' + (action === 'off' ? 'paused' : 'activated'));
      } else {
        await ctx.answerCallbackQuery(result.error || 'Error');
      }
    } catch (e) {
      await ctx.answerCallbackQuery((e as Error).message);
    }
  });
}

function getStageEmoji(stage: string): string {
  const map: Record<string, string> = {
    PRODUCT_CREATED: '📦', CONTENT_GENERATED: '📝', APPROVED: '✅',
    DISTRIBUTED: '📨', POSTED: '📤', ACTIVE: '🟢', PAUSED: '⏸️', EXPIRED: '⏹️',
  };
  return map[stage] || '🔗';
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function truncate(text: string, len: number): string {
  return text.length > len ? text.substring(0, len) + '...' : text;
}
