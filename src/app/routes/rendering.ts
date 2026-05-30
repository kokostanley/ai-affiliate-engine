// ============================================
// PHASE 4: RENDERING API ROUTES
// Video/Image rendering job management
// ============================================

import { Router } from 'express';
import {
  createRenderJob,
  getRenderJobs,
  getRenderJob,
  startJob,
  completeJob,
  failJob,
  cancelJob,
  getRenderStats,
  createBatchJobs,
  handleWebhook,
  RenderTool,
} from '../../services/rendering';

const router = Router();

// ============================================
// GET /api/rendering
// List all render jobs
// ============================================

router.get('/', async (req, res) => {
  try {
    const { status, tool, packageId, limit } = req.query;

    const jobs = await getRenderJobs({
      status: status as any,
      tool: tool as RenderTool,
      productionPackageId: packageId as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    const stats = await getRenderStats();

    res.json({
      success: true,
      data: {
        jobs,
        stats,
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
// GET /api/rendering/stats
// Get rendering stats
// ============================================

router.get('/stats', async (req, res) => {
  try {
    const stats = await getRenderStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/rendering/:id
// Get single render job
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const job = await getRenderJob(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Render job not found' }
      });
    }

    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/rendering/create
// Create a new render job
// ============================================

router.post('/create', async (req, res) => {
  try {
    const { productionPackageId, jobType, tool, prompt, duration, format } = req.body;

    if (!productionPackageId || !jobType || !tool || !prompt) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' }
      });
    }

    const job = await createRenderJob({
      productionPackageId,
      jobType,
      tool,
      prompt,
      duration,
      format,
    });

    res.status(201).json({
      success: true,
      data: job,
      message: 'Render job created'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/rendering/batch
// Create batch render jobs for a package
// ============================================

router.post('/batch', async (req, res) => {
  try {
    const { productionPackageId, videoTools, imageTools } = req.body;

    if (!productionPackageId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'productionPackageId required' }
      });
    }

    const jobs = await createBatchJobs(productionPackageId, {
      videoTools: videoTools || ['PIPPIT', 'VEO'],
      imageTools: imageTools || ['DALL_E'],
    });

    res.status(201).json({
      success: true,
      data: {
        jobs,
        count: jobs.length,
      },
      message: `Created ${jobs.length} render jobs`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// PATCH /api/rendering/:id/status
// Update job status
// ============================================

router.patch('/:id/status', async (req, res) => {
  try {
    const { status, outputUrl, outputType, thumbnailUrl, errorMessage } = req.body;
    let job;

    switch (status) {
      case 'processing':
        job = await startJob(req.params.id);
        break;
      case 'completed':
        if (!outputUrl) {
          return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'outputUrl required for completion' }
          });
        }
        job = await completeJob(req.params.id, { outputUrl, outputType, thumbnailUrl });
        break;
      case 'failed':
        job = await failJob(req.params.id, errorMessage || 'Unknown error');
        break;
      default:
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Invalid status' }
        });
    }

    res.json({
      success: true,
      data: job,
      message: `Job status updated to ${status}`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/rendering/:id/cancel
// Cancel a render job
// ============================================

router.post('/:id/cancel', async (req, res) => {
  try {
    const job = await cancelJob(req.params.id);
    res.json({
      success: true,
      data: job,
      message: 'Job cancelled'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/rendering/:id/retry
// Retry a failed job
// ============================================

router.post('/:id/retry', async (req, res) => {
  try {
    const job = await prisma.renderJob.update({
      where: { id: req.params.id },
      data: {
        status: 'queued',
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      },
    });

    res.json({
      success: true,
      data: job,
      message: 'Job queued for retry'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/rendering/webhook/:id
// Webhook for external render completion
// ============================================

router.post('/webhook/:id', async (req, res) => {
  try {
    const { status, outputUrl, outputType, thumbnailUrl, error } = req.body;

    const job = await handleWebhook(req.params.id, {
      status: status as 'completed' | 'failed',
      outputUrl,
      outputType,
      thumbnailUrl,
      error,
    });

    res.json({
      success: true,
      data: job,
      message: 'Webhook processed'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/rendering/:id/output
// Get rendered output
// ============================================

router.get('/:id/output', async (req, res) => {
  try {
    const job = await getRenderJob(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Job not found' }
      });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_READY', message: 'Job not completed yet', status: job.status }
      });
    }

    res.json({
      success: true,
      data: {
        outputUrl: job.outputUrl,
        outputType: job.outputType,
        thumbnailUrl: job.thumbnailUrl,
        duration: job.duration,
        size: job.size,
        tool: job.tool,
        completedAt: job.completedAt,
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

export default router;