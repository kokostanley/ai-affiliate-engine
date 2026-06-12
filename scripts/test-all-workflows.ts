// Test script for ALL workflows (IMAGE, CAROUSEL, VIDEO)
import { PrismaClient } from '@prisma/client';
import { scrapeProduct, isValidAffiliateLink } from '../src/scraper';
import { generatePhase2Content } from '../src/lib/openai-content';
import { executeContentTypePipeline } from '../src/services/approval-pipeline';
import { getDistributionItem } from '../src/services/distribution';

const prisma = new PrismaClient();

const TEST_LINKS = {
  IMAGE: 'https://shopee.co.id/test-image-workflow-' + Date.now(),
  CAROUSEL: 'https://shopee.co.id/test-carousel-workflow-' + Date.now(),
  VIDEO: 'https://tiktok.com/shop/product/test-video-workflow-' + Date.now(),
};

async function testAllWorkflows() {
  console.log('🧪 Testing ALL Workflows (IMAGE, CAROUSEL, VIDEO)\n');
  console.log('='.repeat(60));

  // Get brand
  const brand = await prisma.brand.findFirst({ where: { status: 'ACTIVE' } });
  if (!brand) {
    console.log('❌ No active brand found');
    return;
  }
  console.log('📍 Using brand:', brand.name);

  const results: Record<string, any> = {};

  // ========== IMAGE WORKFLOW ==========
  console.log('\n' + '='.repeat(60));
  console.log('🖼️  IMAGE WORKFLOW TEST');
  console.log('='.repeat(60));

  try {
    // Create product
    const product = await prisma.product.create({
      data: {
        name: 'Test Image Product',
        slug: `test_img_${Date.now()}`,
        category: 'Test',
        price: 99000,
        commission: 10,
        commissionAmount: 9900,
        affiliatePlatform: 'Shopee',
        affiliateLink: TEST_LINKS.IMAGE,
        status: 'ACTIVE',
      },
    });

    // Generate content
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: 'Test product for image workflow',
      productPrice: product.price,
      productCategory: 'Test',
    });

    // Create content
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

    // Quality score
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        overallScore: contentPack.qualityScores.overallScore,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        hookScore: contentPack.qualityScores.hookScore,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        recommendation: contentPack.qualityScores.recommendation,
        shouldPost: contentPack.qualityScores.shouldPost,
      },
    });

    // Execute pipeline
    const result = await executeContentTypePipeline(content.id, 'IMAGE', {
      autoApprove: true,
      provider: 'OPENAI_IMAGE',
      platform: 'INSTAGRAM',
      brandId: brand.id,
    });

    const dist = result.distributionId ? await getDistributionItem(result.distributionId) : null;

    results.IMAGE = {
      success: result.success,
      renderJobs: result.renderJobIds.length,
      distributionId: !!result.distributionId,
      distributionStatus: dist?.status,
      zernioPostId: !!result.zernioPostId,
    };

    console.log('✅ IMAGE Pipeline Result:');
    console.log('   Success:', result.success);
    console.log('   Render Jobs:', result.renderJobIds.length);
    console.log('   Distribution:', result.distributionId ? 'Created' : 'NOT Created');
    console.log('   Status:', dist?.status);

  } catch (error: any) {
    console.log('❌ IMAGE Error:', error.message);
    results.IMAGE = { success: false, error: error.message };
  }

  // ========== CAROUSEL WORKFLOW ==========
  console.log('\n' + '='.repeat(60));
  console.log('🎠 CAROUSEL WORKFLOW TEST');
  console.log('='.repeat(60));

  try {
    // Create product
    const product = await prisma.product.create({
      data: {
        name: 'Test Carousel Product',
        slug: `test_car_${Date.now()}`,
        category: 'Test',
        price: 149000,
        commission: 10,
        commissionAmount: 14900,
        affiliatePlatform: 'Shopee',
        affiliateLink: TEST_LINKS.CAROUSEL,
        status: 'ACTIVE',
      },
    });

    // Generate content
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: 'Test product for carousel workflow',
      productPrice: product.price,
      productCategory: 'Test',
    });

    // Create content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_CAROUSEL',
        platform: 'INSTAGRAM',
        hook: contentPack.hooks[0],
        caption: contentPack.captions[0],
        hashtags: contentPack.hashtags.slice(0, 10).join(','),
        cta: contentPack.ctas[0],
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    // Quality score
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        overallScore: contentPack.qualityScores.overallScore,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        hookScore: contentPack.qualityScores.hookScore,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        recommendation: contentPack.qualityScores.recommendation,
        shouldPost: contentPack.qualityScores.shouldPost,
      },
    });

    // Execute pipeline
    const result = await executeContentTypePipeline(content.id, 'CAROUSEL', {
      autoApprove: true,
      provider: 'OPENAI_IMAGE',
      platform: 'INSTAGRAM',
      brandId: brand.id,
    });

    const dist = result.distributionId ? await getDistributionItem(result.distributionId) : null;

    results.CAROUSEL = {
      success: result.success,
      renderJobs: result.renderJobIds.length,
      distributionId: !!result.distributionId,
      distributionStatus: dist?.status,
      zernioPostId: !!result.zernioPostId,
    };

    console.log('✅ CAROUSEL Pipeline Result:');
    console.log('   Success:', result.success);
    console.log('   Render Jobs:', result.renderJobIds.length, '(expected: 5)');
    console.log('   Distribution:', result.distributionId ? 'Created' : 'NOT Created');
    console.log('   Status:', dist?.status);

  } catch (error: any) {
    console.log('❌ CAROUSEL Error:', error.message);
    results.CAROUSEL = { success: false, error: error.message };
  }

  // ========== VIDEO WORKFLOW ==========
  console.log('\n' + '='.repeat(60));
  console.log('🎬 VIDEO WORKFLOW TEST');
  console.log('='.repeat(60));

  try {
    // Create product
    const product = await prisma.product.create({
      data: {
        name: 'Test Video Product',
        slug: `test_vid_${Date.now()}`,
        category: 'Test',
        price: 199000,
        commission: 10,
        commissionAmount: 19900,
        affiliatePlatform: 'TikTok',
        affiliateLink: TEST_LINKS.VIDEO,
        status: 'ACTIVE',
      },
    });

    // Generate content
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: 'Test product for video workflow',
      productPrice: product.price,
      productCategory: 'Test',
    });

    // Create content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_FULL',
        platform: 'TIKTOK',
        hook: contentPack.hooks[0],
        caption: contentPack.captions[0],
        script: contentPack.scripts[0],
        hashtags: contentPack.hashtags.slice(0, 10).join(','),
        cta: contentPack.ctas[0],
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    // Quality score
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        overallScore: contentPack.qualityScores.overallScore,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        hookScore: contentPack.qualityScores.hookScore,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        recommendation: contentPack.qualityScores.recommendation,
        shouldPost: contentPack.qualityScores.shouldPost,
      },
    });

    // Video prompts
    for (const vp of contentPack.videoPrompts) {
      await prisma.videoPrompt.create({
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
    }

    // Execute pipeline
    const result = await executeContentTypePipeline(content.id, 'VIDEO', {
      autoApprove: true,
      provider: 'PIPPIT_MANUAL',
      platform: 'TIKTOK',
      brandId: brand.id,
    });

    const dist = result.distributionId ? await getDistributionItem(result.distributionId) : null;

    results.VIDEO = {
      success: result.success,
      renderJobs: result.renderJobIds.length,
      distributionId: !!result.distributionId,
      distributionStatus: dist?.status,
      provider: dist?.provider,
    };

    console.log('✅ VIDEO Pipeline Result:');
    console.log('   Success:', result.success);
    console.log('   Render Jobs:', result.renderJobIds.length, '(expected: 0 for Pippit Manual)');
    console.log('   Distribution:', result.distributionId ? 'Created' : 'NOT Created');
    console.log('   Status:', dist?.status);
    console.log('   Provider:', dist?.provider);

  } catch (error: any) {
    console.log('❌ VIDEO Error:', error.message);
    results.VIDEO = { success: false, error: error.message };
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('='.repeat(60));

  const tests = [
    {
      name: 'IMAGE Workflow',
      checks: [
        { name: 'Pipeline Success', pass: results.IMAGE.success },
        { name: 'Render Job Created', pass: results.IMAGE.renderJobs >= 1 },
        { name: 'Distribution Created', pass: results.IMAGE.distributionId },
        { name: 'Status QUEUED', pass: results.IMAGE.distributionStatus === 'QUEUED' },
      ]
    },
    {
      name: 'CAROUSEL Workflow',
      checks: [
        { name: 'Pipeline Success', pass: results.CAROUSEL.success },
        { name: '5 Render Jobs Created', pass: results.CAROUSEL.renderJobs === 5 },
        { name: 'Distribution Created', pass: results.CAROUSEL.distributionId },
        { name: 'Status QUEUED', pass: results.CAROUSEL.distributionStatus === 'QUEUED' },
      ]
    },
    {
      name: 'VIDEO Workflow',
      checks: [
        { name: 'Pipeline Success', pass: results.VIDEO.success },
        { name: 'No Render Jobs (Pippit)', pass: results.VIDEO.renderJobs === 0 },
        { name: 'Distribution Created', pass: results.VIDEO.distributionId },
        { name: 'Status DRAFT', pass: results.VIDEO.distributionStatus === 'DRAFT' },
        { name: 'Provider PIPPIT_MANUAL', pass: results.VIDEO.provider === 'PIPPIT_MANUAL' },
      ]
    },
  ];

  let totalPassed = 0;
  let totalTests = 0;

  for (const workflow of tests) {
    console.log(`\n${workflow.name}:`);
    for (const check of workflow.checks) {
      const status = check.pass ? '✅' : '❌';
      console.log(`   ${status} ${check.name}`);
      totalTests++;
      if (check.pass) totalPassed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`🎯 ${totalPassed}/${totalTests} tests passed`);

  if (totalPassed === totalTests) {
    console.log('\n🎉 ALL WORKFLOW TESTS PASSED!');
  } else {
    console.log('\n⚠️ Some tests failed. Check the output above.');
  }

  await prisma.$disconnect();
}

testAllWorkflows();
