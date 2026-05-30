// ============================================
// Background Worker - Scheduler (Simplified)
// ============================================

import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import 'dotenv/config';

const prisma = new PrismaClient();

// Configuration
const SCHEDULER_CONFIG = {
  checkInterval: '*/5 * * * *',
  maxRetries: 3,
  batchSize: 10,
};

// ============================================
// SCHEDULED POSTING
// ============================================

async function processScheduledPosts() {
  console.log('[Scheduler] Checking for scheduled posts...');

  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  const duePosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { lte: fiveMinutesFromNow, gte: now },
    },
    include: {
      content: true,
      product: { include: { links: { where: { status: 'ACTIVE' }, take: 1 } } },
    },
    take: SCHEDULER_CONFIG.batchSize,
  });

  if (duePosts.length === 0) {
    console.log('[Scheduler] No posts due for publishing');
    return;
  }

  console.log(`[Scheduler] Found ${duePosts.length} posts to process`);

  for (const post of duePosts) {
    try {
      await processPost(post);
    } catch (error) {
      console.error(`[Scheduler] Error processing post ${post.id}:`, error);
      await handlePostError(post.id, error);
    }
  }
}

async function processPost(post: any) {
  console.log(`[Scheduler] Processing post ${post.id}...`);

  await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'POSTING' } });

  const link = post.product.links[0];
  if (!link) throw new Error('No active link found');

  const fullLink = `${link.originalLink}?utm_source=${post.platform.toLowerCase()}&utm_campaign=${post.product.slug}`;

  // Placeholder: actual platform posting would go here
  console.log(`[Scheduler] Would post to ${post.platform}:`, fullLink);

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: {
      status: 'PUBLISHED',
      postedAt: new Date(),
      postUrl: `https://example.com/post/${Date.now()}`,
    },
  });

  console.log(`[Scheduler] Post ${post.id} published`);
}

async function handlePostError(postId: string, error: any) {
  const post = await prisma.scheduledPost.findUnique({ where: { id: postId } });
  if (!post) return;

  if (post.retryCount < SCHEDULER_CONFIG.maxRetries) {
    const retryDelay = Math.pow(2, post.retryCount) * 5;
    const nextRetry = new Date(Date.now() + retryDelay * 60 * 1000);

    await prisma.scheduledPost.update({
      where: { id: postId },
      data: { status: 'SCHEDULED', scheduledAt: nextRetry, retryCount: { increment: 1 }, errorMessage: error.message },
    });
  } else {
    await prisma.scheduledPost.update({
      where: { id: postId },
      data: { status: 'FAILED', errorMessage: `Max retries exceeded: ${error.message}` },
    });
  }
}

// ============================================
// ANALYTICS AGGREGATION
// ============================================

async function aggregateAnalytics() {
  console.log('[Scheduler] Aggregating analytics...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayClicks = await prisma.clickLog.count({ where: { clickedAt: { gte: today } } });
  const todayPosts = await prisma.scheduledPost.count({ where: { postedAt: { gte: today }, status: 'PUBLISHED' } });

  await prisma.analytics.upsert({
    where: { id: `daily_${today.toISOString().split('T')[0]}` },
    update: { totalPosts: todayPosts, totalClicks: todayClicks },
    create: {
      id: `daily_${today.toISOString().split('T')[0]}`,
      period: 'DAILY',
      dateFrom: today,
      dateTo: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      totalPosts: todayPosts,
      totalClicks: todayClicks,
    },
  });

  console.log('[Scheduler] Analytics aggregated');
}

// ============================================
// CLEANUP
// ============================================

async function cleanupOldData() {
  console.log('[Scheduler] Running cleanup...');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const deletedAuditLogs = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo } } });
  const deletedWebhookLogs = await prisma.webhookLog.deleteMany({ where: { createdAt: { lt: thirtyDaysAgo }, processed: true } });

  console.log(`[Scheduler] Cleanup: ${deletedAuditLogs.count} audit logs, ${deletedWebhookLogs.count} webhook logs deleted`);
}

// ============================================
// WORKER
// ============================================

class SchedulerWorker {
  private isRunning = false;

  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('🚀 Starting Scheduler Worker...');
    this.isRunning = true;

    // Schedule tasks
    cron.schedule(SCHEDULER_CONFIG.checkInterval, () => processScheduledPosts().catch(console.error));
    cron.schedule('0 * * * *', () => aggregateAnalytics().catch(console.error));
    cron.schedule('0 0 * * *', () => cleanupOldData().catch(console.error));

    // Run initial tasks
    processScheduledPosts();
    aggregateAnalytics();

    console.log('✅ Scheduler Worker started');
  }

  stop() {
    console.log('🛑 Stopping Scheduler Worker...');
    this.isRunning = false;
  }
}

export const scheduler = new SchedulerWorker();

if (require.main === module) {
  scheduler.start();

  process.on('SIGINT', () => { scheduler.stop(); prisma.$disconnect(); process.exit(0); });
  process.on('SIGTERM', () => { scheduler.stop(); prisma.$disconnect(); process.exit(0); });
}