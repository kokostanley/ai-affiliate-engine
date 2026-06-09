// ============================================
// WAITING UPLOAD API
// Creates folder with files for manual Pippit video creation
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const router = Router();
const prisma = new PrismaClient();

// GET /api/waiting-upload/:contentId
// Creates download folder with all files for manual upload
router.get('/:contentId', async (req, res) => {
  try {
    const { contentId } = req.params;

    // Get content with all related data
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        product: true,
        qualityScores: true,
        contentVariants: { orderBy: { variantIndex: 'asc' } },
        videoPrompts: true,
      },
    });

    if (!content) {
      return res.status(404).json({ success: false, error: 'Content not found' });
    }

    // Create folder name
    const folderName = `${contentId.substring(0, 8)}-${content.product.slug}`;
    const tempDir = os.tmpdir();
    const folderPath = path.join(tempDir, 'WAITING_UPLOAD', folderName);

    // Create directory structure
    fs.mkdirSync(folderPath, { recursive: true });

    // Get data
    const quality = content.qualityScores?.[0];
    const hooks = content.contentVariants.filter(v => v.variantType === 'HOOK');
    const captions = content.contentVariants.filter(v => v.variantType === 'CAPTION');
    const pippitPrompt = content.videoPrompts?.find(p => p.tool === 'PIPPIT');

    // 1. README.txt
    const readme = `
PIPPIT MANUAL VIDEO CREATION GUIDE
================================

PRODUCT: ${content.product.name}
PRICE: Rp ${Number(content.product.price || 0).toLocaleString('id-ID')}
PLATFORM: ${content.product.affiliatePlatform}
LINK: ${content.product.affiliateLink}

STEPS:
1. Go to pippit.ai
2. Open pippit-prompt.txt and copy the FULL prompt
3. Paste into Pippit's video generator
4. Set duration: ${pippitPrompt?.duration || 30} seconds
5. Set format: ${pippitPrompt?.format || '9:16'} (TikTok/Shorts)
6. Generate and download video
7. Upload to cloud storage
8. Come back to complete the upload

FILES:
- README.txt - This guide
- pippit-prompt.txt - Prompt for Pippit
- script.txt - Video script/hook
- caption.txt - Post caption text
- hashtags.txt - Hashtags for the post

QUALITY SCORE: ${quality?.overallScore || 'N/A'}/100
`;

    fs.writeFileSync(path.join(folderPath, 'README.txt'), readme);

    // 2. pippit-prompt.txt
    const promptText = pippitPrompt?.prompt || content.hook || quality?.bestHook || 'Create an engaging video';

    const pippitPromptFile = `
PIPPIT VIDEO PROMPT
==================

PRODUCT: ${content.product.name}
PRICE: Rp ${Number(content.product.price || 0).toLocaleString('id-ID')}

PROMPT:
${promptText}

SCRIPT (for voiceover):
${content.script || hooks[0]?.contentValue || ''}

DURATION: ${pippitPrompt?.duration || 30} seconds
FORMAT: ${pippitPrompt?.format || '9:16'}
`;

    fs.writeFileSync(path.join(folderPath, 'pippit-prompt.txt'), pippitPromptFile);

    // 3. script.txt
    const scriptContent = `
VIDEO SCRIPT
============

HOOK (FIRST 3 SECONDS):
${quality?.bestHook || content.hook || hooks[0]?.contentValue || ''}

BODY:
${content.script || ''}

ALTERNATIVE HOOKS:
${hooks.slice(0, 3).map((h, i) => `${i + 1}. ${h.contentValue}`).join('\n\n')}
`;

    fs.writeFileSync(path.join(folderPath, 'script.txt'), scriptContent);

    // 4. caption.txt
    const captionContent = `
POST CAPTION
============

${quality?.bestCaption || content.caption || captions[0]?.contentValue || ''}

ALTERNATIVE CAPTIONS:
${captions.slice(0, 3).map((c, i) => `${i + 1}.\n${c.contentValue}`).join('\n\n')}
`;

    fs.writeFileSync(path.join(folderPath, 'caption.txt'), captionContent);

    // 5. hashtags.txt
    const hashtagsContent = `
HASHTAGS
========

${content.hashtags || ''}

SUGGESTED:
#ProdukIndonesia #ShopeeIndonesia #TikTokShop
#Trending #Viral #FYP #ForYouPage
`;

    fs.writeFileSync(path.join(folderPath, 'hashtags.txt'), hashtagsContent);

    // Return success
    const downloadUrl = `/api/waiting-upload/${contentId}/download`;

    res.json({
      success: true,
      data: {
        contentId,
        productName: content.product.name,
        folderName,
        folderPath,
        files: [
          'README.txt',
          'pippit-prompt.txt',
          'script.txt',
          'caption.txt',
          'hashtags.txt',
        ],
        qualityScore: quality?.overallScore || null,
      },
    });

  } catch (error: any) {
    console.error('[WaitingUpload] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/waiting-upload/:contentId/download
// Returns JSON with file paths (files created in temp directory)
router.get('/:contentId/download', async (req, res) => {
  try {
    const { contentId } = req.params;

    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { product: true },
    });

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const folderName = `${contentId.substring(0, 8)}-${content.product.slug}`;
    const tempDir = os.tmpdir();
    const folderPath = path.join(tempDir, 'WAITING_UPLOAD', folderName);

    res.json({
      success: true,
      message: 'Files ready in temp directory',
      folderPath,
      instructions: `Navigate to ${folderPath} to access the files`,
    });

  } catch (error: any) {
    console.error('[WaitingUpload] Download error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
