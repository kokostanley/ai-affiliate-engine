// ============================================
// BRAND MANAGEMENT API ROUTES
// Brand/project and social account management
// ============================================

import { Router } from 'express';
import {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrandSettings,
  addZernioConfig,
  addSocialAccount,
  updateSocialAccount,
  getBrandStats,
  getAccountsByPlatform,
} from '../../services/brand';
import { testZernioConnection } from '../../services/zernio';

const router = Router();

// ============================================
// GET /api/brands
// List all brands
// ============================================

router.get('/', async (req, res) => {
  try {
    const brands = await getAllBrands();
    res.json({ success: true, data: brands });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/brands/:id
// Get brand by ID or slug
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const brand = await getBrandById(req.params.id);
    if (!brand) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Brand not found' }
      });
    }
    res.json({ success: true, data: brand });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/brands/:id/stats
// Get brand stats
// ============================================

router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await getBrandStats(req.params.id);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/brands
// Create new brand
// ============================================

router.post('/', async (req, res) => {
  try {
    const { name, description, logo, settings } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name is required' }
      });
    }

    const result = await createBrand({ name, description, logo, settings });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'CREATE_ERROR', message: result.error }
      });
    }

    res.status(201).json({
      success: true,
      data: result.brand,
      message: 'Brand created successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// PATCH /api/brands/:id/settings
// Update brand settings
// ============================================

router.patch('/:id/settings', async (req, res) => {
  try {
    const result = await updateBrandSettings(req.params.id, req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPDATE_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.brand,
      message: 'Brand settings updated'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/brands/:id/zernio
// Add Zernio API key
// ============================================

router.post('/:id/zernio', async (req, res) => {
  try {
    const { name, apiKey, accountLimit } = req.body;

    if (!name || !apiKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and API key are required' }
      });
    }

    const result = await addZernioConfig(req.params.id, name, apiKey, accountLimit);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'CREATE_ERROR', message: result.error }
      });
    }

    res.status(201).json({
      success: true,
      data: result.config,
      message: 'Zernio configuration added'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/brands/:id/accounts
// Add social account
// ============================================

router.post('/:id/accounts', async (req, res) => {
  try {
    const { platform, accountId, accountName, accountUsername, avatarUrl, followers, zernioConfigId } = req.body;

    if (!platform || !accountId || !accountName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Platform, accountId, and accountName are required' }
      });
    }

    const result = await addSocialAccount(req.params.id, {
      platform,
      accountId,
      accountName,
      accountUsername,
      avatarUrl,
      followers,
      zernioConfigId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'CREATE_ERROR', message: result.error }
      });
    }

    res.status(201).json({
      success: true,
      data: result.account,
      message: 'Social account added'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// PATCH /api/brands/:id/accounts/:accountId
// Update social account
// ============================================

router.patch('/:brandId/accounts/:accountId', async (req, res) => {
  try {
    const { status, dailyLimit, cooldownMinutes, priority, zernioConfigId } = req.body;

    const result = await updateSocialAccount(req.params.accountId, {
      status,
      dailyLimit,
      cooldownMinutes,
      priority,
      zernioConfigId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPDATE_ERROR', message: result.error }
      });
    }

    res.json({
      success: true,
      data: result.account,
      message: 'Social account updated'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/brands/:id/accounts/platform/:platform
// Get accounts by platform
// ============================================

router.get('/:id/accounts/platform/:platform', async (req, res) => {
  try {
    const accounts = await getAccountsByPlatform(req.params.id, req.params.platform.toUpperCase());
    res.json({ success: true, data: accounts });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/brands/:id/zernio/test
// Test Zernio API connection
// ============================================

router.post('/:id/zernio/test', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'API key is required' }
      });
    }

    const result = await testZernioConnection(apiKey);

    res.json({
      success: result.success,
      data: result,
      message: result.message
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

export default router;
