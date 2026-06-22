/**
 * Scheduler Worker
 * Background worker that processes auto-post queue every minute
 */

import { PrismaClient } from '@prisma/client';
import { smartScheduler } from '../services/smart-scheduler';
import { automationManager } from '../services/automation-manager';

const prisma = new PrismaClient();

// Configuration
const SCHEDULER_CONFIG = {
  pollInterval: 60000, // 1 minute
  maxConcurrentPosts: 3,
  timezone: 'Asia/Jakarta', // WIB
};

// Stats tracking
let stats = {
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  lastRun: new Date(),
};

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the scheduler worker
 */
export async function startSchedulerWorker(): Promise<void> {
  if (isRunning) {
    console.log('[SchedulerWorker] Already running');
    return;
  }

  console.log('[SchedulerWorker] Starting...');
  isRunning = true;

  // Initial run
  await processScheduledPosts();

  // Set up interval
  intervalId = setInterval(async () => {
    try {
      await processScheduledPosts();
    } catch (error) {
      console.error('[SchedulerWorker] Error in scheduled run:', error);
    }
  }, SCHEDULER_CONFIG.pollInterval);

  console.log(`[SchedulerWorker] Started with ${SCHEDULER_CONFIG.pollInterval / 1000}s poll interval`);
}

/**
 * Stop the scheduler worker
 */
export function stopSchedulerWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
  console.log('[SchedulerWorker] Stopped');
}

/**
 * Process scheduled posts that are due
 */
async function processScheduledPosts(): Promise<void> {
  stats.lastRun = new Date();
  console.log(`[SchedulerWorker] Processing scheduled posts at ${stats.lastRun.toISOString()}`);

  try {
    // Get posts that are due
    const duePosts = await smartScheduler.getDuePosts();
    console.log(`[SchedulerWorker] Found ${duePosts.length} posts due`);

    if (duePosts.length === 0) {
      return;
    }

    // Process posts with concurrency limit
    const postsToProcess = duePosts.slice(0, SCHEDULER_CONFIG.maxConcurrentPosts);

    for (const post of postsToProcess) {
      await processPost(post);
    }

    console.log(`[SchedulerWorker] Stats: ${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.skipped} skipped`);
  } catch (error) {
    console.error('[SchedulerWorker] Error processing posts:', error);
  }
}

/**
 * Process a single post
 */
async function processPost(post: any): Promise<void> {
  stats.processed++;

  try {
    // Update status to POSTING
    await prisma.autoPostQueue.update({
      where: { id: post.id },
      data: { status: 'POSTING' },
    });

    // Check if automation is enabled for this brand
    const config = await prisma.autoPostConfig.findUnique({
      where: { brandId: post.brandId },
    });

    if (!config?.enabled) {
      console.log(`[SchedulerWorker] Automation disabled for brand ${post.brandId}`);
      await smartScheduler.markAsFailed(post.id, 'Automation disabled');
      stats.skipped++;
      return;
    }

    // Check if paused
    if (config.pausedUntil && config.pausedUntil > new Date()) {
      console.log(`[SchedulerWorker] Automation paused for brand ${post.brandId}`);
      await smartScheduler.reschedule(post.id, 60); // Check again in 1 hour
      stats.skipped++;
      return;
    }

    // Check rate limits
    const canPost = await checkRateLimits(post);
    if (!canPost) {
      console.log(`[SchedulerWorker] Rate limit exceeded for brand ${post.brandId}`);
      await smartScheduler.reschedule(post.id, 30); // Check again in 30 min
      stats.skipped++;
      return;
    }

    // Execute posting via distribution service
    const result = await executePosting(post);

    if (result.success) {
      // Mark as posted
      await smartScheduler.markAsPosted(post.id);

      // Update distribution queue
      if (post.distributionId) {
        await prisma.distributionQueue.update({
          where: { id: post.distributionId },
          data: {
            status: 'POSTED',
            postedAt: new Date(),
            postUrl: result.postUrl,
            postId: result.postId,
          },
        });
      }

      // Log success
      await automationManager.logEvent(post.brandId, 'POST_SUCCESS', {
        queueId: post.id,
        distributionId: post.distributionId,
        platform: post.platform,
        postUrl: result.postUrl,
      });

      stats.succeeded++;
      console.log(`[SchedulerWorker] ✅ Post succeeded: ${post.id}`);
    } else {
      // Mark as failed
      await smartScheduler.markAsFailed(post.id, result.error || 'Unknown error');

      // Update distribution queue
      if (post.distributionId) {
        await prisma.distributionQueue.update({
          where: { id: post.distributionId },
          data: {
            status: 'FAILED',
            errorMessage: result.error,
          },
        });
      }

      // Log failure
      await automationManager.logEvent(post.brandId, 'POST_FAILED', {
        queueId: post.id,
        distributionId: post.distributionId,
        platform: post.platform,
        error: result.error,
      });

      stats.failed++;
      console.log(`[SchedulerWorker] ❌ Post failed: ${post.id} - ${result.error}`);
    }
  } catch (error: any) {
    console.error(`[SchedulerWorker] Error processing post ${post.id}:`, error);
    await smartScheduler.markAsFailed(post.id, error.message);
    stats.failed++;
  }
}

/**
 * Check rate limits before posting
 */
async function checkRateLimits(post: any): Promise<boolean> {
  // Check brand daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const todayPosts = await prisma.autoPostQueue.count({
    where: {
      brandId: post.brandId,
      scheduledFor: { gte: today, lt: tomorrow },
      status: { in: ['POSTING', 'POSTED'] },
    },
  });

  const config = await prisma.autoPostConfig.findUnique({
    where: { brandId: post.brandId },
  });

  if (todayPosts >= (config?.postsPerDay || 3)) {
    return false;
  }

  // Check platform-specific rate limits
  const socialAccount = await prisma.socialAccount.findFirst({
    where: {
      brandId: post.brandId,
      platform: post.platform,
      status: 'ACTIVE',
    },
  });

  if (socialAccount) {
    // Check cooldown
    if (socialAccount.lastPostedAt) {
      const cooldownMs = socialAccount.cooldownMinutes * 60 * 1000;
      const timeSinceLastPost = Date.now() - socialAccount.lastPostedAt.getTime();
      if (timeSinceLastPost < cooldownMs) {
        return false;
      }
    }

    // Check daily limit
    if (socialAccount.dailyUsed >= socialAccount.dailyLimit) {
      return false;
    }
  }

  return true;
}

/**
 * Execute posting via distribution service
 */
async function executePosting(post: any): Promise<{
  success: boolean;
  postUrl?: string;
  postId?: string;
  error?: string;
}> {
  try {
    // Get distribution details
    const distribution = await prisma.distributionQueue.findUnique({
      where: { id: post.distributionId },
      include: {
        brand: true,
      },
    });

    if (!distribution) {
      return { success: false, error: 'Distribution not found' };
    }

    // Get social account
    const socialAccount = await prisma.socialAccount.findFirst({
      where: {
        brandId: post.brandId,
        platform: post.platform,
        status: 'ACTIVE',
      },
    });

    if (!socialAccount) {
      return { success: false, error: `No social account for ${post.platform}` };
    }

    // In production, this would call the actual posting API (Zernio, etc.)
    // For now, simulate success
    const postUrl = `https://${post.platform.toLowerCase()}.com/p/simulated-${Date.now()}`;
    const postId = `simulated-${Date.now()}`;

    // Update social account stats
    await prisma.socialAccount.update({
      where: { id: socialAccount.id },
      data: {
        dailyUsed: { increment: 1 },
        lastPostedAt: new Date(),
      },
    });

    // Create posting log
    await prisma.postingLog.create({
      data: {
        socialAccountId: socialAccount.id,
        distributionId: post.distributionId,
        platform: post.platform,
        status: 'SUCCESS',
        postUrl,
        postedAt: new Date(),
      },
    });

    return { success: true, postUrl, postId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get worker stats
 */
export function getSchedulerStats(): typeof stats {
  return { ...stats };
}

/**
 * Check if worker is running
 */
export function isSchedulerRunning(): boolean {
  return isRunning;
}

// Main entry point for running as standalone script
if (require.main === module) {
  console.log('[SchedulerWorker] Starting as standalone process...');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('[SchedulerWorker] Received SIGINT, shutting down...');
    stopSchedulerWorker();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[SchedulerWorker] Received SIGTERM, shutting down...');
    stopSchedulerWorker();
    process.exit(0);
  });

  // Start the worker
  startSchedulerWorker().catch((error) => {
    console.error('[SchedulerWorker] Failed to start:', error);
    process.exit(1);
  });
}
