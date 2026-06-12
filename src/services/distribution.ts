// ============================================
// DISTRIBUTION QUEUE SERVICE
// Manages content distribution workflow
// ============================================

import { PrismaClient } from '@prisma/client';
import * as zernio from './zernio';
import * as brandService from './brand';
import * as cloudStorage from './cloud-storage';
import * as affiliateLink from './affiliate-link';
import * as linkPlacement from './link-placement';
import * as linkTracking from './link-tracking';
import * as fs from 'fs';

const prisma = new PrismaClient();

export type DistributionStatus =
  | 'DRAFT'
  | 'ZERNIO_DRAFT_CREATED'    // Draft created in Zernio, awaiting publish
  | 'ZERNIO_SCHEDULED'        // Scheduled in Zernio for future publishing
  | 'READY'
  | 'QUEUED'
  | 'POSTING'
  | 'POSTED_CONFIRMED'        // Actually published with postUrl
  | 'FAILED'
  | 'CANCELLED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ContentType = 'VIDEO' | 'IMAGE' | 'CAROUSEL';
export type Provider = 'PIPPIT_MANUAL' | 'HIGGSFIELD_AUTO' | 'DALL_E' | 'OPENAI_IMAGE';

export interface CreateDistributionInput {
  brandId: string;
  assetFileId?: string;
  productId?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  hashtags?: string[];
  script?: string;
  voiceoverUrl?: string;
  contentType: ContentType;
  platform: string;
  provider: Provider;
  scheduledAt?: Date;
}

export interface DistributionItem {
  id: string;
  brandId: string;
  brand: { id: string; name: string; slug: string };
  assetFileId: string | null;
  productId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  hashtags: string | null;
  script: string | null;
  voiceoverUrl: string | null;
  contentType: string;
  platform: string;
  socialAccountId: string | null;
  zernioConfigId: string | null;
  status: string;
  provider: string;
  scheduledAt: Date | null;
  postedAt: Date | null;
  postUrl: string | null;
  postId: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  conversionRate: number;
  revenue: number;
  commission: number;
  estimatedCommission: number;
  affiliateLink: string | null;
  trackingLink: string | null;
  linkPlacementType: string | null;
  linkPlacementText: string | null;
  bioLinkRequired: boolean;
  manualActionRequired: boolean;
  manualActionNote: string | null;
  destinationUrl: string | null;
  pinnedCommentText: string | null;
  approvalStatus: string;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

/**
 * Create a distribution item
 */
export async function createDistribution(
  input: CreateDistributionInput
): Promise<{ success: boolean; item?: DistributionItem; error?: string }> {
  try {
    // Validate brand exists
    const brand = await prisma.brand.findFirst({
      where: { OR: [{ id: input.brandId }, { slug: input.brandId }] },
    });

    if (!brand) {
      return { success: false, error: 'Brand not found' };
    }

    // Get brand settings for auto-approve
    const settings = await brandService.getBrandSettings(brand.id);
    const autoApprove = settings?.autoApprove || false;

    // Build hashtags string
    const hashtagsStr = input.hashtags ? input.hashtags.join(',') : null;

    // Determine initial status based on provider
    let status: DistributionStatus = 'DRAFT';
    let approvalStatus: ApprovalStatus = 'PENDING';

    // If PIPPIT_MANUAL and has video, it's ready
    if (input.provider === 'PIPPIT_MANUAL' && input.videoUrl) {
      status = 'READY';
    }
    // If HIGGSFIELD_AUTO, check credits later
    // Auto-approve if enabled
    if (autoApprove) {
      approvalStatus = 'APPROVED';
    }

    const item = await prisma.distributionQueue.create({
      data: {
        brandId: brand.id,
        assetFileId: input.assetFileId,
        productId: input.productId,
        videoUrl: input.videoUrl,
        thumbnailUrl: input.thumbnailUrl,
        caption: input.caption,
        hashtags: hashtagsStr,
        script: input.script,
        voiceoverUrl: input.voiceoverUrl,
        contentType: input.contentType,
        platform: input.platform,
        provider: input.provider,
        scheduledAt: input.scheduledAt,
        status,
        approvalStatus,
        approvedAt: autoApprove ? new Date() : null,
      },
    });

    // Generate affiliate links for this distribution item
    const linkResult = await affiliateLink.generateDistributionLinks(item.id);
    if (linkResult.success) {
      console.log(`[Distribution] Generated tracking links for item ${item.id}`);
    }

    // Get product's affiliate link for tracking
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    const productAffiliateLink = product?.affiliateLink || '';

    // Generate link placement strategy
    // Get affiliate link from: product > brand settings > generated links
    const brandSettings = brand.settings ? JSON.parse(brand.settings) : {};
    const brandAffiliateLink = brand.affiliateLink || brandSettings.defaultAffiliateLink || '';
    const finalAffiliateLink = productAffiliateLink || brandAffiliateLink || linkResult.affiliateLink || '';

    const placement = await linkPlacement.generateLinkPlacement({
      brandId: brand.id,
      platform: input.platform,
      contentType: input.contentType,
      affiliateLink: linkResult.trackingLink || finalAffiliateLink,
      trackingUrl: linkResult.trackingLink,
    });

    // Update item with link placement strategy
    await prisma.distributionQueue.update({
      where: { id: item.id },
      data: {
        linkPlacementType: placement.placementType,
        linkPlacementText: placement.captionCTA,
        bioLinkRequired: placement.bioLinkRequired,
        manualActionRequired: placement.manualAction,
        manualActionNote: placement.manualActionNote,
        destinationUrl: placement.destinationUrl,
        pinnedCommentText: placement.pinnedComment,
      },
    });


// Create affiliate link tracking record
    try {
      const trackingResult = await linkTracking.createTrackingRecord({
        distributionId: item.id,
        productId: input.productId,
        brandId: brand.id,
        originalLink: finalAffiliateLink,
        trackingLink: linkResult.trackingLink,
        shortCode: linkTracking.generateShortCode(),
        platform: input.platform,
        contentType: input.contentType,
        provider: input.provider,
        utmSource: 'social',
        utmMedium: input.platform.toLowerCase(),
        utmCampaign: brand.slug + '_' + input.platform.toLowerCase(),
      });
      if (trackingResult.success) {
        console.log('[Distribution] Created tracking record: ' + trackingResult.tracking?.id);
      }
    } catch (trackingError) {
      console.error('[Distribution] Failed to create tracking record:', trackingError);
    }
    return { success: true, item: await getDistributionItem(item.id) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get distribution item by ID
 */
export async function getDistributionItem(id: string): Promise<DistributionItem | null> {
  const item = await prisma.distributionQueue.findUnique({
    where: { id },
    include: {
      brand: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!item) return null;

  return {
    ...item,
    hashtags: item.hashtags,
  };
}

/**
 * Get distribution items for a brand
 */
export async function getDistributionItems(brandId: string, options?: {
  status?: DistributionStatus;
  approvalStatus?: ApprovalStatus;
  platform?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: DistributionItem[]; total: number }> {
  const brand = await prisma.brand.findFirst({
    where: { OR: [{ id: brandId }, { slug: brandId }] },
  });

  if (!brand) {
    return { items: [], total: 0 };
  }

  const where: any = { brandId: brand.id };
  if (options?.status) where.status = options.status;
  if (options?.approvalStatus) where.approvalStatus = options.approvalStatus;
  if (options?.platform) where.platform = options.platform;

  const [items, total] = await Promise.all([
    prisma.distributionQueue.findMany({
      where,
      include: { brand: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.distributionQueue.count({ where }),
  ]);

  return { items: items as DistributionItem[], total };
}

/**
 * Update distribution item
 */
export async function updateDistribution(
  id: string,
  data: Partial<CreateDistributionInput>
): Promise<{ success: boolean; item?: DistributionItem; error?: string }> {
  try {
    const updateData: any = { ...data };
    delete updateData.brandId; // Can't change brand

    if (data.hashtags) {
      updateData.hashtags = data.hashtags.join(',');
    }

    const item = await prisma.distributionQueue.update({
      where: { id },
      data: updateData,
    });

    return { success: true, item: await getDistributionItem(item.id) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Approve distribution item
 */
export async function approveDistribution(
  id: string,
  approvedBy: string
): Promise<{ success: boolean; item?: DistributionItem; error?: string }> {
  try {
    const item = await prisma.distributionQueue.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedBy,
        status: 'QUEUED',
      },
    });

    return { success: true, item: await getDistributionItem(item.id) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Reject distribution item
 */
export async function rejectDistribution(
  id: string,
  rejectedBy: string,
  reason?: string
): Promise<{ success: boolean; item?: DistributionItem; error?: string }> {
  try {
    const item = await prisma.distributionQueue.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        rejectedAt: new Date(),
        rejectedBy,
        rejectionReason: reason,
        status: 'CANCELLED',
      },
    });

    return { success: true, item: await getDistributionItem(item.id) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Upload video for PIPPIT_MANUAL
 */
export async function uploadVideo(
  id: string,
  videoUrl: string
): Promise<{ success: boolean; item?: DistributionItem; error?: string }> {
  try {
    const item = await prisma.distributionQueue.update({
      where: { id },
      data: {
        videoUrl,
        status: 'READY',
      },
    });

    return { success: true, item: await getDistributionItem(item.id) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Queue distribution for posting
 */
export async function queueForPosting(id: string): Promise<{ success: boolean; item?: DistributionItem; error?: string }> {
  try {
    const item = await getDistributionItem(id);
    if (!item) return { success: false, error: 'Item not found' };

    if (item.approvalStatus !== 'APPROVED') {
      return { success: false, error: 'Item must be approved first' };
    }

    if (!item.videoUrl && item.contentType === 'VIDEO') {
      return { success: false, error: 'Video URL required for video content' };
    }

    const updated = await prisma.distributionQueue.update({
      where: { id },
      data: { status: 'QUEUED' },
    });

    return { success: true, item: await getDistributionItem(updated.id) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute posting via Zernio
 */
export async function executePosting(id: string): Promise<{ success: boolean; item?: DistributionItem; error?: string; warning?: string }> {
  try {
    const item = await getDistributionItem(id);
    if (!item) return { success: false, error: 'Item not found' };

    if (item.status !== 'QUEUED') {
      return { success: false, error: 'Item must be in QUEUED status' };
    }

    // Mark as posting
    await prisma.distributionQueue.update({
      where: { id },
      data: { status: 'POSTING' },
    });

    // Get available account
    const availableAccount = await zernio.getNextAvailableAccount(item.brandId, item.platform);
    if (!availableAccount) {
      await prisma.distributionQueue.update({
        where: { id },
        data: {
          status: 'QUEUED', // Put back in queue
          errorMessage: 'No available accounts for this platform',
        },
      });
      return { success: false, error: 'No available accounts for this platform' };
    }

    // Parse hashtags
    const hashtags = item.hashtags ? item.hashtags.split(',') : [];

    // Post via Zernio with link placement strategy
    const includeTrackingUrl = linkPlacement.supportsDirectLinks(item.platform);
    const zernioCaption = linkPlacement.getZernioCaption(
      item.caption || '',
      {
        placementType: item.linkPlacementType as any || 'NO_LINK',
        captionCTA: item.linkPlacementText || '',
        destinationUrl: item.destinationUrl || '',
        trackingUrl: item.trackingLink || '',
        pinnedComment: item.pinnedCommentText,
        manualAction: item.manualActionRequired,
        manualActionNote: item.manualActionNote,
        bioLinkRequired: item.bioLinkRequired,
        warning: null,
      },
      includeTrackingUrl
    );

    // Map platform to lowercase Zernio format
    const platformMap: Record<string, 'tiktok' | 'instagram' | 'facebook' | 'youtube'> = {
      'TIKTOK': 'tiktok',
      'INSTAGRAM': 'instagram',
      'FACEBOOK': 'facebook',
      'YOUTUBE': 'youtube',
    };
    const zernioPlatform = platformMap[item.platform] || 'tiktok';

    // For CAROUSEL content, aggregate media from asset files
    let mediaItems: any[] = [];
    if (item.contentType === 'CAROUSEL') {
      // Get carousel slide URLs from asset files
      const assetFiles = await prisma.assetFile.findMany({
        where: {
          productId: item.productId,
          fileType: 'IMAGE',
          uploadStatus: 'uploaded',
          cloudUrl: { not: null },
        },
        orderBy: { createdAt: 'asc' },
        take: 10, // Max 10 slides for carousel
      });

      mediaItems = assetFiles.map(file => ({
        type: 'image',
        url: file.cloudUrl,
      }));

      console.log(`[Distribution] Carousel: found ${mediaItems.length} slides`);
    }

    const result = await zernio.postToZernio(availableAccount.zernioConfig.apiKey, {
      accountId: availableAccount.account.accountId,
      platforms: [{
        platform: zernioPlatform,
        accountId: availableAccount.account.accountId,
      }],
      content: {
        videoUrl: item.contentType !== 'CAROUSEL' ? (item.videoUrl || undefined) : undefined,
        thumbnailUrl: item.contentType !== 'CAROUSEL' ? (item.thumbnailUrl || undefined) : undefined,
        caption: zernioCaption,
        hashtags,
        script: item.script || undefined,
        voiceoverUrl: item.voiceoverUrl || undefined,
        mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
      },
    });

    if (result.success) {
      // Check Zernio response status
      // Status values: 'draft', 'scheduled', 'published'
      const zernioStatus = result.status || 'draft';

      console.log(`[Distribution] Zernio response - status: ${zernioStatus}, postUrl: ${result.postUrl || 'none'}, postId: ${result.postId}`);

      if (zernioStatus === 'published' || result.postUrl) {
        // Zernio confirmed actual publication
        await prisma.distributionQueue.update({
          where: { id },
          data: {
            status: 'POSTED_CONFIRMED',
            postedAt: new Date(),
            postUrl: result.postUrl || undefined,
            postId: result.postId,
            socialAccountId: availableAccount.account.id,
            zernioConfigId: availableAccount.zernioConfig.id,
          },
        });

        // Record to account
        await zernio.recordPostToAccount(availableAccount.account.id);
        await zernio.markZernioKeyUsed(availableAccount.zernioConfig.id);

        // Create posting log
        await prisma.postingLog.create({
          data: {
            socialAccountId: availableAccount.account.id,
            distributionId: id,
            platform: item.platform,
            status: 'SUCCESS',
            postUrl: result.postUrl || undefined,
          },
        });

        // Clean up local files after successful posting
        await cleanupLocalFiles(item);

        return { success: true, item: await getDistributionItem(id) };
      } else if (zernioStatus === 'scheduled' || result.postId) {
        // Post was scheduled for future publication
        await prisma.distributionQueue.update({
          where: { id },
          data: {
            status: 'ZERNIO_SCHEDULED',
            postId: result.postId,
            socialAccountId: availableAccount.account.id,
            zernioConfigId: availableAccount.zernioConfig.id,
          },
        });

        await zernio.recordPostToAccount(availableAccount.account.id);
        await zernio.markZernioKeyUsed(availableAccount.zernioConfig.id);

        await prisma.postingLog.create({
          data: {
            socialAccountId: availableAccount.account.id,
            distributionId: id,
            platform: item.platform,
            status: 'SCHEDULED',
          },
        });

        return {
          success: true,
          item: await getDistributionItem(id),
          warning: `Post scheduled in Zernio. Will publish at scheduled time.`,
        };
      } else {
        // Zernio only created draft - no auto-publish or schedule
        await prisma.distributionQueue.update({
          where: { id },
          data: {
            status: 'ZERNIO_DRAFT_CREATED',
            postId: result.postId,
            socialAccountId: availableAccount.account.id,
            zernioConfigId: availableAccount.zernioConfig.id,
          },
        });

        console.log(`[Distribution] Draft created in Zernio (${result.postId}). Manual publish required.`);

        return {
          success: true,
          item: await getDistributionItem(id),
          warning: 'Draft created in Zernio. Please publish/schedule manually.',
        };
      }
    } else {
      // Mark as failed
      await prisma.distributionQueue.update({
        where: { id },
        data: {
          status: 'FAILED',
          errorMessage: result.error,
          retryCount: { increment: 1 },
        },
      });

      // Create posting log
      await prisma.postingLog.create({
        data: {
          socialAccountId: availableAccount.account.id,
          distributionId: id,
          platform: item.platform,
          status: 'FAILED',
          errorMessage: result.error,
        },
      });

      return { success: false, error: result.error };
    }
  } catch (error: any) {
    // Mark as failed
    await prisma.distributionQueue.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
      },
    });

    return { success: false, error: error.message };
  }
}

/**
 * Schedule a Zernio draft for future publishing
 * Creates a new scheduled post in Zernio based on the draft
 */
export async function scheduleDraft(
  id: string,
  scheduledFor: Date
): Promise<{ success: boolean; item?: DistributionItem; error?: string; scheduledPostId?: string }> {
  try {
    const item = await getDistributionItem(id);
    if (!item) return { success: false, error: 'Item not found' };

    if (!item.postId) {
      return { success: false, error: 'No Zernio draft exists for this item' };
    }

    if (!item.videoUrl && item.contentType === 'VIDEO') {
      return { success: false, error: 'Video URL required for video content' };
    }

    // Get Zernio config
    const zernioConfig = await zernio.getAvailableZernioKey(item.brandId);
    if (!zernioConfig) {
      return { success: false, error: 'No Zernio API key available' };
    }

    // Parse hashtags
    const hashtags = item.hashtags ? item.hashtags.split(',').map(h => h.trim()) : [];

    // Parse media items
    const mediaItems: any[] = [];
    if (item.videoUrl) {
      mediaItems.push({ type: 'video', url: item.videoUrl });
    } else if (item.thumbnailUrl) {
      mediaItems.push({ type: 'image', url: item.thumbnailUrl });
    }

    // Get caption with link placement
    const linkPlacementResult = linkPlacement.getZernioCaption(
      item.caption || '',
      {
        placementType: item.linkPlacementType as any || 'NO_LINK',
        captionCTA: item.linkPlacementText || '',
        destinationUrl: item.destinationUrl || '',
        trackingUrl: item.trackingLink || '',
        pinnedComment: item.pinnedCommentText,
        manualAction: item.manualActionRequired,
        manualActionNote: item.manualActionNote,
        bioLinkRequired: item.bioLinkRequired,
        warning: null,
      },
      linkPlacement.supportsDirectLinks(item.platform)
    );

    // Schedule the post in Zernio
    const result = await zernio.scheduleExistingPost(
      zernioConfig.apiKey,
      item.postId,
      item.platform,
      item.socialAccountId || '',
      scheduledFor,
      linkPlacementResult.caption,
      hashtags,
      mediaItems
    );

    if (result.success && result.postId) {
      // Update local status
      await prisma.distributionQueue.update({
        where: { id },
        data: {
          status: 'ZERNIO_SCHEDULED',
          scheduledAt: scheduledFor,
          postId: result.postId, // New scheduled post ID
        },
      });

      // Log the scheduling
      await prisma.postingLog.create({
        data: {
          socialAccountId: item.socialAccountId || '',
          distributionId: id,
          platform: item.platform,
          status: 'SCHEDULED',
        },
      });

      console.log(`[Distribution] Post scheduled for ${scheduledFor.toISOString()}`);

      return {
        success: true,
        item: await getDistributionItem(id),
        scheduledPostId: result.postId,
      };
    }

    return { success: false, error: result.error || 'Failed to schedule post' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process all queued items
 */
export async function processQueue(brandId: string): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  const items = await prisma.distributionQueue.findMany({
    where: {
      brandId,
      status: 'QUEUED',
      approvalStatus: 'APPROVED',
    },
    orderBy: { scheduledAt: 'asc' },
    take: 20,
  });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items) {
    // Check if scheduled for future
    if (item.scheduledAt && item.scheduledAt > new Date()) {
      skipped++;
      continue;
    }

    const result = await executePosting(item.id);
    if (result.success) succeeded++;
    else failed++;
  }

  return { processed: items.length, succeeded, failed, skipped };
}

/**
 * Get pending approvals count
 */
export async function getPendingApprovals(brandId: string): Promise<number> {
  const brand = await prisma.brand.findFirst({
    where: { OR: [{ id: brandId }, { slug: brandId }] },
  });

  if (!brand) return 0;

  return prisma.distributionQueue.count({
    where: {
      brandId: brand.id,
      approvalStatus: 'PENDING',
    },
  });
}

/**
 * Get distribution stats
 */
export async function getDistributionStats(brandId: string): Promise<{
  total: number;
  draft: number;
  queued: number;
  posting: number;
  posted: number;
  failed: number;
  pendingApproval: number;
}> {
  const brand = await prisma.brand.findFirst({
    where: { OR: [{ id: brandId }, { slug: brandId }] },
  });

  if (!brand) {
    return { total: 0, draft: 0, queued: 0, posting: 0, posted: 0, failed: 0, pendingApproval: 0 };
  }

  const [total, draft, queued, posting, posted, failed, pendingApproval] = await Promise.all([
    prisma.distributionQueue.count({ where: { brandId: brand.id } }),
    prisma.distributionQueue.count({ where: { brandId: brand.id, status: 'DRAFT' } }),
    prisma.distributionQueue.count({ where: { brandId: brand.id, status: 'QUEUED' } }),
    prisma.distributionQueue.count({ where: { brandId: brand.id, status: 'POSTING' } }),
    prisma.distributionQueue.count({ where: { brandId: brand.id, status: 'POSTED' } }),
    prisma.distributionQueue.count({ where: { brandId: brand.id, status: 'FAILED' } }),
    prisma.distributionQueue.count({ where: { brandId: brand.id, approvalStatus: 'PENDING' } }),
  ]);

  return { total, draft, queued, posting, posted, failed, pendingApproval };
}

/**
 * Cancel distribution item
 */
export async function cancelDistribution(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.distributionQueue.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Retry failed distribution
 */
export async function retryDistribution(id: string): Promise<{ success: boolean; item?: DistributionItem; error?: string }> {
  try {
    const item = await prisma.distributionQueue.findUnique({ where: { id } });
    if (!item) return { success: false, error: 'Item not found' };

    if (item.status !== 'FAILED') {
      return { success: false, error: 'Only failed items can be retried' };
    }

    if (item.retryCount >= 3) {
      return { success: false, error: 'Max retries exceeded' };
    }

    const updated = await prisma.distributionQueue.update({
      where: { id },
      data: {
        status: 'QUEUED',
        errorMessage: null,
      },
    });

    return { success: true, item: await getDistributionItem(updated.id) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Clean up local files after successful posting
 * Only deletes local cache files - NEVER deletes cloud files
 */
async function cleanupLocalFiles(item: DistributionItem): Promise<void> {
  const filesToDelete: string[] = [];

  // Collect local file paths from URLs
  if (item.videoUrl?.startsWith('file://')) {
    filesToDelete.push(item.videoUrl.replace('file://', ''));
  }
  if (item.thumbnailUrl?.startsWith('file://')) {
    filesToDelete.push(item.thumbnailUrl.replace('file://', ''));
  }
  if (item.voiceoverUrl?.startsWith('file://')) {
    filesToDelete.push(item.voiceoverUrl.replace('file://', ''));
  }

  // Check asset file for local cache
  if (item.assetFileId) {
    const asset = await prisma.assetFile.findUnique({ where: { id: item.assetFileId } });
    if (asset) {
      // Add local path to delete list
      if (asset.localPath && fs.existsSync(asset.localPath)) {
        filesToDelete.push(asset.localPath);
      }

      // Clear local cache reference in database (keep cloud info)
      await prisma.assetFile.update({
        where: { id: asset.id },
        data: {
          localPath: null,
          localCachedAt: null,
        },
      });
      console.log(`[Distribution] Cleared local cache for asset: ${asset.fileName}`);
    }
  }

  // Delete each local file (never delete cloud files)
  let deletedCount = 0;
  for (const filePath of filesToDelete) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`[Storage] Deleted local file: ${filePath}`);
      }
    } catch (error: any) {
      console.error(`[Storage] Failed to delete ${filePath}:`, error.message);
    }
  }

  if (deletedCount > 0) {
    console.log(`[Distribution] Cleaned up ${deletedCount} local file(s) after posting`);
  }
}

/**
 * Force cleanup of all temp files (local cache only)
 */
export async function forceCleanupTempFiles(): Promise<{ deleted: number; errors: string[] }> {
  return cloudStorage.cleanupLocalCache();
}
