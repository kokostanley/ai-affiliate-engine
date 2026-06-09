// ============================================
// RENDERING INTEGRATION ENGINE
// Connects rendering jobs to AI providers
// HIGGSFIELD + PIPPIT (and others)
// ============================================

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as higgsfield from './higgsfield';
import * as pippit from './pippit';
import * as cloudStorage from './cloud-storage';

const prisma = new PrismaClient();

export type RenderTool = 'PIPPIT' | 'VEO' | 'SEEDANCE' | 'SORA' | 'DALL_E' | 'MIDJOURNEY' | 'STABLE_DIFFUSION' | 'HIGGSFIELD_IMAGE' | 'HIGGSFIELD_VIDEO';

export interface RenderResult {
  success: boolean;
  outputUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface CreateJobInput {
  productionPackageId: string;
  jobType: 'VIDEO' | 'IMAGE';
  tool: RenderTool;
  prompt: string;
  duration?: number;
  format?: string;
}

/**
 * Create a new render job
 */
export async function createRenderJob(input: CreateJobInput): Promise<{ id: string; status: string } | null> {
  try {
    // Check if job already exists for this package/tool
    const existing = await prisma.renderJob.findFirst({
      where: {
        productionPackageId: input.productionPackageId,
        tool: input.tool,
      },
    });

    if (existing) {
      console.log(`[Render] Job already exists for ${input.tool}: ${existing.id}`);
      return existing;
    }

    const job = await prisma.renderJob.create({
      data: {
        productionPackageId: input.productionPackageId,
        jobType: input.jobType,
        tool: input.tool,
        prompt: input.prompt,
        duration: input.duration || 30,
        format: input.format || '9:16',
        status: 'queued',
      },
    });

    console.log(`[Render] Created job ${job.id} for ${input.tool}`);
    return { id: job.id, status: job.status };
  } catch (error: any) {
    console.error('[Render] Failed to create job:', error.message);
    return null;
  }
}

/**
 * Execute a render job using the appropriate provider
 */
export async function executeRenderJob(jobId: string): Promise<RenderResult> {
  const job = await prisma.renderJob.findUnique({
    where: { id: jobId },
    include: {
      productionPackage: {
        include: { product: true }
      }
    }
  });

  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  console.log(`[Render] Executing job ${jobId} using ${job.tool}`);

  // Mark as processing
  await prisma.renderJob.update({
    where: { id: jobId },
    data: { status: 'processing', startedAt: new Date() }
  });

  try {
    let result: RenderResult;

    switch (job.tool) {
      case 'PIPPIT':
        result = await executePippit(job);
        break;

      case 'VEO':
      case 'SEEDANCE':
      case 'SORA':
        // Use Higgsfield for VEO/Seedance/Sora
        result = await executeHiggsfield(job);
        break;

      case 'DALL_E':
      case 'MIDJOURNEY':
      case 'STABLE_DIFFUSION':
        // Use Higgsfield for images
        result = await executeHiggsfieldImage(job);
        break;

      default:
        result = { success: false, error: `Unknown tool: ${job.tool}` };
    }

    // Update job status
    if (result.success) {
      await prisma.renderJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          outputUrl: result.outputUrl,
          thumbnailUrl: result.thumbnailUrl,
        }
      });

      // Upload to cloud storage and create AssetFile
      // This handles: upload to GD/Dropbox, update DB, delete local file
      const uploadResult = await cloudStorage.uploadRenderResult(
        jobId,
        result.outputUrl!,
        {
          productId: job.productionPackage?.productId,
          packageId: job.productionPackageId,
          fileType: job.jobType,
          fileName: `${job.tool}_${jobId}.mp4`,
          provider: job.tool as any,
        }
      );

      if (uploadResult.success) {
        console.log(`[Render] Asset uploaded to cloud. Asset ID: ${uploadResult.assetFileId}`);
      } else {
        console.log(`[Render] Cloud upload failed, asset saved locally: ${uploadResult.error}`);
      }

      // Clean up any remaining local source files
      await cleanupLocalRenderFiles(job);

      return result;
    } else {
      await prisma.renderJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          errorMessage: result.error,
          completedAt: new Date(),
        }
      });
    }

    return result;
  } catch (error: any) {
    console.error(`[Render] Job ${jobId} failed:`, error);

    await prisma.renderJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date(),
      }
    });

    return { success: false, error: error.message };
  }
}

/**
 * Execute Pippit video generation
 */
async function executePippit(job: any): Promise<RenderResult> {
  if (!pippit.isPippitConfigured()) {
    return { success: false, error: 'Pippit not configured. Add PIPPIT_API_KEY to .env' };
  }

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
}

/**
 * Execute Higgsfield video generation
 */
async function executeHiggsfield(job: any): Promise<RenderResult> {
  if (!higgsfield.isHiggsFieldConfigured()) {
    return { success: false, error: 'HiggsField not configured. Add HF_KEY_ID and HF_KEY_SECRET to .env' };
  }

  // Get image URL from first image render job if exists
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
    const result = await higgsfield.generateVideo({
      imageUrl: imageJob.outputUrl,
      prompt: job.prompt,
      duration: job.duration || 4,
      resolution: '720p',
    });

    return {
      success: result.success,
      outputUrl: result.outputUrl,
      thumbnailUrl: result.thumbnailUrl,
      error: result.error,
    };
  }

  // Generate image first, then video
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

  return {
    success: videoResult.success,
    outputUrl: videoResult.outputUrl,
    thumbnailUrl: videoResult.thumbnailUrl,
    error: videoResult.error,
  };
}

/**
 * Execute Higgsfield image generation
 */
async function executeHiggsfieldImage(job: any): Promise<RenderResult> {
  if (!higgsfield.isHiggsFieldConfigured()) {
    return { success: false, error: 'HiggsField not configured' };
  }

  const result = await higgsfield.generateImage({
    prompt: job.prompt,
    aspectRatio: job.format === '1:1' ? '1:1' : '9:16',
  });

  return {
    success: result.success,
    outputUrl: result.outputUrl,
    thumbnailUrl: result.thumbnailUrl,
    error: result.error,
  };
}

/**
 * Process all queued jobs
 */
export async function processQueuedJobs(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const jobs = await prisma.renderJob.findMany({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    const result = await executeRenderJob(job.id);
    if (result.success) succeeded++;
    else failed++;
  }

  return { processed: jobs.length, succeeded, failed };
}

/**
 * Get provider status
 */
export async function getProviderStatus(): Promise<{
  pippit: { configured: boolean; message: string };
  higgsfield: { configured: boolean; message: string };
}> {
  const pippitConfigured = pippit.isPippitConfigured();
  const higgsfieldConfigured = higgsfield.isHiggsFieldConfigured();

  return {
    pippit: {
      configured: pippitConfigured,
      message: pippitConfigured ? 'Pippit API ready' : 'Add PIPPIT_API_KEY to .env',
    },
    higgsfield: {
      configured: higgsfieldConfigured,
      message: higgsfieldConfigured ? 'HiggsField API ready' : 'Add HF_KEY_ID and HF_KEY_SECRET to .env',
    },
  };
}

/**
 * Clean up local source files after successful render
 * Only deletes files from the temp directory
 */
async function cleanupLocalRenderFiles(job: any): Promise<void> {
  const tempDir = process.env.LOCAL_TEMP_DIR || './tmp';
  let deletedCount = 0;

  // Check if prompt contains local file references
  // This is a simplified cleanup - actual implementation would track input files
  try {
    // For jobs with local input files, delete them
    // The prompt or input might contain file paths that need cleanup

    // List files in temp dir and clean old ones (>1 hour)
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = fs.statSync(filePath);
          // Delete files older than 1 hour
          if (stats.mtimeMs < oneHourAgo) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch {
          // Skip files that can't be accessed
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`[Storage] Cleaned up ${deletedCount} old temp file(s)`);
    }
  } catch (error: any) {
    console.error('[Storage] Cleanup error:', error.message);
  }
}