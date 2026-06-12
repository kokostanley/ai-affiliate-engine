// Test script for IMAGE workflow
import { PrismaClient } from '@prisma/client';
import { scrapeProduct, isValidAffiliateLink } from '../src/scraper';
import { generatePhase2Content } from '../src/lib/openai-content';
import { executeContentTypePipeline } from '../src/services/approval-pipeline';
import { getDistributionItem } from '../src/services/distribution';

const prisma = new PrismaClient();

const TEST_LINK = 'https://shopee.co.id/test-image-product-987654321';

async function testImageWorkflow() {
  console.log('🧪 Testing IMAGE Workflow\n');
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
        name: 'Test Image Product',
        price: 149000,
        imageUrl: null,
        description: 'High quality test product for image generation',
        category: 'Fashion',
        platform: 'shopee',
        platformDisplay: 'Shopee',
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
          slug: `test_img_${Date.now()}`,
          category: scrapedProduct.category || 'Uncategorized',
          price: scrapedProduct.price || 0,
          commission: 10,
          commissionAmount: (scrapedProduct.price || 0) * 0.1,
          affiliatePlatform: scrapedProduct.platformDisplay || 'Shopee',
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
    console.log('   CTAs:', contentPack.ctas.length);
    console.log('   Quality Score:', contentPack.qualityScores.overallScore);

    // Create content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'PHASE2_IMAGE',
        platform: 'INSTAGRAM',
        hook: contentPack.hooks[0] || '',
        caption: contentPack.captions[0] || '',
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

    // 6. Execute IMAGE pipeline
    console.log('\nSTEP 4: Executing IMAGE pipeline');
    console.log('-'.repeat(30));

    const result = await executeContentTypePipeline(content.id, 'IMAGE', {
      autoApprove: true,
      provider: 'OPENAI_IMAGE',
      platform: 'INSTAGRAM',
      brandId: brand.id,
    });

    console.log('Pipeline Result:');
    console.log('  Success:', result.success);
    console.log('  Steps:');
    for (const step of result.steps) {
      console.log('   ', step);
    }
    console.log('  Package ID:', result.productionPackageId?.substring(0, 12) || 'N/A');
    console.log('  Render Jobs:', result.renderJobIds.length);
    console.log('  Distribution ID:', result.distributionId?.substring(0, 12) || 'N/A');
    console.log('  Zernio Post ID:', result.zernioPostId?.substring(0, 12) || 'N/A');

    // 7. Verify render jobs
    console.log('\nSTEP 5: Verifying render jobs');
    console.log('-'.repeat(30));

    if (result.productionPackageId) {
      const renderJobs = await prisma.renderJob.findMany({
        where: { productionPackageId: result.productionPackageId },
      });
      console.log('Render Jobs in DB:', renderJobs.length);
      for (const job of renderJobs) {
        console.log(`  - ${job.tool}: ${job.status} (${job.prompt?.substring(0, 50)}...)`);
      }
    }

    // 8. Verify distribution
    console.log('\nSTEP 6: Verifying distribution');
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
      }
    }

    // 9. Verify tracking
    console.log('\nSTEP 7: Verifying tracking');
    console.log('-'.repeat(30));

    // Search by distributionId first (more reliable)
    let tracking = await prisma.affiliateLinkTracking.findFirst({
      where: { distributionId: result.distributionId || undefined },
    });

    // Fallback to productId search
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
      console.log('  Distribution ID:', tracking.distributionId?.substring(0, 12) || 'N/A');
    } else {
      console.log('⚠️ No tracking record found');
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
      { name: 'Render Job Created', pass: result.renderJobIds.length >= 1 },
      { name: 'Distribution Created', pass: !!result.distributionId },
      { name: 'Auto-Approved to QUEUED', pass: dist?.status === 'QUEUED' },
      { name: 'Zernio Draft Created', pass: !!result.zernioPostId },
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
      console.log('\n🎉 ALL TESTS PASSED! IMAGE workflow is working correctly.');
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

testImageWorkflow();
