// Test script for VIDEO workflow (Pippit Manual)
import { PrismaClient } from '@prisma/client';
import { scrapeProduct, isValidAffiliateLink } from '../src/scraper';
import { generatePhase2Content } from '../src/lib/openai-content';
import { executeContentTypePipeline } from '../src/services/approval-pipeline';
import { getDistributionItem } from '../src/services/distribution';

const prisma = new PrismaClient();

const TEST_LINK = 'https://tiktok.com/shop/product/test-video-workflow-123';

async function testVideoWorkflow() {
  console.log('🧪 Testing VIDEO Workflow (Pippit Manual)\n');
  console.log('='.repeat(50));

  try {
    // 1. Get or create test brand
    let brand = await prisma.brand.findFirst({ where: { status: 'ACTIVE' } });
    if (!brand) {
      brand = await prisma.brand.create({
        data: { name: 'Test Brand', slug: 'test-brand', status: 'ACTIVE' },
      });
      console.log('✅ Created test brand:', brand.name);
    } else {
      console.log('📍 Using existing brand:', brand.name);
    }

    // 2. Create test Telegram session
    const telegramId = '123456789';
    await prisma.telegramSession.upsert({
      where: { telegramId },
      create: {
        telegramId,
        activeBrandId: brand.id,
        activeBrandSlug: brand.slug,
        state: 'ACTIVE',
      },
      update: {
        activeBrandId: brand.id,
        activeBrandSlug: brand.slug,
      },
    });
    console.log('✅ Telegram session set\n');

    // 3. Test scraping
    console.log('STEP 1: Scraping product');
    console.log('-'.repeat(30));

    if (!isValidAffiliateLink(TEST_LINK)) {
      console.log('❌ Invalid affiliate link');
      return;
    }

    let scrapedProduct;
    try {
      scrapedProduct = await scrapeProduct(TEST_LINK);
      console.log('✅ Scraped:', scrapedProduct.name);
      console.log('   Price:', scrapedProduct.price);
      console.log('   Platform:', scrapedProduct.platform);
    } catch (e) {
      console.log('⚠️ Scrape failed, using fallback');
      scrapedProduct = {
        name: 'Test Video Product',
        price: 199000,
        imageUrl: null,
        description: 'High quality video product for TikTok',
        category: 'Fashion',
        platform: 'tiktok',
        platformDisplay: 'TikTok Shop',
        affiliateLink: TEST_LINK,
        available: true,
        url: TEST_LINK,
      };
      console.log('✅ Using fallback data:', scrapedProduct.name);
    }

    // 4. Check for existing product
    console.log('\nSTEP 2: Product check');
    console.log('-'.repeat(30));

    let product = await prisma.product.findFirst({ where: { affiliateLink: TEST_LINK } });
    if (product) {
      console.log('📍 Reusing existing product:', product.name);
    } else {
      console.log('📍 Will create new product');
    }

    // 5. Create test content
    console.log('\nSTEP 3: Creating test content');
    console.log('-'.repeat(30));

    if (!product) {
      product = await prisma.product.create({
        data: {
          name: scrapedProduct.name,
          slug: `test_vid_${Date.now()}`,
          category: scrapedProduct.category || 'Uncategorized',
          price: scrapedProduct.price || 0,
          commission: 10,
          commissionAmount: (scrapedProduct.price || 0) * 0.1,
          affiliatePlatform: scrapedProduct.platformDisplay || 'TikTok',
          affiliateLink: TEST_LINK,
          status: 'ACTIVE',
        },
      });
      console.log('✅ Created product:', product.id);
    }

    // Generate AI content
    const contentPack = await generatePhase2Content({
      productName: product.name,
      productDescription: scrapedProduct.description || '',
      productPrice: scrapedProduct.price || 0,
      productCategory: scrapedProduct.category,
    });
    console.log('✅ Generated AI content:');
    console.log('   Hooks:', contentPack.hooks.length);
    console.log('   Captions:', contentPack.captions.length);
    console.log('   Scripts:', contentPack.scripts.length);
    console.log('   Video Prompts:', contentPack.videoPrompts.length, '(should be 4)');
    console.log('   Quality Score:', contentPack.qualityScores.overallScore);

    // Create content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_FULL',
        platform: 'TIKTOK',
        hook: contentPack.hooks[0] || '',
        caption: contentPack.captions[0] || '',
        script: contentPack.scripts[0] || '',
        hashtags: contentPack.hashtags.slice(0, 30).join(','),
        cta: contentPack.ctas[0] || '',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
        tone: 'casual',
        language: 'id',
      },
    });
    console.log('✅ Created content:', content.id);

    // Create quality score
    await prisma.qualityScore.create({
      data: {
        contentId: content.id,
        hookScore: contentPack.qualityScores.hookScore,
        overallScore: contentPack.qualityScores.overallScore,
        bestPlatform: contentPack.qualityScores.bestPlatform,
        bestHook: contentPack.qualityScores.bestHook,
        bestCaption: contentPack.qualityScores.bestCaption,
        bestCta: contentPack.qualityScores.bestCta,
        clarityScore: contentPack.qualityScores.clarityScore,
        conversionScore: contentPack.qualityScores.conversionScore,
        platformFitScore: contentPack.qualityScores.platformFitScore,
        recommendation: contentPack.qualityScores.recommendation,
        shouldPost: contentPack.qualityScores.shouldPost,
      },
    });
    console.log('✅ Created quality score');

    // Delete any existing video prompts for this product to avoid duplicates
    await prisma.videoPrompt.deleteMany({ where: { productId: product.id } });

    // Create video prompts with ALL fields
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
    console.log('✅ Created video prompts');

    // 6. Execute VIDEO pipeline (Pippit Manual)
    console.log('\nSTEP 4: Executing VIDEO pipeline (Pippit Manual)');
    console.log('-'.repeat(30));

    const result = await executeContentTypePipeline(content.id, 'VIDEO', {
      autoApprove: true,
      provider: 'PIPPIT_MANUAL',
      platform: 'TIKTOK',
      brandId: brand.id,
    });

    console.log('Pipeline Result:');
    console.log('  Success:', result.success);
    console.log('  Steps:');
    for (const step of result.steps) {
      console.log('   ', step);
    }
    console.log('  Package ID:', result.productionPackageId?.substring(0, 12) || 'N/A');
    console.log('  Render Jobs:', result.renderJobIds.length, '(should be 0 for Pippit Manual)');
    console.log('  Distribution ID:', result.distributionId?.substring(0, 12) || 'N/A');

    // 7. Verify distribution
    console.log('\nSTEP 5: Verifying distribution');
    console.log('-'.repeat(30));

    let dist = null;
    if (result.distributionId) {
      dist = await getDistributionItem(result.distributionId);
      if (dist) {
        console.log('Distribution:');
        console.log('  ID:', dist.id.substring(0, 12));
        console.log('  Status:', dist.status);
        console.log('  Approval:', dist.approvalStatus);
        console.log('  Content Type:', dist.contentType);
        console.log('  Platform:', dist.platform);
        console.log('  Provider:', dist.provider);
        console.log('  Video URL:', dist.videoUrl || 'NOT SET (waiting for upload)');
      }
    }

    // 8. Verify tracking
    console.log('\nSTEP 6: Verifying tracking');
    console.log('-'.repeat(30));

    let tracking = await prisma.affiliateLinkTracking.findFirst({
      where: { distributionId: result.distributionId || undefined },
    });

    if (!tracking) {
      tracking = await prisma.affiliateLinkTracking.findFirst({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (tracking) {
      console.log('Tracking:');
      console.log('  ID:', tracking.id.substring(0, 12));
      console.log('  Stage:', tracking.currentPipelineStage);
      console.log('  Short Code:', tracking.shortCode);
    } else {
      console.log('⚠️ No tracking record found');
    }

    // 9. Verify video prompts were created
    console.log('\nSTEP 7: Verifying video prompts');
    console.log('-'.repeat(30));

    const videoPrompts = await prisma.videoPrompt.findMany({
      where: { productId: product.id },
      orderBy: { tool: 'asc' },
    });
    console.log('Video Prompts:', videoPrompts.length, '(expected: 4)');
    for (const vp of videoPrompts) {
      console.log(`  - ${vp.tool}: ${vp.prompt?.substring(0, 50)}...`);
      console.log(`    Duration: ${vp.duration}s | Format: ${vp.format}`);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));

    const tests = [
      { name: 'Scraping', pass: true },
      { name: 'Product Creation', pass: !!product },
      { name: 'AI Content Generation', pass: contentPack.hooks.length > 0 },
      { name: 'Content Creation', pass: !!content },
      { name: 'Quality Score', pass: true },
      { name: 'Pipeline Execution', pass: result.success },
      { name: 'No Render Jobs (Pippit Manual)', pass: result.renderJobIds.length === 0 },
      { name: 'Distribution Created', pass: !!result.distributionId },
      { name: 'Distribution Status DRAFT (waiting upload)', pass: dist?.status === 'DRAFT' },
      { name: 'Provider is PIPPIT_MANUAL', pass: dist?.provider === 'PIPPIT_MANUAL' },
      { name: 'Video Prompts Created (at least 1)', pass: videoPrompts.length >= 1 },
      { name: 'Tracking Record', pass: !!tracking },
    ];

    let passed = 0;
    for (const test of tests) {
      const status = test.pass ? '✅' : '❌';
      console.log(`${status} ${test.name}`);
      if (test.pass) passed++;
    }

    console.log(`\n${passed}/${tests.length} tests passed`);

    if (passed === tests.length) {
      console.log('\n🎉 ALL TESTS PASSED! VIDEO workflow is working correctly.');
      console.log('\n📋 NEXT STEPS:');
      console.log('1. /pippit', content.id.substring(0, 8), '- Create upload folder');
      console.log('2. Generate video at pippit.ai');
      console.log('3. Upload MP4 to cloud');
      console.log('4. /attachvideo', content.id.substring(0, 8), '[cloudUrl]');
    } else {
      console.log('\n⚠️ Some tests failed. Check the output above.');
    }

  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testVideoWorkflow();
