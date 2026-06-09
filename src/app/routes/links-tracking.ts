// ============================================
// API ROUTES - LINK TRACKING
// ============================================

import { Router } from 'express';
import * as linkTracking from '../../services/link-tracking';

const router = Router();

// ============================================
// GET /api/links/tracking
// List all tracked links with filters
// ============================================
router.get('/', async (req, res) => {
  console.log('[LinkTracking API] Request received for /api/links/tracking');

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const brandId = req.query.brandId as string;
    const platform = req.query.platform as string;
    const status = req.query.status as string;
    const stage = req.query.stage as linkTracking.PipelineStage;

    console.log('[LinkTracking API] Calling getAllLinks with:', { brandId, platform, status, stage, limit, skip });

    const result = await linkTracking.getAllLinks({
      brandId,
      platform,
      status,
      stage,
      limit,
      offset: skip,
    });

    console.log('[LinkTracking API] getAllLinks returned:', result.total, 'links');

    res.json({
      success: true,
      data: result.links,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error: any) {
    console.error('[LinkTracking API] Error listing links:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to fetch tracking links' },
    });
  }
});

// ============================================
// GET /api/links/tracking/stats
// Get aggregate stats
// ============================================
router.get('/stats', async (req, res) => {
  try {
    const brandId = req.query.brandId as string;
    const stats = await linkTracking.getAggregateStats(brandId);

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[LinkTracking API] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stats' },
    });
  }
});

// ============================================
// GET /api/links/tracking/:id
// Get detailed tracking info
// ============================================
router.get('/:id', async (req, res) => {
  try {
    // Try to find by tracking ID first
    let tracking = await linkTracking.getTrackingRecord(req.params.id);

    // If not found, try by shortCode or distributionId
    if (!tracking) {
      tracking = await linkTracking.getTrackingByShortCode(req.params.id);
    }

    if (!tracking) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tracking record not found' },
      });
    }

    res.json({ success: true, data: tracking });
  } catch (error) {
    console.error('[LinkTracking API] Error getting tracking:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch tracking record' },
    });
  }
});

// ============================================
// POST /api/links/tracking
// Create new tracking record (internal use)
// ============================================
router.post('/', async (req, res) => {
  try {
    const {
      productId,
      contentId,
      distributionId,
      brandId,
      originalLink,
      trackingLink,
      shortCode,
      utmSource,
      utmMedium,
      utmCampaign,
      platform,
      contentType,
      provider,
    } = req.body;

    if (!originalLink) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'originalLink is required' },
      });
    }

    const result = await linkTracking.createTrackingRecord({
      productId,
      contentId,
      distributionId,
      brandId,
      originalLink,
      trackingLink,
      shortCode,
      utmSource,
      utmMedium,
      utmCampaign,
      platform,
      contentType,
      provider,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error },
      });
    }

    res.status(201).json({ success: true, data: result.tracking });
  } catch (error) {
    console.error('[LinkTracking API] Error creating tracking:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create tracking record' },
    });
  }
});

// ============================================
// PATCH /api/links/tracking/:id
// Update tracking status
// ============================================
router.patch('/:id', async (req, res) => {
  try {
    const { action } = req.body;

    let result: { success: boolean; tracking?: linkTracking.TrackedLink; error?: string };

    switch (action) {
      case 'pause':
        result = await linkTracking.pauseLink(req.params.id);
        break;
      case 'activate':
        result = await linkTracking.activateLink(req.params.id);
        break;
      case 'expire':
        result = await linkTracking.expireLink(req.params.id);
        break;
      case 'stage':
        const { stage, note } = req.body;
        result = await linkTracking.updatePipelineStage(req.params.id, stage, note);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid action. Use: pause, activate, expire, or stage' },
        });
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error },
      });
    }

    res.json({ success: true, data: result.tracking });
  } catch (error) {
    console.error('[LinkTracking API] Error updating tracking:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update tracking record' },
    });
  }
});

// ============================================
// POST /api/links/tracking/:id/events
// Record an event (click, lead, sale)
// ============================================
router.post('/:id/events', async (req, res) => {
  try {
    const { eventType, revenue, commission, ipAddress, userAgent, referer, country, device, metadata } = req.body;

    if (!eventType || !['CLICK', 'LEAD', 'SALE', 'STAGE_CHANGE', 'STATUS_CHANGE'].includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'eventType is required and must be: CLICK, LEAD, SALE, STAGE_CHANGE, or STATUS_CHANGE' },
      });
    }

    const result = await linkTracking.recordEvent({
      trackingId: req.params.id,
      eventType: eventType as linkTracking.EventType,
      revenue,
      commission,
      ipAddress,
      userAgent,
      referer,
      country,
      device,
      metadata,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: result.error },
      });
    }

    res.status(201).json({ success: true, data: result.event });
  } catch (error) {
    console.error('[LinkTracking API] Error recording event:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to record event' },
    });
  }
});

// ============================================
// GET /api/links/tracking/:id/stats
// Get stats for a specific tracking record
// ============================================
router.get('/:id/stats', async (req, res) => {
  try {
    const result = await linkTracking.getLinkStats(req.params.id);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: result.error },
      });
    }

    res.json({ success: true, data: result.stats });
  } catch (error) {
    console.error('[LinkTracking API] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stats' },
    });
  }
});

export default router;
