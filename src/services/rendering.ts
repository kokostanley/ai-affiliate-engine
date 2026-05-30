// ============================================
// PHASE 4: RENDERING SERVICE
// Video/Image generation job management
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type RenderTool = 'PIPPIT' | 'VEO' | 'SEEDANCE' | 'SORA' | 'DALL_E' | 'MIDJOURNEY' | 'STABLE_DIFFUSION';
export type JobType = 'VIDEO' | 'IMAGE';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface RenderJobData {
  productionPackageId: string;
  jobType: JobType;
  tool: RenderTool;
  prompt: string;
  duration?: number;
  format?: string;
}

/**
 * Create a new render job
 */
export async function createRenderJob(data: RenderJobData) {
  return prisma.renderJob.create({
    data: {
      productionPackageId: data.productionPackageId,
      jobType: data.jobType,
      tool: data.tool,
      prompt: data.prompt,
      status: 'queued',
      duration: data.duration,
      format: data.format,
    },
    include: {
      productionPackage: {
        include: {
          product: true,
          content: true,
        },
      },
    },
  });
}

/**
 * Get all render jobs with filters
 */
export async function getRenderJobs(options?: {
  status?: JobStatus;
  tool?: RenderTool;
  productionPackageId?: string;
  limit?: number;
}) {
  const where: any = {};
  if (options?.status) where.status = options.status;
  if (options?.tool) where.tool = options.tool;
  if (options?.productionPackageId) where.productionPackageId = options.productionPackageId;

  return prisma.renderJob.findMany({
    where,
    include: {
      productionPackage: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
  });
}

/**
 * Get render job by ID
 */
export async function getRenderJob(jobId: string) {
  return prisma.renderJob.findUnique({
    where: { id: jobId },
    include: {
      productionPackage: {
        include: {
          product: true,
        },
      },
    },
  });
}

/**
 * Start processing a job
 */
export async function startJob(jobId: string, providerJobId?: string) {
  return prisma.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'processing',
      startedAt: new Date(),
      providerJobId,
    },
  });
}

/**
 * Complete a job with output
 */
export async function completeJob(jobId: string, output: {
  outputUrl: string;
  outputType?: string;
  thumbnailUrl?: string;
  duration?: number;
  size?: string;
}) {
  return prisma.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      outputUrl: output.outputUrl,
      outputType: output.outputType,
      thumbnailUrl: output.thumbnailUrl,
      duration: output.duration,
      size: output.size,
    },
  });
}

/**
 * Fail a job
 */
export async function failJob(jobId: string, errorMessage: string) {
  const job = await prisma.renderJob.findUnique({ where: { id: jobId } });

  if (job && job.retryCount < 3) {
    // Retry logic
    return prisma.renderJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        retryCount: { increment: 1 },
        errorMessage: `Retry ${job.retryCount + 1}: ${errorMessage}`,
      },
    });
  }

  return prisma.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    },
  });
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string) {
  return prisma.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      errorMessage: 'Cancelled by user',
      completedAt: new Date(),
    },
  });
}

/**
 * Get rendering stats
 */
export async function getRenderStats() {
  const [total, queued, processing, completed, failed] = await Promise.all([
    prisma.renderJob.count(),
    prisma.renderJob.count({ where: { status: 'queued' } }),
    prisma.renderJob.count({ where: { status: 'processing' } }),
    prisma.renderJob.count({ where: { status: 'completed' } }),
    prisma.renderJob.count({ where: { status: 'failed' } }),
  ]);

  return { total, queued, processing, completed, failed };
}

/**
 * Create multiple jobs for a production package
 */
export async function createBatchJobs(productionPackageId: string, options?: {
  videoTools?: RenderTool[];
  imageTools?: RenderTool[];
}) {
  const pkg = await prisma.productionPackage.findUnique({
    where: { id: productionPackageId },
    include: {
      product: true,
    },
  });

  if (!pkg) {
    throw new Error('Production package not found');
  }

  const jobs = [];

  // Video jobs
  const videoTools = options?.videoTools || ['PIPPIT', 'VEO'];
  if (pkg.videoPromptPippit && videoTools.includes('PIPPIT')) {
    jobs.push({
      productionPackageId,
      jobType: 'VIDEO',
      tool: 'PIPPIT',
      prompt: pkg.videoPromptPippit,
      duration: 30,
      format: '9:16',
    });
  }
  if (pkg.videoPromptVeo && videoTools.includes('VEO')) {
    jobs.push({
      productionPackageId,
      jobType: 'VIDEO',
      tool: 'VEO',
      prompt: pkg.videoPromptVeo,
      duration: 45,
      format: '16:9',
    });
  }
  if (pkg.videoPromptSeedance && videoTools.includes('SEEDANCE')) {
    jobs.push({
      productionPackageId,
      jobType: 'VIDEO',
      tool: 'SEEDANCE',
      prompt: pkg.videoPromptSeedance,
      duration: 30,
      format: '9:16',
    });
  }
  if (pkg.videoPromptSora && videoTools.includes('SORA')) {
    jobs.push({
      productionPackageId,
      jobType: 'VIDEO',
      tool: 'SORA',
      prompt: pkg.videoPromptSora,
      duration: 45,
      format: '9:16',
    });
  }

  // Image jobs
  if (pkg.imagePromptThumbnail) {
    jobs.push({
      productionPackageId,
      jobType: 'IMAGE',
      tool: 'DALL_E',
      prompt: pkg.imagePromptThumbnail,
    });
  }
  if (pkg.imagePromptSocial) {
    jobs.push({
      productionPackageId,
      jobType: 'IMAGE',
      tool: 'DALL_E',
      prompt: pkg.imagePromptSocial,
    });
  }
  if (pkg.imagePromptCarousel) {
    jobs.push({
      productionPackageId,
      jobType: 'IMAGE',
      tool: 'DALL_E',
      prompt: pkg.imagePromptCarousel,
    });
  }
  if (pkg.imagePromptAd) {
    jobs.push({
      productionPackageId,
      jobType: 'IMAGE',
      tool: 'DALL_E',
      prompt: pkg.imagePromptAd,
    });
  }

  // Create all jobs
  const createdJobs = await Promise.all(
    jobs.map(job => prisma.renderJob.create({ data: job }))
  );

  return createdJobs;
}

/**
 * Get next queued job for processing
 */
export async function getNextQueuedJob() {
  return prisma.renderJob.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    include: {
      productionPackage: {
        include: {
          product: true,
        },
      },
    },
  });
}

/**
 * Webhook handler for job completion
 */
export async function handleWebhook(jobId: string, data: {
  status: 'completed' | 'failed';
  outputUrl?: string;
  outputType?: string;
  thumbnailUrl?: string;
  error?: string;
}) {
  if (data.status === 'completed' && data.outputUrl) {
    return completeJob(jobId, {
      outputUrl: data.outputUrl,
      outputType: data.outputType,
      thumbnailUrl: data.thumbnailUrl,
    });
  } else {
    return failJob(jobId, data.error || 'Unknown error');
  }
}