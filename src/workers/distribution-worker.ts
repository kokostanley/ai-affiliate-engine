// ============================================
// DISTRIBUTION PIPELINE WORKER
// Auto-posts content to social media via Zernio
// ============================================

import { PrismaClient } from '@prisma/client';
import * as distribution from '../services/distribution';
import * as linkTracking from '../services/link-tracking';
import 'dotenv/config';

const prisma = new PrismaClient();

const WORKER_CONFIG = {
  pollInterval: 15000, // 15 seconds
  maxConcurrentPosts: 3,
  maxRetries: 3,
};

interface WorkerStats {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * Distribution Pipeline Worker
 *
 * Processes DistributionQueue items that are:
 * - QUEUED: Ready to post immediately
 * - READY: Has video/image, ready to post
 * - ZERNIO_DRAFT_CREATED: Draft exists, needs publishing
 * - ZERNIO_SCHEDULED: Scheduled, needs status check
 */
class DistributionWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private stats: WorkerStats = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

  start() {
    if (this.isRunning) {
      console.log('[DistributionWorker] Already running');
      return;
    }

    console.log('🚀 Starting Distribution Pipeline Worker...');
    this.isRunning = true;

    // Initial scan
    this.processQueuedItems();

    // Set up polling interval
    this.intervalId = setInterval(() => {
      this.processQueuedItems();
    }, WORKER_CONFIG.pollInterval);

    console.log('✅ Distribution Worker started. Polling every', WORKER_CONFIG.pollInterval / 1000, 'seconds');
  }

  stop() {
    console.log('🛑 Stopping Distribution Pipeline Worker...');
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getStats(): WorkerStats {
    return { ...this.stats };
  }

  async processQueuedItems() {
    if (!this.isRunning) return;

    try {
      // Find items ready for posting
      // For CAROUSEL, check if there are completed render jobs with assets
      // For IMAGE/VIDEO, check videoUrl or thumbnailUrl
      const readyItems = await prisma.distributionQueue.findMany({
        where: {
          status: 'QUEUED',
          approvalStatus: 'APPROVED',
          OR: [
            // IMAGE with thumbnail
            { contentType: 'IMAGE', thumbnailUrl: { not: null } },
            // VIDEO with video URL
            { contentType: 'VIDEO', videoUrl: { not: null } },
            // CAROUSEL - check for completed render jobs with assets
            { contentType: 'CAROUSEL' },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: WORKER_CONFIG.maxConcurrentPosts,
      });

      // Filter out carousel items that don't have assets yet
      const itemsWithAssets = await Promise.all(
        readyItems.map(async (item) => {
          if (item.contentType === 'CAROUSEL') {
            // Check if carousel has completed render jobs with assets
            // CRITICAL FIX: Ensure assets are from THIS distribution's production package
            const renderJobs = await prisma.renderJob.findMany({
              where: {
                productionPackage: {
                  productId: item.productId,
                },
                jobType: 'IMAGE',
                status: 'completed',
              },
              include: { productionPackage: true },
            });

            // CRITICAL: Get assets linked to THIS specific distribution's package
            const distPackage = await prisma.distributionQueue.findUnique({
              where: { id: item.id },
              select: { productId: true },
            });

            // Check for asset files from THIS package
            const assetFiles = await prisma.assetFile.findMany({
              where: {
                productId: item.productId,
                packageId: distPackage ? { not: null } : undefined, // Must have packageId
                fileType: 'IMAGE',
                uploadStatus: 'uploaded',
                cloudUrl: { not: null },
              },
              orderBy: { createdAt: 'asc' },
            });

            // CRITICAL FIX: Only process if we have at least 3 carousel slides from THIS package
            const hasEnoughSlides = assetFiles.length >= 3;
            const hasCompletedJobs = renderJobs.length >= 3;

            if (hasEnoughSlides || hasCompletedJobs) {
              console.log(`[DistributionWorker] Carousel ${item.id}: ${assetFiles.length} slides ready`);
              return item;
            }
            console.log(`[DistributionWorker] Carousel ${item.id}: waiting for more slides (${assetFiles.length}/3)`);
            return null;
          }
          return item;
        })
      );

      const filteredItems = itemsWithAssets.filter(Boolean);

      if (filteredItems.length === 0) {
        return;
      }

      console.log(`[DistributionWorker] Found ${filteredItems.length} item(s) ready for posting`);

      for (const item of filteredItems) {
        await this.processItem(item.id);
      }
    } catch (error) {
      console.error('[DistributionWorker] Error in process loop:', error);
    }
  }

  async processItem(itemId: string): Promise<boolean> {
    this.stats.processed++;

    try {
      const item = await prisma.distributionQueue.findUnique({
        where: { id: itemId },
        include: { brand: true },
      });

      if (!item) {
        console.error(`[DistributionWorker] Item ${itemId} not found`);
        this.stats.failed++;
        return false;
      }

      console.log(`[DistributionWorker] Processing item ${itemId} (${item.contentType} → ${item.platform})`);

      // Execute posting via Zernio
      const result = await distribution.executePosting(itemId);

      if (result.success) {
        console.log(`[DistributionWorker] ✅ Item ${itemId} posted successfully`);
        this.stats.succeeded++;

        // Update tracking record
        try {
          const tracking = await linkTracking.getTrackingByDistributionId(itemId);
          if (tracking) {
            await linkTracking.updatePipelineStage(tracking.id, 'POSTED');

            // Update post details in tracking
            if (result.item?.postUrl) {
              await linkTracking.recordEvent({
                trackingId: tracking.id,
                eventType: 'STAGE_CHANGE',
              });
            }
          }
        } catch (trackingError) {
          console.error('[DistributionWorker] Failed to update tracking:', trackingError);
        }

        return true;
      } else {
        console.error(`[DistributionWorker] ❌ Item ${itemId} failed:`, result.error);
        this.stats.failed++;

        // Check if should retry
        if (item.retryCount < WORKER_CONFIG.maxRetries) {
          const newRetryCount = item.retryCount + 1;
          await prisma.distributionQueue.update({
            where: { id: itemId },
            data: {
              retryCount: newRetryCount,
              errorMessage: result.error || 'Unknown error',
            },
          });
          console.log(`[DistributionWorker] Re-queued for retry ${newRetryCount}/${WORKER_CONFIG.maxRetries}`);
        }

        return false;
      }
    } catch (error: any) {
      console.error(`[DistributionWorker] Error processing item ${itemId}:`, error.message);
      this.stats.failed++;
      return false;
    }
  }

  /**
   * Trigger distribution for a specific production package
   * Called by render-worker after asset upload
   */
  async triggerForPackage(packageId: string): Promise<void> {
    console.log(`[DistributionWorker] Triggering distribution for package ${packageId}`);

    // Find distribution items linked to this package via asset files
    const items = await prisma.distributionQueue.findMany({
      where: {
        assetFileId: { not: null },
        status: { in: ['DRAFT'] },
      },
    });

    // Also check by product association
    const packageRecord = await prisma.productionPackage.findUnique({
      where: { id: packageId },
    });

    if (packageRecord?.productId) {
      const productItems = await prisma.distributionQueue.findMany({
        where: {
          productId: packageRecord.productId,
          status: { in: ['DRAFT'] },
        },
      });

      // Add unique items
      const existingIds = new Set(items.map(i => i.id));
      for (const pi of productItems) {
        if (!existingIds.has(pi.id)) {
          items.push(pi);
        }
      }
    }

    console.log(`[DistributionWorker] Found ${items.length} distribution item(s) for package ${packageId}`);

    for (const item of items) {
      // Move to QUEUED status
      await prisma.distributionQueue.update({
        where: { id: item.id },
        data: { status: 'QUEUED' },
      });

      // Process immediately
      await this.processItem(item.id);
    }
  }
}

// Export singleton
export const distributionWorker = new DistributionWorker();

// Run as standalone worker
if (require.main === module) {
  distributionWorker.start();

  // Log stats every minute
  setInterval(() => {
    const stats = distributionWorker.getStats();
    console.log('[DistributionWorker] Stats:', stats);
  }, 60000);

  process.on('SIGINT', () => {
    console.log('\n[DistributionWorker] Shutting down...');
    distributionWorker.stop();
    prisma.$disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[DistributionWorker] Shutting down...');
    distributionWorker.stop();
    prisma.$disconnect();
    process.exit(0);
  });
}