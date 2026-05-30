// ============================================
// PHASE 3: PRODUCTION PACKAGE SERVICE
// Generates production-ready content assets
// ============================================

import { PrismaClient } from '@prisma/client';
import { generateProductionPrompts } from '../lib/openai-content';

const prisma = new PrismaClient();

export interface ProductionPackageData {
  // Video Prompts
  videoPromptPippit: string;
  videoPromptVeo: string;
  videoPromptSeedance: string;
  videoPromptSora: string;

  // Image Prompts
  imagePromptThumbnail: string;
  imagePromptSocial: string;
  imagePromptCarousel: string;
  imagePromptAd: string;

  // Scripts
  voiceoverScript: string;
  subtitleScript: string;
}

export type ProductionStatus = 'draft' | 'approved' | 'production_ready' | 'rendering' | 'rendered' | 'failed';

/**
 * Generate a complete production package for approved content
 */
export async function generateProductionPackage(contentId: string): Promise<{
  success: boolean;
  packageId?: string;
  error?: string;
}> {
  try {
    // Get approved content with quality scores
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        product: true,
        contentVariants: true,
        qualityScores: { take: 1 },
      },
    });

    if (!content) {
      return { success: false, error: 'Content not found' };
    }

    if (content.approvalStatus !== 'APPROVED') {
      return { success: false, error: 'Content must be approved first' };
    }

    // Check if package already exists
    let existingPackage = await prisma.productionPackage.findFirst({
      where: { contentId },
    });

    // Get best variants
    const hooks = content.contentVariants.filter(v => v.variantType === 'HOOK');
    const captions = content.contentVariants.filter(v => v.variantType === 'CAPTION');
    const ctas = content.contentVariants.filter(v => v.variantType === 'CTA');

    const bestHook = content.qualityScores?.[0]?.bestHook || content.hook || hooks[0]?.contentValue || '';
    const bestCaption = content.qualityScores?.[0]?.bestCaption || content.caption || captions[0]?.contentValue || '';
    const bestCta = content.qualityScores?.[0]?.bestCta || content.cta || ctas[0]?.contentValue || '';
    const bestPlatform = content.qualityScores?.[0]?.bestPlatform || 'TikTok';

    // Generate production prompts using AI
    const productionData = await generateProductionPrompts({
      productName: content.product.name,
      productDescription: content.product.description || '',
      productPrice: Number(content.product.price),
      bestHook,
      bestCaption,
      bestCta,
      hashtags: content.hashtags || '',
    });

    // Create or update package
    const packageData = {
      contentId,
      productId: content.productId,
      status: 'production_ready' as ProductionStatus,
      bestPlatform,
      overallScore: content.qualityScores?.[0]?.overallScore || 0,
      videoPromptPippit: productionData.videoPromptPippit,
      videoPromptVeo: productionData.videoPromptVeo,
      videoPromptSeedance: productionData.videoPromptSeedance,
      videoPromptSora: productionData.videoPromptSora,
      imagePromptThumbnail: productionData.imagePromptThumbnail,
      imagePromptSocial: productionData.imagePromptSocial,
      imagePromptCarousel: productionData.imagePromptCarousel,
      imagePromptAd: productionData.imagePromptAd,
      voiceoverScript: productionData.voiceoverScript,
      subtitleScript: productionData.subtitleScript,
    };

    let packageId: string;

    if (existingPackage) {
      const updated = await prisma.productionPackage.update({
        where: { id: existingPackage.id },
        data: packageData,
      });
      packageId = updated.id;
    } else {
      const created = await prisma.productionPackage.create({
        data: packageData,
      });
      packageId = created.id;
    }

    return { success: true, packageId };
  } catch (error: any) {
    console.error('Error generating production package:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get production package by ID
 */
export async function getProductionPackage(packageId: string) {
  return prisma.productionPackage.findUnique({
    where: { id: packageId },
    include: {
      content: {
        include: { product: true }
      },
      product: true,
    },
  });
}

/**
 * Get all production packages
 */
export async function getAllProductionPackages(options?: {
  status?: ProductionStatus;
  productId?: string;
  limit?: number;
}) {
  const where: any = {};
  if (options?.status) where.status = options.status;
  if (options?.productId) where.productId = options.productId;

  return prisma.productionPackage.findMany({
    where,
    include: {
      content: {
        include: { product: true }
      },
      product: true,
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
  });
}

/**
 * Update package status
 */
export async function updatePackageStatus(packageId: string, status: ProductionStatus) {
  const data: any = { status };

  if (status === 'rendered') {
    data.renderedAt = new Date();
  }
  if (status === 'failed') {
    data.errorMessage = 'Failed during rendering';
  }

  return prisma.productionPackage.update({
    where: { id: packageId },
    data,
  });
}

/**
 * Delete production package
 */
export async function deleteProductionPackage(packageId: string) {
  return prisma.productionPackage.delete({
    where: { id: packageId },
  });
}

/**
 * Get production summary stats
 */
export async function getProductionStats() {
  const [total, draft, ready, rendering, rendered, failed] = await Promise.all([
    prisma.productionPackage.count(),
    prisma.productionPackage.count({ where: { status: 'draft' } }),
    prisma.productionPackage.count({ where: { status: 'production_ready' } }),
    prisma.productionPackage.count({ where: { status: 'rendering' } }),
    prisma.productionPackage.count({ where: { status: 'rendered' } }),
    prisma.productionPackage.count({ where: { status: 'failed' } }),
  ]);

  return { total, draft, production_ready: ready, rendering, rendered, failed };
}