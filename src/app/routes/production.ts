// ============================================
// PHASE 3: PRODUCTION API ROUTES
// Production package management & export
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  generateProductionPackage,
  getProductionPackage,
  getAllProductionPackages,
  updatePackageStatus,
  deleteProductionPackage,
  getProductionStats
} from '../../services/production';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// GET /api/production
// List all production packages
// ============================================

router.get('/', async (req, res) => {
  try {
    const { status, productId, limit } = req.query;

    const packages = await getAllProductionPackages({
      status: status as any,
      productId: productId as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    const stats = await getProductionStats();

    res.json({
      success: true,
      data: {
        packages,
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
// GET /api/production/stats
// Get production stats
// ============================================

router.get('/stats', async (req, res) => {
  try {
    const stats = await getProductionStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/production/:id
// Get single production package
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const pkg = await getProductionPackage(req.params.id);

    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Package not found' }
      });
    }

    res.json({ success: true, data: pkg });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/production/generate
// Generate production package for content
// ============================================

router.post('/generate', async (req, res) => {
  try {
    const { contentId } = req.body;

    if (!contentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'contentId required' }
      });
    }

    const result = await generateProductionPackage(contentId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'GENERATION_ERROR', message: result.error }
      });
    }

    const pkg = await getProductionPackage(result.packageId!);

    res.json({
      success: true,
      data: pkg,
      message: 'Production package generated successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/production/generate-batch
// Generate packages for multiple approved content
// ============================================

router.post('/generate-batch', async (req, res) => {
  try {
    // Get all approved content without production packages
    const approvedContent = await prisma.content.findMany({
      where: {
        approvalStatus: 'APPROVED',
        productionPackages: { none: {} }
      },
      include: { product: true },
      take: 10,
    });

    const results = [];
    for (const content of approvedContent) {
      const result = await generateProductionPackage(content.id);
      results.push({
        contentId: content.id,
        productName: content.product.name,
        success: result.success,
        packageId: result.packageId,
        error: result.error,
      });
    }

    res.json({
      success: true,
      data: {
        processed: results.length,
        results,
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
// PATCH /api/production/:id/status
// Update package status
// ============================================

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ['draft', 'approved', 'production_ready', 'rendering', 'rendered', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Invalid status' }
      });
    }

    const pkg = await updatePackageStatus(req.params.id, status);

    res.json({
      success: true,
      data: pkg,
      message: `Status updated to ${status}`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/production/:id/export
// Export package as ZIP
// ============================================

router.post('/:id/export', async (req, res) => {
  try {
    const pkg = await getProductionPackage(req.params.id);

    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Package not found' }
      });
    }

    const content = pkg.content;
    const product = pkg.product;

    // Create export data
    const exportData = {
      product: {
        name: product.name,
        price: product.price,
        platform: product.affiliatePlatform,
        affiliateLink: product.affiliateLink,
      },
      content: {
        hook: content.hook,
        caption: content.caption,
        cta: content.cta,
        hashtags: content.hashtags,
        telegramText: content.telegramText,
        whatsappText: content.whatsappText,
      },
      production: {
        bestPlatform: pkg.bestPlatform,
        overallScore: pkg.overallScore,
        videoPrompts: {
          pippit: pkg.videoPromptPippit,
          veo: pkg.videoPromptVeo,
          seedance: pkg.videoPromptSeedance,
          sora: pkg.videoPromptSora,
        },
        imagePrompts: {
          thumbnail: pkg.imagePromptThumbnail,
          social: pkg.imagePromptSocial,
          carousel: pkg.imagePromptCarousel,
          ad: pkg.imagePromptAd,
        },
        voiceoverScript: pkg.voiceoverScript,
        subtitleScript: pkg.subtitleScript,
      },
      exportedAt: new Date().toISOString(),
    };

    // Update export status
    await prisma.productionPackage.update({
      where: { id: pkg.id },
      data: {
        exportPath: `/exports/${product.name.replace(/\s+/g, '-').toLowerCase()}/package.json`,
        exportedAt: new Date(),
        exportFormat: 'json',
      },
    });

    res.json({
      success: true,
      data: exportData,
      message: 'Export data ready'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/production/:id/export/text
// Export as plain text files
// ============================================

router.get('/:id/export/text', async (req, res) => {
  try {
    const pkg = await getProductionPackage(req.params.id);

    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Package not found' }
      });
    }

    const content = pkg.content;
    const product = pkg.product;

    // Create text export for all files
    const files: Record<string, string> = {};

    files['hook.txt'] = content.hook || '';
    files['caption.txt'] = content.caption || '';
    files['cta.txt'] = content.cta || '';
    files['hashtags.txt'] = content.hashtags || '';
    files['telegram.txt'] = content.telegramText || '';
    files['whatsapp.txt'] = content.whatsappText || '';

    files['video-prompts.txt'] = `
=== VIDEO PROMPTS ===
Platform: ${pkg.bestPlatform}

--- PIPPIT ---
${pkg.videoPromptPippit || 'Not generated'}

--- VEO ---
${pkg.videoPromptVeo || 'Not generated'}

--- SEEDANCE ---
${pkg.videoPromptSeedance || 'Not generated'}

--- SORA ---
${pkg.videoPromptSora || 'Not generated'}
`.trim();

    files['image-prompts.txt'] = `
=== IMAGE PROMPTS ===

--- THUMBNAIL ---
${pkg.imagePromptThumbnail || 'Not generated'}

--- SOCIAL POST ---
${pkg.imagePromptSocial || 'Not generated'}

--- CAROUSEL ---
${pkg.imagePromptCarousel || 'Not generated'}

--- AD CREATIVE ---
${pkg.imagePromptAd || 'Not generated'}
`.trim();

    files['voiceover.txt'] = pkg.voiceoverScript || 'Not generated';
    files['subtitle.txt'] = pkg.subtitleScript || 'Not generated';

    files['README.txt'] = `
===========================================
PRODUCTION PACKAGE
Product: ${product.name}
Platform: ${pkg.bestPlatform}
Score: ${pkg.overallScore}/100
Generated: ${new Date().toLocaleString('id-ID')}
===========================================

FILES INCLUDED:
- hook.txt: Best hook for video/opening
- caption.txt: Best caption for posts
- cta.txt: Call to action
- hashtags.txt: All hashtags
- telegram.txt: Telegram message template
- whatsapp.txt: WhatsApp message template
- video-prompts.txt: AI prompts for video generators
- image-prompts.txt: AI prompts for image generators
- voiceover.txt: Voiceover script (30s)
- subtitle.txt: Subtitle/text overlay script

VIDEO TOOLS:
- Pippit: ${pkg.videoPromptPippit ? '✓' : '✗'}
- Veo: ${pkg.videoPromptVeo ? '✓' : '✗'}
- Seedance: ${pkg.videoPromptSeedance ? '✓' : '✗'}
- Sora: ${pkg.videoPromptSora ? '✓' : '✗'}

IMAGE TOOLS:
- Thumbnail: ${pkg.imagePromptThumbnail ? '✓' : '✗'}
- Social Post: ${pkg.imagePromptSocial ? '✓' : '✗'}
- Carousel: ${pkg.imagePromptCarousel ? '✓' : '✗'}
- Ad Creative: ${pkg.imagePromptAd ? '✓' : '✗'}
`.trim();

    res.json({
      success: true,
      data: {
        productName: product.name,
        files,
        totalFiles: Object.keys(files).length,
      },
      message: 'Text export ready'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// DELETE /api/production/:id
// Delete production package
// ============================================

router.delete('/:id', async (req, res) => {
  try {
    await deleteProductionPackage(req.params.id);

    res.json({
      success: true,
      message: 'Production package deleted'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/production/approve/:id
// Approve production package
// ============================================

router.post('/approve/:id', async (req, res) => {
  try {
    const pkg = await updatePackageStatus(req.params.id, 'production_ready');

    res.json({
      success: true,
      data: pkg,
      message: 'Production package approved'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

export default router;