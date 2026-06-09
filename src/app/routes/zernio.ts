// ============================================
// ZERNIO API TEST ROUTES
// For validation and testing
// ============================================

import { Router } from 'express';
import { getZernioAccounts, testZernioConnection, postToZernio, getZernioKeyFromEnv } from '../../services/zernio';

const router = Router();

// ============================================
// GET /api/zernio/test
// Test Zernio API connection
// ============================================

router.get('/test', async (req, res) => {
  try {
    const { brandSlug, apiKey } = req.query;

    // Try to get API key from brand or use provided key
    let key = apiKey as string;
    if (!key && brandSlug) {
      key = getZernioKeyFromEnv(brandSlug as string);
    }

    if (!key) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No API key available. Set ZERNIO_CEPAT_KEY_1 or provide apiKey query param.' }
      });
    }

    const result = await testZernioConnection(key);

    res.json({
      success: result.success,
      data: {
        connected: result.success,
        message: result.message,
        accounts: result.accounts || [],
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
// GET /api/zernio/accounts
// Get accounts for a brand
// ============================================

router.get('/accounts', async (req, res) => {
  try {
    const { brandId } = req.query;

    if (!brandId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'brandId is required' }
      });
    }

    const accounts = await getZernioAccounts(brandId as string);

    res.json({
      success: true,
      data: {
        accounts,
        count: accounts.length,
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
// POST /api/zernio/test-post
// Test posting to Zernio (dry run mode)
// ============================================

router.post('/test-post', async (req, res) => {
  try {
    const { apiKey, accountId, caption, hashtags } = req.body;

    if (!apiKey || !accountId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'apiKey and accountId are required' }
      });
    }

    console.log('[Zernio Test] Posting test message...');

    const result = await postToZernio(apiKey, {
      accountId,
      content: {
        caption: caption || '🧪 Test post from AI Affiliate Engine validation',
        hashtags: hashtags || ['#test', '#validation'],
      },
    });

    res.json({
      success: result.success,
      data: {
        postId: result.postId || 'TEST_POST_ID',
        postUrl: result.postUrl || null,
        response: result,
      },
      message: result.success ? 'Post created' : result.error,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/zernio/draft-post
// Create a draft post via Zernio
// ============================================

router.post('/draft-post', async (req, res) => {
  try {
    const { brandId, accountId, caption, hashtags, scheduleAt } = req.body;

    if (!brandId || !accountId || !caption) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'brandId, accountId, and caption are required' }
      });
    }

    // Get API key from brand
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Brand not found' }
      });
    }

    const apiKey = getZernioKeyFromEnv(brand.slug);
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_API_KEY', message: 'No Zernio API key configured for this brand' }
      });
    }

    // Prepare post payload
    const payload: any = {
      accountId,
      content: {
        caption,
        hashtags: hashtags || [],
      },
    };

    // Add schedule if provided (create as draft)
    if (scheduleAt) {
      payload.schedule = {
        publishAt: scheduleAt,
      };
    }

    console.log('[Zernio Draft] Creating draft post...');
    console.log('Account:', accountId);
    console.log('Caption:', caption.substring(0, 100) + '...');

    const result = await postToZernio(apiKey, payload);

    // Also update distribution item if provided
    const { distributionId } = req.body;
    if (distributionId && result.success) {
      await prisma.distributionQueue.update({
        where: { id: distributionId },
        data: {
          status: result.postId ? 'QUEUED' : 'POSTED',
          postId: result.postId,
          postUrl: result.postUrl,
          postedAt: result.success && !scheduleAt ? new Date() : null,
        },
      });
    }

    res.json({
      success: result.success,
      data: {
        postId: result.postId || 'DRAFT_' + Date.now(),
        postUrl: result.postUrl || null,
        zernioPayload: payload,
        zernioResponse: result,
        status: scheduleAt ? 'DRAFT' : 'POSTED',
      },
      message: result.success ? 'Draft created' : result.error,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

export default router;