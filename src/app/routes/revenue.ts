// ============================================
// REVENUE API ROUTES
// Revenue tracking and analytics
// ============================================

import { Router } from 'express';
import {
  recordClick,
  recordSale,
  getBrandRevenueStats,
  getDistributionRevenue,
  getAllBrandsRevenue,
  updateEstimatedCommissions,
 recordRevenueEvent,
} from '../../services/revenue';

const router = Router();

// ============================================
// GET /api/revenue
// Get revenue stats for all brands
// ============================================

router.get('/', async (req, res) => {
  try {
    const { period } = req.query;
    const stats = await getAllBrandsRevenue((period as any) || 'MONTH');

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/revenue/brand/:brandId
// Get revenue stats for a specific brand
// ============================================

router.get('/brand/:brandId', async (req, res) => {
  try {
    const { period } = req.query;
    const stats = await getBrandRevenueStats(req.params.brandId, (period as any) || 'MONTH');

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/revenue/distribution/:id
// Get revenue stats for a distribution
// ============================================

router.get('/distribution/:id', async (req, res) => {
  try {
    const stats = await getDistributionRevenue(req.params.id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/revenue/click
// Record a click event
// ============================================

router.post('/click', async (req, res) => {
  try {
    const { distributionId, brandId, ipAddress, userAgent, referer, utmSource, utmMedium, utmCampaign } = req.body;

    if (!distributionId || !brandId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'distributionId and brandId are required' }
      });
    }

    const result = await recordClick(distributionId, brandId, {
      ipAddress,
      userAgent,
      referer,
      utmSource,
      utmMedium,
      utmCampaign,
    });

    res.json({
      success: result.success,
      data: {
        isUnique: result.isUnique,
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
// POST /api/revenue/sale
// Record a sale/conversion event
// ============================================

router.post('/sale', async (req, res) => {
  try {
    const { distributionId, brandId, productId, revenue, commissionRate } = req.body;

    if (!distributionId || !brandId || !productId || !revenue) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'distributionId, brandId, productId, and revenue are required' }
      });
    }

    const result = await recordSale(distributionId, brandId, productId, revenue, commissionRate);

    res.json({
      success: result.success,
      data: {
        commission: result.commission,
      },
      message: 'Sale recorded successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/revenue/event
// Record a generic revenue event
// ============================================

router.post('/event', async (req, res) => {
  try {
    const { distributionId, brandId, productId, eventType, revenue, commission, quantity, platform, socialAccountId } = req.body;

    if (!distributionId || !brandId || !eventType) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'distributionId, brandId, and eventType are required' }
      });
    }

    const validTypes = ['CLICK', 'LEAD', 'SALE', 'COMMISSION_PAID'];
    if (!validTypes.includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `eventType must be one of: ${validTypes.join(', ')}` }
      });
    }

    const result = await recordRevenueEvent({
      distributionId,
      brandId,
      productId,
      eventType,
      revenue,
      commission,
      quantity,
      platform,
      socialAccountId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'RECORD_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: { eventId: result.eventId },
      message: 'Event recorded'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/revenue/update-estimates
// Update estimated commissions for all distributions
// ============================================

router.post('/update-estimates', async (req, res) => {
  try {
    const result = await updateEstimatedCommissions();

    res.json({
      success: true,
      data: result,
      message: `Updated ${result.updated} distributions`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/revenue/summary
// Get total revenue summary
// ============================================

router.get('/summary', async (req, res) => {
  try {
    const brands = await getAllBrandsRevenue('MONTH');

    const summary = {
      totalPosts: 0,
      totalClicks: 0,
      totalLeads: 0,
      totalSales: 0,
      totalRevenue: 0,
      totalCommission: 0,
      totalEstimatedCommission: 0,
      brands: brands.map(b => ({
        brandId: b.brandId,
        brandName: b.brandName,
        posts: b.postsCount,
        clicks: b.clicks,
        sales: b.sales,
        revenue: b.revenue,
        commission: b.commission,
 })),
    };

    for (const brand of brands) {
      summary.totalPosts += brand.postsCount;
      summary.totalClicks += brand.clicks;
      summary.totalLeads += brand.leads;
      summary.totalSales += brand.sales;
      summary.totalRevenue += brand.revenue;
      summary.totalCommission += brand.commission;
      summary.totalEstimatedCommission += brand.estimatedCommission;
    }

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

export default router;
