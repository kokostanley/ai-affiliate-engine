// ============================================
// RENDER PIPELINE WORKER
// Processes queued render jobs and creates assets
// ============================================

import { PrismaClient } from '@prisma/client';
import * as pippit from '../services/pippit';
import * as higgsfield from '../services/higgsfield';
import * as cloudStorage from '../services/cloud-storage';
import 'dotenv/config';

const prisma = new PrismaClient();

const WORKER_CONFIG = {
  pollInterval: 10000, // 10 seconds
  maxConcurrentJobs: 2,
  maxRetries: 3,
  jobTimeout: 300000, // 5 minutes
};

interface RenderJobResult {
  success: boolean;
  outputUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * Render Pipeline Worker
 */
class RenderWorker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  start() {
    if (this.isRunning) {
      console.log('[RenderWorker] Already running');
      return;
    }

    console.log('🚀 Starting Render Pipeline Worker...');
    this.isRunning = true;

    // Initial scan
    this.processQueuedJobs();

    // Set up polling interval
    this.intervalId = setInterval(() => {
      this.processQueuedJobs();
    }, WORKER_CONFIG.pollInterval);

    console.log('✅ Render Worker started. Polling every', WORKER_CONFIG.pollInterval / 1000, 'seconds');
  }

  stop() {
    console.log('🛑 Stopping Render Pipeline Worker...');
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async processQueuedJobs() {
    try {
      // Get queued jobs
      const jobs = await prisma.renderJob.findMany({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
        take: WORKER_CONFIG.maxConcurrentJobs,
        include: {
          productionPackage: {
            include: { product: true }
          }
        }
      });

      if (jobs.length === 0) {
        return;
      }

      console.log(`[RenderWorker] Found ${jobs.length} queued job(s)`);

      for (const job of jobs) {
        await this.executeJob(job.id);
      }
    } catch (error) {
      console.error('[RenderWorker] Error in process loop:', error);
    }
  }

  async executeJob(jobId: string) {
    const job = await prisma.renderJob.findUnique({
      where: { id: jobId },
      include: {
        productionPackage: {
          include: { product: true }
        }
      }
    });

    if (!job) {
      console.error(`[RenderWorker] Job ${jobId} not found`);
      return;
    }

    if (job.status !== 'queued') {
      console.log(`[RenderWorker] Job ${jobId} not queued (status: ${job.status})`);
      return;
    }

    console.log(`[RenderWorker] Processing job ${jobId} (${job.tool})`);

    // Mark as processing
    await prisma.renderJob.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
      }
    });

    try {
      let result: RenderJobResult;

      // Execute based on tool
      switch (job.tool) {
        case 'PIPPIT':
          result = await this.executePippit(job);
          break;

        case 'VEO':
        case 'SEEDANCE':
        case 'SORA':
          result = await this.executeHiggsfieldVideo(job);
          break;

        case 'DALL_E':
        case 'MIDJOURNEY':
        case 'STABLE_DIFFUSION':
        case 'HIGGSFIELD_IMAGE':
          result = await this.executeHiggsfieldImage(job);
          break;

        default:
          result = { success: false, error: `Unknown tool: ${job.tool}` };
      }

      // Update job result
      if (result.success) {
        await this.handleJobSuccess(job, result);
      } else {
        await this.handleJobFailure(job, result.error || 'Unknown error');
      }
    } catch (error: any) {
      await this.handleJobFailure(job, error.message);
    }
  }

  async executePippit(job: any): Promise<RenderJobResult> {
    console.log(`[RenderWorker] Executing PIPPIT job ${job.id}`);

    // Check if Pippit is configured
    if (!pippit.isPippitConfigured()) {
      return { success: false, error: 'Pippit not configured. Add PIPPIT_API_KEY to .env' };
    }

    try {
      const result = await pippit.generateVideoWithPolling({
        prompt: job.prompt,
        aspectRatio: job.format === '16:9' ? '16:9' : '9:16',
        duration: job.duration || 30,
      });

      return {
        success: result.success,
        outputUrl: result.outputUrl,
        thumbnailUrl: result.thumbnailUrl,
        error: result.error,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async executeHiggsfieldVideo(job: any): Promise<RenderJobResult> {
    console.log(`[RenderWorker] Executing Higgsfield video job ${job.id}`);

    if (!higgsfield.isHiggsFieldConfigured()) {
      return { success: false, error: 'HiggsField not configured. Add HF_KEY_ID and HF_KEY_SECRET to .env' };
    }

    try {
      // Check if there's an image job that completed first
      const imageJob = await prisma.renderJob.findFirst({
        where: {
          productionPackageId: job.productionPackageId,
          jobType: 'IMAGE',
          status: 'completed',
        },
        orderBy: { completedAt: 'desc' },
      });

      if (imageJob?.outputUrl) {
        // Use image-to-video
        console.log(`[RenderWorker] Using image ${imageJob.outputUrl} for video generation`);
        const result = await higgsfield.generateVideo({
          imageUrl: imageJob.outputUrl,
          prompt: job.prompt,
          duration: job.duration || 4,
          resolution: '720p',
        });
        return result;
      }

      // Generate image first, then video
      console.log(`[RenderWorker] Generating image first for video job`);
      const imageResult = await higgsfield.generateImage({
        prompt: job.prompt + ' (high quality, professional)',
        aspectRatio: job.format === '16:9' ? '16:9' : '9:16',
      });

      if (!imageResult.success || !imageResult.outputUrl) {
        return { success: false, error: imageResult.error };
      }

      // Now generate video from image
      const videoResult = await higgsfield.generateVideo({
        imageUrl: imageResult.outputUrl,
        prompt: job.prompt,
        duration: job.duration || 4,
        resolution: '720p',
      });

      return videoResult;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async executeHiggsfieldImage(job: any): Promise<RenderJobResult> {
    console.log(`[RenderWorker] Executing Higgsfield image job ${job.id}`);

    if (!higgsfield.isHiggsFieldConfigured()) {
      return { success: false, error: 'HiggsField not configured' };
    }

    try {
      const result = await higgsfield.generateImage({
        prompt: job.prompt,
        aspectRatio: job.format === '1:1' ? '1:1' : '9:16',
      });

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async handleJobSuccess(job: any, result: RenderJobResult) {
    console.log(`[RenderWorker] Job ${job.id} completed successfully`);

    // Update job status
    await prisma.renderJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        outputUrl: result.outputUrl,
        thumbnailUrl: result.thumbnailUrl,
      }
    });

    // Upload to cloud storage and create AssetFile
    if (result.outputUrl) {
      try {
        const uploadResult = await cloudStorage.uploadRenderResult(
          job.id,
          result.outputUrl,
          {
            productId: job.productionPackage?.productId,
            packageId: job.productionPackageId,
            fileType: job.jobType,
            fileName: `${job.tool}_${job.id}.${job.jobType === 'VIDEO' ? 'mp4' : 'png'}`,
            provider: job.tool,
          }
        );

        if (uploadResult.success) {
          console.log(`[RenderWorker] Asset created: ${uploadResult.assetFileId}`);
        } else {
          console.log(`[RenderWorker] Cloud upload failed: ${uploadResult.error}`);
        }
      } catch (error: any) {
        console.error(`[RenderWorker] Cloud upload error:`, error.message);
      }
    }

    console.log(`[RenderWorker] ✅ Job ${job.id} done. Output: ${result.outputUrl}`);
  }

  async handleJobFailure(job: any, errorMessage: string) {
    console.error(`[RenderWorker] Job ${job.id} failed: ${errorMessage}`);

    // Check retry count
    const newRetryCount = (job.retryCount || 0) + 1;

    if (newRetryCount < WORKER_CONFIG.maxRetries) {
      console.log(`[RenderWorker] Re-queuing job ${job.id} (retry ${newRetryCount}/${WORKER_CONFIG.maxRetries})`);

      await prisma.renderJob.update({
        where: { id: job.id },
        data: {
          status: 'queued',
          retryCount: newRetryCount,
          errorMessage: errorMessage,
          startedAt: null,
        }
      });
    } else {
      console.log(`[RenderWorker] Max retries exceeded for job ${job.id}. Marking as failed.`);

      await prisma.renderJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: `Max retries exceeded: ${errorMessage}`,
        }
      });
    }
  }
}

// Export singleton
export const renderWorker = new RenderWorker();

// Run as standalone worker
if (require.main === module) {
  renderWorker.start();

  process.on('SIGINT', () => {
    console.log('\n[RenderWorker] Shutting down...');
    renderWorker.stop();
    prisma.$disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[RenderWorker] Shutting down...');
    renderWorker.stop();
    prisma.$disconnect();
    process.exit(0);
  });
}