// ============================================
// Webhooks API Routes
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/webhooks/n8n
 * Receive webhooks from n8n workflows
 */
router.post('/n8n', async (req, res) => {
  try {
    const { event, data } = req.body;

    // Log the webhook
    const webhook = await prisma.webhookLog.create({
      data: {
        source: 'n8n',
        eventType: event || 'unknown',
        payload: JSON.stringify(data || req.body),
        processed: false,
      },
    });

    // Handle specific events
    if (event === 'content_approved') {
      console.log('[Webhook] Content approved:', data);
    } else if (event === 'post_published') {
      console.log('[Webhook] Post published:', data);
    } else if (event === 'link_clicked') {
      console.log('[Webhook] Link clicked:', data);
    }

    // Mark as processed
    await prisma.webhookLog.update({
      where: { id: webhook.id },
      data: { processed: true, processedAt: new Date() },
    });

    res.json({ success: true, received: true });
  } catch (error) {
    console.error('Error processing n8n webhook:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
    });
  }
});

/**
 * POST /api/webhooks/buffer
 * Receive webhooks from Buffer
 */
router.post('/buffer', async (req, res) => {
  try {
    const { profile_id, scheduled_at } = req.body;

    await prisma.webhookLog.create({
      data: {
        source: 'buffer',
        eventType: 'schedule_post',
        payload: JSON.stringify(req.body),
        processed: true,
        processedAt: new Date(),
      },
    });

    console.log('[Webhook] Buffer post scheduled:', { profile_id, scheduled_at });

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing buffer webhook:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
    });
  }
});

/**
 * POST /api/webhooks/meta
 * Receive webhooks from Meta (Facebook/Instagram)
 */
router.post('/meta', async (req, res) => {
  try {
    const { entry } = req.body;
    const hubVerifyToken = req.query['hub_verify_token'] as string;
    const hubChallenge = req.query['hub_challenge'] as string;

    // Handle Meta webhook verification
    if (hubVerifyToken) {
      const verifyToken = process.env.META_VERIFY_TOKEN || 'dummy_token';
      if (hubVerifyToken === verifyToken) {
        return res.send(hubChallenge);
      }
      return res.status(403).send('Invalid token');
    }

    // Process updates
    for (const item of entry || []) {
      for (const messaging of item.messaging || []) {
        console.log('[Webhook] Meta message:', messaging);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing meta webhook:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
    });
  }
});

/**
 * POST /api/webhooks/tiktok
 * Receive webhooks from TikTok
 */
router.post('/tiktok', async (req, res) => {
  try {
    const { event } = req.body;

    await prisma.webhookLog.create({
      data: {
        source: 'tiktok',
        eventType: event || 'unknown',
        payload: JSON.stringify(req.body),
        processed: true,
        processedAt: new Date(),
      },
    });

    console.log('[Webhook] TikTok event:', event);

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing tiktok webhook:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
    });
  }
});

/**
 * GET /api/webhooks/logs
 * Get webhook logs (admin only)
 */
router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.webhookLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.webhookLog.count(),
    ]);

    res.json({
      success: true,
      data: logs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching webhook logs:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch logs' },
    });
  }
});

/**
 * POST /api/webhooks/test
 * Test webhook endpoint
 */
router.post('/test', async (req, res) => {
  console.log('[Webhook] Test received:', req.body);
  res.json({
    success: true,
    received: true,
    timestamp: new Date().toISOString(),
  });
});

export default router;
