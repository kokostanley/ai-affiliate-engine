// ============================================
// CONTENT APPROVAL PIPELINE SERVICE
//
// WORKFLOW RULES:
// -------------
// IMAGE/CAROUSEL:
//   APPROVE → generate image asset → upload to Google Drive → create Zernio draft
//
// VIDEO (PIPPIT_MANUAL):
//   APPROVE → create WAITING_UPLOAD package → status = WAITING_PIPPIT_UPLOAD
//   DO NOT create PIPPIT or VEO render jobs
//
// VIDEO (HIGGSFIELD_AUTO):
//   Only create Higgsfield render jobs if credits available
//   DO NOT create PIPPIT render jobs
//
// IMPORTANT: Render queue must remain empty for PIPPIT_MANUAL
// ============================================

import { PrismaClient } from '@prisma/client';
import { generateProductionPackage } from './production';
import { createRenderJob } from './render-engine';
import * as distribution from './distribution';
import * as linkTracking from './link-tracking';

const prisma = new PrismaClient();

export type ContentType = 'VIDEO' | 'IMAGE' | 'CAROUSEL';
export type Provider = 'PIPPIT_MANUAL' | 'HIGGSFIELD_AUTO' | 'DALL_E' | 'OPENAI_IMAGE';

export interface PipelineResult {
  success: boolean;
  contentId: string;
  contentType: ContentType;
  productionPackageId?: string;
  renderJobIds: string[];
  distributionId?: string;
  trackingId?: string;
  trackingLink?: string;
  zernioPostId?: string;
  steps: string[];
  warning?: string;
  error?: string;
}

/**
 * Execute pipeline for specific content type
 */
export async function executeContentTypePipeline(
  contentId: string,
  contentType: ContentType,
  options?: {
    autoApprove?: boolean;
    provider?: Provider;
    platform?: string;
    brandId?: string;
  }
): Promise<PipelineResult> {
  const steps: string[] = [];
  const result: PipelineResult = {
    success: false,
    contentId,
    contentType,
    renderJobIds: [],
    steps,
  };

  try {
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { product: true, qualityScores: true },
    });

    if (!content) {
      steps.push('❌ Content not found');
      result.error = 'Content not found';
      return result;
    }

    // Auto-approve if requested
    if (content.approvalStatus !== 'APPROVED') {
      if (options?.autoApprove) {
        await prisma.content.update({
          where: { id: contentId },
          data: { approvalStatus: 'APPROVED', approvedAt: new Date() },
        });
        steps.push('✅ Content auto-approved');

        // Update affiliate link tracking pipeline stage
        try {
          // Try to find tracking by contentId
          const tracking = await linkTracking.getTrackingByContentId(content.id);
          if (tracking) {
            await linkTracking.updatePipelineStage(tracking.id, 'APPROVED', 'Content approved via pipeline');
            steps.push('📊 Tracking stage: APPROVED');
          }
        } catch (trackingError) {
          console.error('[Pipeline] Failed to update tracking stage:', trackingError);
        }
      } else {
        steps.push('❌ Content not approved');
        result.error = 'Content not approved';
        return result;
      }
    } else {
      steps.push('✅ Content approved');
    }

    // Get brand
    let brandId = options?.brandId;
    if (!brandId) {
      const brand = await prisma.brand.findFirst({ where: { status: 'ACTIVE' } });
      brandId = brand?.id;
    }

    if (!brandId) {
      steps.push('❌ No brand configured');
      result.error = 'No brand configured';
      return result;
    }

    // Determine provider - default to PIPPIT_MANUAL for VIDEO
    const provider = options?.provider || (contentType === 'VIDEO' ? 'PIPPIT_MANUAL' : 'OPENAI_IMAGE');

    // Execute by content type AND provider
    switch (contentType) {
      case 'VIDEO':
        return await executeVideoPipeline(content, brandId, { ...options, provider }, steps, result);
      case 'IMAGE':
        return await executeImagePipeline(content, brandId, { ...options, provider }, steps, result);
      case 'CAROUSEL':
        return await executeCarouselPipeline(content, brandId, { ...options, provider }, steps, result);
      default:
        steps.push(`❌ Unknown content type: ${contentType}`);
        return result;
    }

  } catch (error: any) {
    console.error('[Pipeline] Error:', error);
    steps.push(`❌ Error: ${error.message}`);
    result.error = error.message;
    return result;
  }
}

/**
 * VIDEO Pipeline
 *
 * PIPPIT_MANUAL: Create WAITING_UPLOAD package, DO NOT create render jobs
 * HIGGSFIELD_AUTO: Create Higgsfield render jobs only if credits available
 */
async function executeVideoPipeline(
  content: any,
  brandId: string,
  options: any,
  steps: string[],
  result: PipelineResult
): Promise<PipelineResult> {
  const contentId = content.id;
  const productId = content.productId;
  const provider = options.provider || 'PIPPIT_MANUAL';

  steps.push(`🎬 Video Pipeline (Provider: ${provider})`);

  // Generate production package
  const packageResult = await generateProductionPackage(contentId);

  if (!packageResult.success) {
    steps.push(`❌ Package failed: ${packageResult.error}`);
    result.error = packageResult.error;
    return result;
  }

  steps.push(`✅ Package: ${packageResult.packageId}`);
  result.productionPackageId = packageResult.packageId;

  // PIPPIT_MANUAL: Create WAITING_UPLOAD package, DO NOT create render jobs
  if (provider === 'PIPPIT_MANUAL') {
    steps.push('📦 Creating WAITING_UPLOAD package...');

    // Create distribution with WAITING_PIPPIT_UPLOAD status
    const distResult = await distribution.createDistribution({
      brandId,
      productId,
      contentType: 'VIDEO',
      platform: options?.platform || 'TIKTOK',
      provider: 'PIPPIT_MANUAL',
      caption: content.qualityScores?.[0]?.bestCaption || content.caption || content.hook || '',
      hashtags: (content.hashtags || '').split(',').filter(Boolean),
      script: content.script || undefined,
      videoUrl: undefined, // Will be attached later
    });

    if (distResult.success && distResult.item) {
      steps.push(`✅ Distribution: ${distResult.item.id.substring(0, 8)}...`);
      steps.push('📤 Status: WAITING_PIPPIT_UPLOAD');
      steps.push('📋 Use /pippit to generate upload package');
    } else {
      steps.push(`❌ Distribution failed: ${distResult.error}`);
      result.error = distResult.error;
    }

    steps.push('🎬 Video pipeline: Waiting for Pippit upload');
    result.success = true;
    result.warning = 'WAITING_PIPPIT_UPLOAD - Upload video manually via Pippit';
    return result;
  }

  // HIGGSFIELD_AUTO: Create Higgsfield render jobs only
  if (provider === 'HIGGSFIELD_AUTO') {
    steps.push('🎬 Higgsfield Auto mode');

    const prodPkg = await prisma.productionPackage.findUnique({
      where: { id: packageResult.packageId }
    });

    // Check for Higgsfield prompt
    const higgsfieldPrompt = prodPkg?.videoPromptSeedance || prodPkg?.videoPromptSora;

    if (higgsfieldPrompt) {
      // TODO: Check Higgsfield credits before creating job
      // const hasCredits = await checkHiggsfieldCredits();
      const hasCredits = true; // Placeholder

      if (hasCredits) {
        const job = await createRenderJob({
          productionPackageId: packageResult.packageId,
          jobType: 'VIDEO',
          tool: 'SEEDANCE', // Use SEEDANCE as the Higgsfield video tool
          prompt: higgsfieldPrompt,
          duration: 30,
          format: '9:16',
        });

        if (job) {
          result.renderJobIds.push(job.id);
          steps.push(`✅ HIGGSFIELD job: ${job.id.substring(0, 8)}...`);
        }
      } else {
        steps.push('⚠️ No Higgsfield credits - skipped render');
      }
    } else {
      steps.push('⚠️ No Higgsfield prompt found');
    }

    // Create distribution
    const distResult = await distribution.createDistribution({
      brandId,
      productId,
      contentType: 'VIDEO',
      platform: options?.platform || 'TIKTOK',
      provider: 'HIGGSFIELD_AUTO',
      caption: content.qualityScores?.[0]?.bestCaption || content.caption || content.hook || '',
      hashtags: (content.hashtags || '').split(',').filter(Boolean),
      script: content.script || undefined,
    });

    if (distResult.success) {
      steps.push('✅ Distribution created');
    }

    steps.push('🎬 Video pipeline ready');
    result.success = true;
    return result;
  }

  // Other providers (should not create render jobs)
  steps.push('🎬 Pipeline ready (no auto-render)');
  result.success = true;
  return result;
}

/**
 * IMAGE Pipeline
 *
 * Generate image asset → upload to Google Drive → create Zernio draft
 */
async function executeImagePipeline(
  content: any,
  brandId: string,
  options: any,
  steps: string[],
  result: PipelineResult
): Promise<PipelineResult> {
  const contentId = content.id;
  const productId = content.productId;

  steps.push('🖼️ Image Pipeline');

  // Generate production package
  const packageResult = await generateProductionPackage(contentId);

  if (!packageResult.success) {
    steps.push(`❌ Package failed: ${packageResult.error}`);
    result.error = packageResult.error;
    return result;
  }

  steps.push(`✅ Package: ${packageResult.packageId}`);
  result.productionPackageId = packageResult.packageId;

  const prodPkg = await prisma.productionPackage.findUnique({
    where: { id: packageResult.packageId }
  });

  // Create DALL-E image render job
  if (prodPkg?.imagePromptThumbnail) {
    const job = await createRenderJob({
      productionPackageId: packageResult.packageId,
      jobType: 'IMAGE',
      tool: 'DALL_E',
      prompt: prodPkg.imagePromptThumbnail,
      format: '1:1',
    });

    if (job) {
      result.renderJobIds.push(job.id);
      steps.push(`✅ DALL_E job: ${job.id.substring(0, 8)}...`);
      steps.push('⏳ Image will be uploaded to Google Drive after render');
    }
  }

  // Create distribution
  const distResult = await distribution.createDistribution({
    brandId,
    productId,
    contentType: 'IMAGE',
    platform: options?.platform || 'INSTAGRAM',
    provider: 'OPENAI_IMAGE',
    caption: content.qualityScores?.[0]?.bestCaption || content.caption || '',
    hashtags: (content.hashtags || '').split(',').filter(Boolean),
  });

  if (distResult.success && distResult.item) {
    result.distributionId = distResult.item.id;
    steps.push(`✅ Distribution: ${distResult.item.id.substring(0, 8)}...`);

    // AUTO-APPROVE: Move distribution from DRAFT to QUEUED
    // This triggers the DistributionWorker to auto-post to Zernio
    await prisma.distributionQueue.update({
      where: { id: distResult.item.id },
      data: {
        status: 'QUEUED',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: 'auto-pipeline',
      },
    });
    steps.push(`✅ Distribution auto-approved to QUEUED`);
    steps.push(`🚀 Worker will post to Zernio automatically`);

    // Get tracking record
    const tracking = await linkTracking.getTrackingByDistributionId(distResult.item.id);
    if (tracking) {
      result.trackingId = tracking.id;
      result.trackingLink = tracking.trackingLink || tracking.originalLink;
      steps.push(`📊 Tracking: ${result.trackingLink?.substring(0, 50)}...`);
    }

    // AUTO-CREATE ZERNIO DRAFT
    // Create Zernio draft immediately for faster posting
    try {
      const { createZernioDraft } = await import('./zernio');
      const zernioResult = await createZernioDraft(distResult.item.id);
      if (zernioResult.success) {
        result.zernioPostId = zernioResult.postId;
        steps.push(`✅ Zernio draft: ${zernioResult.postId.substring(0, 8)}...`);
      }
    } catch (zernioError) {
      console.error('[Pipeline] Zernio draft failed:', zernioError);
      steps.push(`⚠️ Zernio draft: ${(zernioError as Error).message}`);
    }
  } else {
    steps.push(`⚠️ Distribution: ${distResult.error || 'skipped'}`);
  }

  steps.push('🖼️ Image pipeline ready');
  result.success = true;
  return result;
}

/**
 * CAROUSEL Pipeline
 *
 * Generate carousel slides → upload to Google Drive → create Zernio draft
 */
async function executeCarouselPipeline(
  content: any,
  brandId: string,
  options: any,
  steps: string[],
  result: PipelineResult
): Promise<PipelineResult> {
  const contentId = content.id;
  const productId = content.productId;

  steps.push('🎠 Carousel Pipeline');

  // Generate production package
  const packageResult = await generateProductionPackage(contentId);

  if (!packageResult.success) {
    steps.push(`❌ Package failed: ${packageResult.error}`);
    result.error = packageResult.error;
    return result;
  }

  steps.push(`✅ Package: ${packageResult.packageId}`);
  result.productionPackageId = packageResult.packageId;

  const prodPkg = await prisma.productionPackage.findUnique({
    where: { id: packageResult.packageId }
  });

  const carouselPrompt = prodPkg?.imagePromptCarousel || prodPkg?.imagePromptSocial || prodPkg?.imagePromptThumbnail || content.caption || '';

  // Create 5 carousel slide jobs
  for (let i = 0; i < 5; i++) {
    const job = await createRenderJob({
      productionPackageId: packageResult.packageId,
      jobType: 'IMAGE',
      tool: 'DALL_E',
      prompt: `${carouselPrompt}\n\nSlide ${i + 1} of 5`,
      format: '9:16',
    });

    if (job) {
      result.renderJobIds.push(job.id);
    }
  }

  steps.push(`✅ ${result.renderJobIds.length} carousel slide jobs`);
  steps.push('⏳ Images will be uploaded to Google Drive after render');

  // Create distribution
  const distResult = await distribution.createDistribution({
    brandId,
    productId,
    contentType: 'CAROUSEL',
    platform: options?.platform || 'INSTAGRAM',
    provider: 'OPENAI_IMAGE',
    caption: content.qualityScores?.[0]?.bestCaption || content.caption || '',
    hashtags: (content.hashtags || '').split(',').filter(Boolean),
  });

  if (distResult.success && distResult.item) {
    steps.push(`✅ Distribution: ${distResult.item.id.substring(0, 8)}...`);

    // AUTO-APPROVE: Move distribution from DRAFT to QUEUED
    // This triggers the DistributionWorker to auto-post to Zernio
    await prisma.distributionQueue.update({
      where: { id: distResult.item.id },
      data: {
        status: 'QUEUED',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: 'auto-pipeline',
      },
    });
    steps.push(`✅ Distribution auto-approved to QUEUED`);
    steps.push(`🚀 Worker will post to Zernio automatically`);

    // Get tracking record
    const tracking = await linkTracking.getTrackingByDistributionId(distResult.item.id);
    if (tracking) {
      result.trackingId = tracking.id;
      result.trackingLink = tracking.trackingLink || tracking.originalLink;
      steps.push(`📊 Tracking: ${result.trackingLink?.substring(0, 50)}...`);
    }

    // AUTO-CREATE ZERNIO DRAFT
    // Create Zernio draft immediately for faster posting
    try {
      const { createZernioDraft } = await import('./zernio');
      const zernioResult = await createZernioDraft(distResult.item.id);
      if (zernioResult.success) {
        result.zernioPostId = zernioResult.postId;
        steps.push(`✅ Zernio draft: ${zernioResult.postId.substring(0, 8)}...`);
      }
    } catch (zernioError) {
      console.error('[Pipeline] Zernio draft failed:', zernioError);
      steps.push(`⚠️ Zernio draft: ${(zernioError as Error).message}`);
    }
  } else {
    steps.push(`⚠️ Distribution: ${distResult.error || 'skipped'}`);
  }

  steps.push('🎠 Carousel pipeline ready');
  result.success = true;
  result.distributionId = distResult.item?.id || result.distributionId;
  return result;
}

/**
 * Legacy support - default to VIDEO with PIPPIT_MANUAL
 */
export async function executeApprovalPipeline(
  contentId: string,
  options?: { autoApprove?: boolean; provider?: Provider; platform?: string; brandId?: string }
): Promise<PipelineResult> {
  return executeContentTypePipeline(contentId, 'VIDEO', {
    ...options,
    provider: options?.provider || 'PIPPIT_MANUAL',
  });
}

/**
 * Process approved distributions
 */
export async function processApprovedDistributions(brandId?: string): Promise<{ processed: number; succeeded: number; failed: number }> {
  const where: any = { approvalStatus: 'APPROVED', status: { in: ['DRAFT', 'QUEUED'] } };
  if (brandId) where.brandId = brandId;
  const items = await prisma.distributionQueue.findMany({ where });
  let succeeded = 0, failed = 0;
  for (const item of items) {
    try {
      const distResult = await distribution.executePosting(item.id);
      distResult.success ? succeeded++ : failed++;
    } catch { failed++; }
  }
  return { processed: items.length, succeeded, failed };
}

/**
 * Get pipeline status
 */
export async function getContentPipelineStatus(contentId: string) {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) return null;

  const packages = await prisma.productionPackage.findMany({ where: { contentId }, include: { renderJobs: true } });
  const distributions = await prisma.distributionQueue.findMany({
    where: { productId: content.productId },
    orderBy: { createdAt: 'desc' }
  });

  return {
    content: { id: content.id, status: content.approvalStatus },
    packages: packages.map(p => ({
      id: p.id,
      status: p.status,
      jobs: p.renderJobs.map(j => ({ id: j.id, tool: j.tool, status: j.status }))
    })),
    distributions: distributions.map(d => ({
      id: d.id,
      type: d.contentType,
      status: d.status,
      provider: d.provider,
      postUrl: d.postUrl
    })),
  };
}
