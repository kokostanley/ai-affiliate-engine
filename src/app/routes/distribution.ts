// ============================================
// DISTRIBUTION QUEUE API ROUTES
// Content distribution workflow
// ============================================

import { Router } from 'express';
import {
  createDistribution,
  getDistributionItem,
  getDistributionItems,
  updateDistribution,
  approveDistribution,
  rejectDistribution,
  uploadVideo,
  queueForPosting,
  executePosting,
  processQueue,
  getPendingApprovals,
  getDistributionStats,
  cancelDistribution,
  retryDistribution,
} from '../../services/distribution';

const router = Router();

// ============================================
// GET /api/distribution
// List distribution items
// ============================================

router.get('/', async (req, res) => {
  try {
    const { brandId, status, approvalStatus, platform, limit, offset } = req.query;

    if (!brandId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'brandId is required' }
      });
    }

    const result = await getDistributionItems(brandId as string, {
      status: status as any,
      approvalStatus: approvalStatus as any,
      platform: platform as string,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({
      success: true,
      data: {
        items: result.items,
        total: result.total,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/distribution/stats
// Get distribution stats for a brand
// ============================================

router.get('/stats', async (req, res) => {
  try {
    const { brandId } = req.query;

    if (!brandId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'brandId is required' }
      });
    }

    const stats = await getDistributionStats(brandId as string);

    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/distribution/pending
// Get pending approvals count
// ============================================

router.get('/pending/:brandId', async (req, res) => {
  try {
    const count = await getPendingApprovals(req.params.brandId);
    res.json({ success: true, data: { count } });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/distribution/:id
// Get single distribution item
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const item = await getDistributionItem(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Distribution item not found' }
      });
    }

    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution
// Create new distribution item
// ============================================

router.post('/', async (req, res) => {
  try {
    const {
      brandId,
      assetFileId,
      productId,
      videoUrl,
      thumbnailUrl,
      caption,
      hashtags,
      script,
      voiceoverUrl,
      contentType,
      platform,
      provider,
      scheduledAt,
    } = req.body;

    if (!brandId || !contentType || !platform || !provider) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'brandId, contentType, platform, and provider are required' }
      });
    }

    const result = await createDistribution({
      brandId,
      assetFileId,
      productId,
      videoUrl,
      thumbnailUrl,
      caption,
      hashtags,
      script,
      voiceoverUrl,
      contentType,
      platform,
      provider,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'CREATE_ERROR', message: result.error }
      });
    }

    res.status(201).json({
      success: true,
      data: result.item,
      message: 'Distribution item created'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// PATCH /api/distribution/:id
// Update distribution item
// ============================================

router.patch('/:id', async (req, res) => {
  try {
    const result = await updateDistribution(req.params.id, req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPDATE_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.item,
      message: 'Distribution item updated'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/:id/approve
// Approve distribution item
// ============================================

router.post('/:id/approve', async (req, res) => {
  try {
    const { approvedBy } = req.body;

    const result = await approveDistribution(req.params.id, approvedBy || 'system');

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'APPROVE_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.item,
      message: 'Distribution item approved'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/:id/reject
// Reject distribution item
// ============================================

router.post('/:id/reject', async (req, res) => {
  try {
    const { rejectedBy, reason } = req.body;

    const result = await rejectDistribution(req.params.id, rejectedBy || 'system', reason);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'REJECT_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.item,
      message: 'Distribution item rejected'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/:id/upload
// Upload video for PIPPIT_MANUAL
// ============================================

router.post('/:id/upload', async (req, res) => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'videoUrl is required' }
      });
    }

    const result = await uploadVideo(req.params.id, videoUrl);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.item,
      message: 'Video uploaded'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/:id/queue
// Queue for posting
// ============================================

router.post('/:id/queue', async (req, res) => {
  try {
    const result = await queueForPosting(req.params.id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'QUEUE_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.item,
      message: 'Distribution item queued'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/:id/post
// Execute posting via Zernio
// ============================================

router.post('/:id/post', async (req, res) => {
  try {
    const result = await executePosting(req.params.id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'POST_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.item,
      message: 'Posted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/:id/cancel
// Cancel distribution
// ============================================

router.post('/:id/cancel', async (req, res) => {
  try {
    const result = await cancelDistribution(req.params.id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANCEL_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      message: 'Distribution cancelled'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/:id/retry
// Retry failed distribution
// ============================================

router.post('/:id/retry', async (req, res) => {
  try {
    const result = await retryDistribution(req.params.id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'RETRY_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.item,
      message: 'Distribution queued for retry'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/process/:brandId
// Process queue for a brand
// ============================================

router.post('/process/:brandId', async (req, res) => {
  try {
    const result = await processQueue(req.params.brandId);

    res.json({
      success: true,
      data: result,
      message: `Processed ${result.processed} items: ${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/link-placement/preview
// Preview link placement for a platform
// ============================================

router.post('/link-placement/preview', async (req, res) => {
  try {
    const { brandId, platform, contentType, affiliateLink } = req.body;

    if (!brandId || !platform || !contentType) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'brandId, platform, and contentType are required' }
      });
    }

    // Import link placement service
    const linkPlacement = await import('../../services/link-placement');

    const placement = await linkPlacement.generateLinkPlacement({
      brandId,
      platform,
      contentType,
      affiliateLink: affiliateLink || '',
      trackingUrl: affiliateLink,
    });

    res.json({
      success: true,
      data: {
        placementType: placement.placementType,
        captionCTA: placement.captionCTA,
        destinationUrl: placement.destinationUrl,
        trackingUrl: placement.trackingUrl,
        pinnedComment: placement.pinnedComment,
        manualAction: placement.manualAction,
        manualActionNote: placement.manualActionNote,
        bioLinkRequired: placement.bioLinkRequired,
        warning: placement.warning,
        platformDescription: linkPlacement.getPlatformDescription(platform, contentType),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/distribution/link-placement/platforms
// Get supported platforms for link placement
// ============================================

router.get('/link-placement/platforms', async (req, res) => {
  try {
    const linkPlacement = await import('../../services/link-placement');

    const platforms = [
      {
        platform: 'INSTAGRAM',
        contentTypes: ['VIDEO', 'IMAGE', 'STORY'],
        placementType: 'BIO_LINK',
        description: 'Use bio link. CTA: "Link ada di bio"',
        supportsDirectLink: false,
        requiresManualAction: false,
      },
      {
        platform: 'TIKTOK',
        contentTypes: ['VIDEO'],
        placementType: 'BIO_PLUS_CTA',
        description: 'Route to bio/Telegram/WA. No direct link in caption.',
        supportsDirectLink: false,
        requiresManualAction: false,
      },
      {
        platform: 'FACEBOOK',
        contentTypes: ['VIDEO', 'IMAGE'],
        placementType: 'COMMENT',
        description: 'Add trackable link in caption.',
        supportsDirectLink: true,
        requiresManualAction: false,
      },
      {
        platform: 'YOUTUBE',
        contentTypes: ['VIDEO'],
        placementType: 'PINNED_COMMENT',
        description: 'Link in description + pinned comment (manual).',
        supportsDirectLink: false,
        requiresManualAction: true,
      },
      {
        platform: 'TELEGRAM',
        contentTypes: ['VIDEO', 'IMAGE'],
        placementType: 'DIRECT',
        description: 'Direct clickable link in message.',
        supportsDirectLink: true,
        requiresManualAction: false,
      },
      {
        platform: 'WHATSAPP',
        contentTypes: ['VIDEO', 'IMAGE'],
        placementType: 'DIRECT',
        description: 'Direct clickable link in message.',
        supportsDirectLink: true,
        requiresManualAction: false,
      },
      {
        platform: 'PINTEREST',
        contentTypes: ['IMAGE'],
        placementType: 'BIO_LINK',
        description: 'Destination URL or bio link.',
        supportsDirectLink: false,
        requiresManualAction: false,
      },
      {
        platform: 'X',
        contentTypes: ['VIDEO', 'IMAGE'],
        placementType: 'NO_LINK',
        description: 'EXCLUDED - Paid in Zernio.',
        supportsDirectLink: false,
        requiresManualAction: false,
        excluded: true,
      },
    ];

    res.json({
      success: true,
      data: {
        platforms,
        excludedPlatforms: linkPlacement.getExcludedPlatforms(),
        directLinkPlatforms: linkPlacement.getDirectLinkPlatforms(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/link-placement/validate
// Validate link placement configuration
// ============================================

router.post('/link-placement/validate', async (req, res) => {
  try {
    const { platform, contentType, trackingUrl } = req.body;

    if (!platform || !contentType) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'platform and contentType are required' }
      });
    }

    const linkPlacement = await import('../../services/link-placement');
    const result = linkPlacement.validateLinkPlacement(platform, contentType, trackingUrl);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/distribution/link-placement/telegram-preview/:id
// Get Telegram preview for a distribution item
// ============================================

router.get('/link-placement/telegram-preview/:id', async (req, res) => {
  try {
    const item = await getDistributionItem(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Distribution item not found' }
      });
    }

    const linkPlacement = await import('../../services/link-placement');

    const placement = {
      placementType: item.linkPlacementType || 'NO_LINK',
      captionCTA: item.linkPlacementText || '',
      destinationUrl: item.destinationUrl || '',
      trackingUrl: item.trackingLink || '',
      pinnedComment: item.pinnedCommentText,
      manualAction: item.manualActionRequired,
      manualActionNote: item.manualActionNote,
      bioLinkRequired: item.bioLinkRequired,
      warning: null,
    };

    const telegramPreview = linkPlacement.getTelegramPreview(item.caption || '', placement);

    res.json({
      success: true,
      data: {
        distributionId: item.id,
        platform: item.platform,
        contentType: item.contentType,
        placement,
        telegramPreview,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/distribution/link-placement/generate
// Generate link placement for an existing distribution item
// ============================================

router.post('/link-placement/generate', async (req, res) => {
  try {
    const { distributionId, affiliateLink } = req.body;

    if (!distributionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'distributionId is required' }
      });
    }

    const item = await getDistributionItem(distributionId);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Distribution item not found' }
      });
    }

    const linkPlacement = await import('../../services/link-placement');

    const placement = await linkPlacement.generateLinkPlacement({
      brandId: item.brandId,
      platform: item.platform,
      contentType: item.contentType,
      affiliateLink: affiliateLink || item.affiliateLink || '',
      trackingUrl: item.trackingLink || affiliateLink,
    });

    // Update distribution item with new placement
    await updateDistribution(distributionId, {
      caption: item.caption,
      hashtags: item.hashtags?.split(','),
    } as any);

    // Update link placement fields directly
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    await prisma.distributionQueue.update({
      where: { id: distributionId },
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

    res.json({
      success: true,
      data: {
        distributionId,
        placement,
      },
      message: 'Link placement generated successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

export default router;
