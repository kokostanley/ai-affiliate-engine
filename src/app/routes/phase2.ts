// ============================================
// PHASE 2 API ENDPOINTS
// Advanced content generation with variants
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generatePhase2Content, QualityScores, VideoPrompt, ImagePrompt } from '../../lib/openai-content';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// POST /api/phase2/generate
// Generate Phase 2 content for a product
// ============================================

router.post('/generate', async (req, res) => {
  try {
    const { productId, platform, contentType, tone, language } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'productId required' }
      });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Product not found' }
      });
    }

    // Generate Phase 2 content
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: product.description || '',
      productPrice: Number(product.price),
      productCategory: product.category,
      platform: platform || 'ALL',
    });

    // Create main content record
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: contentType || 'PHASE2_FULL',
        platform: platform || 'ALL',
        hook: contentPack.hooks[0] || '',
        script: contentPack.scripts[0] || '',
        caption: contentPack.captions[0] || '',
        hashtags: contentPack.hashtags.slice(0, 30).join(','),
        cta: contentPack.ctas[0] || '',
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: tone || 'casual',
        language: language || 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    // Create content variants
    const variantPromises: any[] = [];

    // Hooks (1-20)
    contentPack.hooks.forEach((hook, index) => {
      variantPromises.push(
        prisma.contentVariant.create({
          data: {
            contentId: content.id,
            variantType: 'HOOK',
            variantIndex: index + 1,
            contentValue: hook,
          },
        })
      );
    });

    // Captions (1-10)
    contentPack.captions.forEach((caption, index) => {
      variantPromises.push(
        prisma.contentVariant.create({
          data: {
            contentId: content.id,
            variantType: 'CAPTION',
            variantIndex: index + 1,
            contentValue: caption,
          },
        })
      );
    });

    // CTAs (1-5)
    contentPack.ctas.forEach((cta, index) => {
      variantPromises.push(
        prisma.contentVariant.create({
          data: {
            contentId: content.id,
            variantType: 'CTA',
            variantIndex: index + 1,
            contentValue: cta,
          },
        })
      );
    });

    // Scripts (1-5)
    contentPack.scripts.forEach((script, index) => {
      variantPromises.push(
        prisma.contentVariant.create({
          data: {
            contentId: content.id,
            variantType: 'SCRIPT',
            variantIndex: index + 1,
            contentValue: script,
          },
        })
      );
    });

    // Hashtag sets (1-5, each set of 30)
    for (let i = 0; i < 5; i++) {
      const startIdx = i * 6;
      const hashtagSet = contentPack.hashtags.slice(startIdx, startIdx + 6).join(',');
      variantPromises.push(
        prisma.contentVariant.create({
          data: {
            contentId: content.id,
            variantType: 'HASHTAG',
            variantIndex: i + 1,
            contentValue: hashtagSet,
          },
        })
      );
    }

    // Angles (1-5)
    contentPack.angles.forEach((angle, index) => {
      variantPromises.push(
        prisma.contentVariant.create({
          data: {
            contentId: content.id,
            variantType: 'ANGLE',
            variantIndex: index + 1,
            contentValue: angle,
          },
        })
      );
    });

    await Promise.all(variantPromises);

    // Create video prompts
    const videoPromises = contentPack.videoPrompts.map(vp =>
      prisma.videoPrompt.create({
        data: {
          productId: product.id,
          contentId: content.id,
          tool: vp.tool,
          prompt: vp.prompt,
          duration: vp.duration,
          format: vp.format,
          hook: vp.hook,
          sceneBreakdown: vp.sceneBreakdown,
          voiceOver: vp.voiceOver,
          onScreenText: vp.onScreenText,
          suggestedMusic: vp.suggestedMusic,
          status: 'DRAFT',
        },
      })
    );
    await Promise.all(videoPromises);

    // Create image prompts
    const imagePromises = contentPack.imagePrompts.map(ip =>
      prisma.imagePrompt.create({
        data: {
          productId: product.id,
          contentId: content.id,
          imageType: ip.imageType,
          prompt: ip.prompt,
          layout: ip.layout,
          productPlacement: ip.productPlacement,
          background: ip.background,
          textOverlay: ip.textOverlay,
          visualMood: ip.visualMood,
          status: 'DRAFT',
        },
      })
    );
    await Promise.all(imagePromises);

    // Create quality scores
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        hookScore: contentPack.qualityScores.hookScore,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        overallScore: contentPack.qualityScores.overallScore,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        shouldPost: contentPack.qualityScores.shouldPost,
        recommendation: contentPack.qualityScores.recommendation,
      },
    });

    res.json({
      success: true,
      data: {
        contentId: content.id,
        productId: product.id,
        productName: product.name,
        stats: {
          hooks: contentPack.hooks.length,
          captions: contentPack.captions.length,
          ctas: contentPack.ctas.length,
          scripts: contentPack.scripts.length,
          hashtags: contentPack.hashtags.length,
          angles: contentPack.angles.length,
          videoPrompts: contentPack.videoPrompts.length,
          imagePrompts: contentPack.imagePrompts.length,
        },
        qualityScores: contentPack.qualityScores,
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
      },
    });
  } catch (error: any) {
    console.error('Phase 2 generation error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/phase2/:contentId
// Get full Phase 2 content with all variants
// ============================================

router.get('/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;

    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        product: { select: { id: true, name: true, price: true, affiliatePlatform: true } },
        contentVariants: { orderBy: [{ variantType: 'asc' }, { variantIndex: 'asc' }] },
        videoPrompts: true,
        imagePrompts: true,
        qualityScores: true,
      },
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Content not found' }
      });
    }

    // Organize variants by type
    const variants: any = {
      hooks: [],
      captions: [],
      ctas: [],
      scripts: [],
      hashtags: [],
      angles: [],
    };

    content.contentVariants.forEach(v => {
      const type = v.variantType.toLowerCase();
      if (variants[type]) {
        variants[type].push({
          index: v.variantIndex,
          content: v.contentValue,
          qualityScore: v.qualityScore,
        });
      }
    });

    res.json({
      success: true,
      data: {
        id: content.id,
        product: content.product,
        contentType: content.contentType,
        platform: content.platform,
        status: content.status,
        approvalStatus: content.approvalStatus,
        variants,
        videoPrompts: content.videoPrompts,
        imagePrompts: content.imagePrompts,
        qualityScores: content.qualityScores?.[0] || null,
        telegramText: content.telegramText,
        whatsappText: content.whatsappText,
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
// GET /api/phase2/:contentId/variants
// Get only content variants
// ============================================

router.get('/:contentId/variants', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { type } = req.query;

    const where: any = { contentId };
    if (type) where.variantType = type.toUpperCase();

    const variants = await prisma.contentVariant.findMany({
      where,
      orderBy: [{ variantType: 'asc' }, { variantIndex: 'asc' }],
    });

    res.json({ success: true, data: variants });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/phase2/:contentId/video-prompts
// Get video prompts for content
// ============================================

router.get('/:contentId/video-prompts', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { tool } = req.query;

    const where: any = { contentId };
    if (tool) where.tool = tool.toUpperCase();

    const prompts = await prisma.videoPrompt.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: prompts });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/phase2/:contentId/image-prompts
// Get image prompts for content
// ============================================

router.get('/:contentId/image-prompts', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { type } = req.query;

    const where: any = { contentId };
    if (type) where.imageType = type.toUpperCase();

    const prompts = await prisma.imagePrompt.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: prompts });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// GET /api/phase2/:contentId/quality
// Get quality scores for content
// ============================================

router.get('/:contentId/quality', async (req, res) => {
  try {
    const { contentId } = req.params;

    const quality = await prisma.qualityScore.findFirst({
      where: { contentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!quality) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Quality scores not found' }
      });
    }

    res.json({ success: true, data: quality });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================
// POST /api/phase2/:contentId/approve
// Approve Phase 2 content
// ============================================

router.post('/:contentId/approve', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { approvedBy } = req.body;

    const content = await prisma.content.update({
      where: { id: contentId },
      data: {
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: approvedBy || 'admin',
      },
      include: {
        product: { select: { name: true } },
        qualityScores: { take: 1 },
      },
    });

    // Log approval
    await prisma.approvalLog.create({
      data: {
        contentId: content.id,
        action: 'APPROVED',
        actionBy: approvedBy || 'admin',
        notes: 'Approved via Phase 2 workflow',
      },
    });

    res.json({
      success: true,
      data: {
        contentId: content.id,
        productName: content.product.name,
        approvedAt: content.approvedAt,
        qualityScore: content.qualityScores?.[0]?.overallScore,
        message: 'Content approved and ready for scheduling',
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
// POST /api/phase2/:contentId/reject
// Reject Phase 2 content
// ============================================

router.post('/:contentId/reject', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { reason, rejectedBy } = req.body;

    const content = await prisma.content.update({
      where: { id: contentId },
      data: {
        approvalStatus: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason || 'No reason provided',
      },
    });

    // Log rejection
    await prisma.approvalLog.create({
      data: {
        contentId: content.id,
        action: 'REJECTED',
        actionBy: rejectedBy || 'admin',
        notes: reason || 'No reason provided',
      },
    });

    res.json({
      success: true,
      data: {
        contentId: content.id,
        rejectedAt: content.rejectedAt,
        reason: content.rejectionReason,
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
// POST /api/phase2/:contentId/regenerate
// Regenerate content variants
// ============================================

router.post('/:contentId/regenerate', async (req, res) => {
  try {
    const { contentId } = req.params;
    const { variantType } = req.body;

    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { product: true },
    });

    if (!content) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Content not found' }
      });
    }

    // Generate new content
    const contentPack = await generatePhase2Content({
      productName: content.product.name,
      productDescription: content.product.description || '',
      productPrice: Number(content.product.price),
      productCategory: content.product.category,
    });

    // Update specific variants or all
    if (variantType) {
      const type = variantType.toUpperCase();
      let items: string[] = [];

      switch (type) {
        case 'HOOK':
          items = contentPack.hooks;
          break;
        case 'CAPTION':
          items = contentPack.captions;
          break;
        case 'CTA':
          items = contentPack.ctas;
          break;
        case 'SCRIPT':
          items = contentPack.scripts;
          break;
        default:
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_TYPE', message: 'Invalid variant type' }
          });
      }

      // Delete old variants of this type
      await prisma.contentVariant.deleteMany({
        where: { contentId, variantType: type }
      });

      // Create new variants
      const newVariants = items.map((item, index) =>
        prisma.contentVariant.create({
          data: {
            contentId,
            variantType: type,
            variantIndex: index + 1,
            contentValue: item,
          },
        })
      );

      await Promise.all(newVariants);
    }

    // Update main content record
    await prisma.content.update({
      where: { id: contentId },
      data: { updatedAt: new Date() }
    });

    res.json({
      success: true,
      data: {
        contentId,
        regenerated: variantType || 'ALL',
        message: 'Variants regenerated successfully',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

export default router;