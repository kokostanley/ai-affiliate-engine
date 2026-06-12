// Test script for content generation pipeline data integrity
import { PrismaClient } from '@prisma/client';
import { generatePhase2Content } from '../src/lib/openai-content';

const prisma = new PrismaClient();

async function testContentIntegrity() {
  console.log('🧪 Testing Content Generation Pipeline Data Integrity\n');
  console.log('='.repeat(60));

  try {
    // 1. Generate AI content
    console.log('STEP 1: Generating AI content');
    console.log('-'.repeat(30));

    const contentPack = await generatePhase2Content({
      productName: 'Test Product Quality Check',
      productDescription: 'High quality product for testing',
      productPrice: 99000,
      productCategory: 'Electronics',
    });

    console.log('✅ AI Content Generated:');
    console.log('   Hooks:', contentPack.hooks.length);
    console.log('   Captions:', contentPack.captions.length);
    console.log('   CTAs:', contentPack.ctas.length);
    console.log('   Scripts:', contentPack.scripts.length);
    console.log('   Hashtags:', contentPack.hashtags.length);
    console.log('   Quality Score:', contentPack.qualityScores.overallScore);

    // 2. Verify all video prompt fields
    console.log('\nSTEP 2: Verifying VideoPrompt fields');
    console.log('-'.repeat(30));

    const videoPromptFields = ['tool', 'prompt', 'duration', 'format', 'hook', 'voiceOver', 'sceneBreakdown', 'onScreenText', 'suggestedMusic'];
    for (const vp of contentPack.videoPrompts) {
      console.log(`\n📹 ${vp.tool}:`);
      for (const field of videoPromptFields) {
        const value = (vp as any)[field];
        const status = value !== undefined && value !== null ? '✅' : '❌';
        const display = value !== undefined && value !== null ? String(value).substring(0, 50) : 'MISSING';
        console.log(`   ${status} ${field}: ${display}`);
      }
    }

    // 3. Verify all image prompt fields
    console.log('\n\nSTEP 3: Verifying ImagePrompt fields');
    console.log('-'.repeat(30));

    const imagePromptFields = ['imageType', 'prompt', 'layout', 'background', 'visualMood', 'productPlacement', 'textOverlay'];
    for (const ip of contentPack.imagePrompts) {
      console.log(`\n🖼️ ${ip.imageType}:`);
      for (const field of imagePromptFields) {
        const value = (ip as any)[field];
        const status = value !== undefined && value !== null ? '✅' : '❌';
        const display = value !== undefined && value !== null ? String(value).substring(0, 50) : 'MISSING';
        console.log(`   ${status} ${field}: ${display}`);
      }
    }

    // 4. Create test records in DB
    console.log('\n\nSTEP 4: Testing DB storage');
    console.log('-'.repeat(30));

    // Get test brand
    const brand = await prisma.brand.findFirst({ where: { status: 'ACTIVE' } });
    if (!brand) {
      console.log('❌ No active brand found');
      return;
    }

    // Create test product
    const product = await prisma.product.create({
      data: {
        name: 'Quality Check Product',
        slug: `qc_${Date.now()}`,
        category: 'Test',
        price: 99000,
        commission: 10,
        commissionAmount: 9900,
        affiliatePlatform: 'Shopee',
        affiliateLink: 'https://shopee.co.id/test-quality-check',
        status: 'ACTIVE',
      },
    });

    // Create test content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_IMAGE',
        platform: 'INSTAGRAM',
        hook: contentPack.hooks[0],
        caption: contentPack.captions[0],
        hashtags: contentPack.hashtags.slice(0, 10).join(','),
        cta: contentPack.ctas[0],
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    // Create video prompts with ALL fields
    let videoPromptSuccess = 0;
    for (const vp of contentPack.videoPrompts) {
      try {
        const created = await prisma.videoPrompt.create({
          data: {
            productId: product.id,
            contentId: content.id,
            tool: vp.tool,
            prompt: vp.prompt,
            duration: vp.duration,
            format: vp.format,
            hook: vp.hook,
            voiceOver: vp.voiceOver,
            sceneBreakdown: vp.sceneBreakdown,
            onScreenText: vp.onScreenText,
            suggestedMusic: vp.suggestedMusic,
            status: 'DRAFT',
          },
        });

        // Verify all fields were saved
        const saved = await prisma.videoPrompt.findUnique({ where: { id: created.id } });
        if (saved?.sceneBreakdown && saved?.onScreenText && saved?.suggestedMusic) {
          videoPromptSuccess++;
        }
      } catch (e) {
        console.log(`❌ Failed to create video prompt: ${e.message}`);
      }
    }

    // Create image prompts with ALL fields
    let imagePromptSuccess = 0;
    for (const ip of contentPack.imagePrompts) {
      try {
        const created = await prisma.imagePrompt.create({
          data: {
            productId: product.id,
            contentId: content.id,
            imageType: ip.imageType,
            prompt: ip.prompt,
            layout: ip.layout,
            background: ip.background,
            visualMood: ip.visualMood,
            productPlacement: ip.productPlacement,
            textOverlay: ip.textOverlay,
            status: 'DRAFT',
          },
        });

        // Verify all fields were saved
        const saved = await prisma.imagePrompt.findUnique({ where: { id: created.id } });
        if (saved?.productPlacement && saved?.textOverlay) {
          imagePromptSuccess++;
        }
      } catch (e) {
        console.log(`❌ Failed to create image prompt: ${e.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const tests = [
      { name: 'AI Video Prompts Generated', pass: contentPack.videoPrompts.length === 4 },
      { name: 'AI Image Prompts Generated', pass: contentPack.imagePrompts.length === 4 },
      { name: 'Video Prompts SceneBreakdown', pass: contentPack.videoPrompts.every(vp => !!vp.sceneBreakdown) },
      { name: 'Video Prompts OnScreenText', pass: contentPack.videoPrompts.every(vp => !!vp.onScreenText) },
      { name: 'Video Prompts SuggestedMusic', pass: contentPack.videoPrompts.every(vp => !!vp.suggestedMusic) },
      { name: 'Image Prompts ProductPlacement', pass: contentPack.imagePrompts.every(ip => !!ip.productPlacement) },
      { name: 'Image Prompts TextOverlay', pass: contentPack.imagePrompts.every(ip => !!ip.textOverlay) },
      { name: 'DB Video Prompts Saved (All Fields)', pass: videoPromptSuccess === 4 },
      { name: 'DB Image Prompts Saved (All Fields)', pass: imagePromptSuccess === 4 },
    ];

    let passed = 0;
    for (const test of tests) {
      const status = test.pass ? '✅' : '❌';
      console.log(`${status} ${test.name}`);
      if (test.pass) passed++;
    }

    console.log(`\n${passed}/${tests.length} tests passed`);

    if (passed === tests.length) {
      console.log('\n🎉 ALL TESTS PASSED! Content generation pipeline is complete.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the output above.');
    }

    // Cleanup
    await prisma.videoPrompt.deleteMany({ where: { productId: product.id } });
    await prisma.imagePrompt.deleteMany({ where: { productId: product.id } });
    await prisma.content.delete({ where: { id: content.id } });
    await prisma.product.delete({ where: { id: product.id } });

  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testContentIntegrity();
