// ============================================
// FULL PIPELINE END-TO-END TEST
// Tests complete flow: Product → Content → Approval → Distribution → Tracking
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  step: string;
  success: boolean;
  data?: any;
  error?: string;
}

async function runTest() {
  console.log('═'.repeat(60));
  console.log('   FULL PIPELINE END-TO-END TEST');
  console.log('═'.repeat(60));
  console.log('');

  const results: TestResult[] = [];

  try {
    // ========================================
    // STEP 1: Check Initial State
    // ========================================
    console.log('📋 STEP 1: Initial State Check');
    console.log('-'.repeat(40));

    const initialProducts = await prisma.product.count();
    const initialContent = await prisma.content.count();
    const initialDistribution = await prisma.distributionQueue.count();
    const initialTracking = await prisma.affiliateLinkTracking.count();
    const initialRevenue = await prisma.revenueEvent.count();

    console.log(`   Products: ${initialProducts}`);
    console.log(`   Content: ${initialContent}`);
    console.log(`   Distribution: ${initialDistribution}`);
    console.log(`   Tracking: ${initialTracking}`);
    console.log(`   Revenue Events: ${initialRevenue}`);
    results.push({
      step: 'Initial State',
      success: true,
      data: { products: initialProducts, content: initialContent, distribution: initialDistribution, tracking: initialTracking }
    });
    console.log('');

    // ========================================
    // STEP 2: Create Product
    // ========================================
    console.log('📦 STEP 2: Create Product');
    console.log('-'.repeat(40));

    const brand = await prisma.brand.findFirst({ where: { status: 'ACTIVE' } });
    if (!brand) {
      console.log('   ❌ No active brand found!');
      results.push({ step: 'Create Product', success: false, error: 'No active brand' });
    } else {
      console.log(`   Brand: ${brand.name}`);

      const product = await prisma.product.create({
        data: {
          name: `E2E Test Product ${Date.now()}`,
          slug: `e2e-test-${Date.now()}`,
          category: 'Test Category',
          price: 199000,
          commission: 10,
          commissionAmount: 19900,
          affiliatePlatform: 'Shopee',
          affiliateLink: `https://shopee.co.id/test-${Date.now()}`,
          status: 'ACTIVE',
        },
      });

      console.log(`   ✅ Created Product: ${product.name}`);
      console.log(`   ID: ${product.id.substring(0, 12)}...`);
      results.push({
        step: 'Create Product',
        success: true,
        data: { productId: product.id }
      });
    }
    console.log('');

    // ========================================
    // STEP 3: Create Link Record
    // ========================================
    console.log('🔗 STEP 3: Create Link Record');
    console.log('-'.repeat(40));

    const newProduct = await prisma.product.findFirst({
      where: { name: { startsWith: 'E2E Test Product' } },
      orderBy: { createdAt: 'desc' }
    });

    if (newProduct) {
      const link = await prisma.link.create({
        data: {
          slug: `link-${Date.now()}`,
          productId: newProduct.id,
          originalLink: newProduct.affiliateLink,
          status: 'ACTIVE',
        },
      });

      console.log(`   ✅ Created Link: ${link.slug}`);
      console.log(`   ID: ${link.id.substring(0, 12)}...`);
      results.push({ step: 'Create Link', success: true, data: { linkId: link.id } });
    } else {
      console.log('   ⚠️ No new product found to create link');
      results.push({ step: 'Create Link', success: false, error: 'Product not found' });
    }
    console.log('');

    // ========================================
    // STEP 4: Create Content
    // ========================================
    console.log('📝 STEP 4: Create Content');
    console.log('-'.repeat(40));

    if (newProduct) {
      const content = await prisma.content.create({
        data: {
          productId: newProduct.id,
          contentType: 'PHASE2_IMAGE',
          platform: 'INSTAGRAM',
          hook: 'E2E Test Hook - Buy now!',
          caption: 'E2E Test Caption - Amazing product!',
          hashtags: '#test #ecommerce #shop',
          status: 'DRAFT',
          approvalStatus: 'PENDING',
          tone: 'casual',
          language: 'id',
        },
      });

      console.log(`   ✅ Created Content`);
      console.log(`   ID: ${content.id.substring(0, 12)}...`);
      console.log(`   Type: ${content.contentType}`);
      console.log(`   Platform: ${content.platform}`);
      results.push({ step: 'Create Content', success: true, data: { contentId: content.id } });
    } else {
      console.log('   ⚠️ Skipping content creation');
      results.push({ step: 'Create Content', success: false, error: 'Product not found' });
    }
    console.log('');

    // ========================================
    // STEP 5: Create AffiliateLinkTracking
    // ========================================
    console.log('📊 STEP 5: Create Affiliate Link Tracking');
    console.log('-'.repeat(40));

    if (newProduct && brand) {
      const tracking = await prisma.affiliateLinkTracking.create({
        data: {
          productId: newProduct.id,
          brandId: brand.id,
          originalLink: newProduct.affiliateLink || '',
          trackingLink: (newProduct.affiliateLink || '') + '?utm_source=e2e_test',
          shortCode: `e2e_${Date.now().toString(36)}`,
          currentPipelineStage: 'PRODUCT_CREATED',
          pipelineHistory: JSON.stringify([
            { stage: 'PRODUCT_CREATED', timestamp: new Date().toISOString(), note: 'E2E test created' }
          ]),
          platform: 'INSTAGRAM',
          contentType: 'IMAGE',
          status: 'ACTIVE',
        },
      });

      console.log(`   ✅ Created Tracking Record`);
      console.log(`   ID: ${tracking.id.substring(0, 12)}...`);
      console.log(`   ShortCode: ${tracking.shortCode}`);
      console.log(`   Stage: ${tracking.currentPipelineStage}`);
      results.push({ step: 'Create Tracking', success: true, data: { trackingId: tracking.id } });

      // Update to next stage
      console.log('   📈 Updating to CONTENT_GENERATED stage...');
      let history = JSON.parse(tracking.pipelineHistory);
      history.push({ stage: 'CONTENT_GENERATED', timestamp: new Date().toISOString(), note: 'Content created' });

      await prisma.affiliateLinkTracking.update({
        where: { id: tracking.id },
        data: {
          currentPipelineStage: 'CONTENT_GENERATED',
          pipelineHistory: JSON.stringify(history),
        },
      });
      console.log('   ✅ Stage updated');
    }
    console.log('');

    // ========================================
    // STEP 6: Create Distribution Queue Item
    // ========================================
    console.log('📨 STEP 6: Create Distribution Queue');
    console.log('-'.repeat(40));

    if (newProduct && brand) {
      const distribution = await prisma.distributionQueue.create({
        data: {
          brandId: brand.id,
          productId: newProduct.id,
          contentType: 'IMAGE',
          platform: 'INSTAGRAM',
          provider: 'DALL_E',
          caption: 'E2E Test Distribution Caption',
          hashtags: '#test #distribution',
          status: 'DRAFT',
          approvalStatus: 'PENDING',
          affiliateLink: newProduct.affiliateLink,
          trackingLink: (newProduct.affiliateLink || '') + '?utm_source=e2e_test',
        },
      });

      console.log(`   ✅ Created Distribution Item`);
      console.log(`   ID: ${distribution.id.substring(0, 12)}...`);
      console.log(`   Platform: ${distribution.platform}`);
      console.log(`   Status: ${distribution.status}`);
      results.push({ step: 'Create Distribution', success: true, data: { distributionId: distribution.id } });

      // Update tracking to DISTRIBUTED
      console.log('   📈 Updating tracking to DISTRIBUTED stage...');
      const trackingRecord = await prisma.affiliateLinkTracking.findFirst({
        where: { shortCode: { startsWith: 'e2e_' } },
        orderBy: { createdAt: 'desc' }
      });

      if (trackingRecord) {
        let history = JSON.parse(trackingRecord.pipelineHistory);
        history.push({ stage: 'DISTRIBUTED', timestamp: new Date().toISOString(), note: 'Distribution created' });

        await prisma.affiliateLinkTracking.update({
          where: { id: trackingRecord.id },
          data: {
            currentPipelineStage: 'DISTRIBUTED',
            pipelineHistory: JSON.stringify(history),
            distributionId: distribution.id,
          },
        });
        console.log('   ✅ Tracking updated');
      }
    }
    console.log('');

    // ========================================
    // STEP 7: Record Click Event
    // ========================================
    console.log('👆 STEP 7: Record Click Event');
    console.log('-'.repeat(40));

    const trackingRecord = await prisma.affiliateLinkTracking.findFirst({
      where: { shortCode: { startsWith: 'e2e_' } }
    });

    if (trackingRecord) {
      const event = await prisma.linkEventLog.create({
        data: {
          trackingId: trackingRecord.id,
          eventType: 'CLICK',
          ipAddress: '192.168.1.100',
          userAgent: 'E2E Test Bot',
        },
      });

      console.log(`   ✅ Created Click Event`);
      console.log(`   ID: ${event.id.substring(0, 12)}...`);
      console.log(`   Type: ${event.eventType}`);

      // Update tracking stats
      await prisma.affiliateLinkTracking.update({
        where: { id: trackingRecord.id },
        data: {
          clicks: { increment: 1 },
          uniqueClicks: { increment: 1 },
          lastClickedAt: new Date(),
        },
      });

      console.log('   ✅ Updated tracking stats');
      results.push({ step: 'Record Click', success: true, data: { eventId: event.id } });
    }
    console.log('');

    // ========================================
    // STEP 8: Update to ACTIVE stage
    // ========================================
    console.log('🟢 STEP 8: Update to ACTIVE stage');
    console.log('-'.repeat(40));

    if (trackingRecord) {
      let history = JSON.parse(trackingRecord.pipelineHistory);
      history.push({ stage: 'ACTIVE', timestamp: new Date().toISOString(), note: 'Link activated' });

      await prisma.affiliateLinkTracking.update({
        where: { id: trackingRecord.id },
        data: {
          currentPipelineStage: 'ACTIVE',
          pipelineHistory: JSON.stringify(history),
        },
      });

      console.log(`   ✅ Tracking stage updated to ACTIVE`);
      results.push({ step: 'Update to ACTIVE', success: true });
    }
    console.log('');

    // ========================================
    // STEP 9: Final State Check
    // ========================================
    console.log('📋 STEP 9: Final State Check');
    console.log('-'.repeat(40));

    const finalProducts = await prisma.product.count();
    const finalContent = await prisma.content.count();
    const finalDistribution = await prisma.distributionQueue.count();
    const finalTracking = await prisma.affiliateLinkTracking.count();
    const finalEvents = await prisma.linkEventLog.count();

    console.log(`   Products: ${initialProducts} → ${finalProducts} (${finalProducts - initialProducts > 0 ? '+' : ''}${finalProducts - initialProducts})`);
    console.log(`   Content: ${initialContent} → ${finalContent} (${finalContent - initialContent > 0 ? '+' : ''}${finalContent - initialContent})`);
    console.log(`   Distribution: ${initialDistribution} → ${finalDistribution} (${finalDistribution - initialDistribution > 0 ? '+' : ''}${finalDistribution - initialDistribution})`);
    console.log(`   Tracking: ${initialTracking} → ${finalTracking} (${finalTracking - initialTracking > 0 ? '+' : ''}${finalTracking - initialTracking})`);
    console.log(`   Events: ${initialRevenue} → ${finalEvents} (${finalEvents - initialRevenue > 0 ? '+' : ''}${finalEvents - initialRevenue})`);
    console.log('');

    // ========================================
    // STEP 10: Aggregate Stats
    // ========================================
    console.log('📈 STEP 10: Aggregate Statistics');
    console.log('-'.repeat(40));

    const allTracking = await prisma.affiliateLinkTracking.findMany();
    const stats = allTracking.reduce((acc, t) => ({
      totalClicks: acc.totalClicks + t.clicks,
      totalLeads: acc.totalLeads + t.leads,
      totalSales: acc.totalSales + t.sales,
      totalRevenue: acc.totalRevenue + t.revenue,
    }), { totalClicks: 0, totalLeads: 0, totalSales: 0, totalRevenue: 0 });

    console.log(`   Total Links: ${allTracking.length}`);
    console.log(`   Total Clicks: ${stats.totalClicks}`);
    console.log(`   Total Leads: ${stats.totalLeads}`);
    console.log(`   Total Sales: ${stats.totalSales}`);
    console.log(`   Total Revenue: Rp ${stats.totalRevenue.toLocaleString('id-ID')}`);

    // By stage
    const byStage: Record<string, number> = {};
    for (const t of allTracking) {
      byStage[t.currentPipelineStage] = (byStage[t.currentPipelineStage] || 0) + 1;
    }
    console.log('   By Stage:', byStage);

    // By platform
    const byPlatform: Record<string, number> = {};
    for (const t of allTracking) {
      if (t.platform) {
        byPlatform[t.platform] = (byPlatform[t.platform] || 0) + 1;
      }
    }
    console.log('   By Platform:', byPlatform);
    console.log('');

    // ========================================
    // Results Summary
    // ========================================
    console.log('═'.repeat(60));
    console.log('   TEST RESULTS SUMMARY');
    console.log('═'.repeat(60));
    console.log('');

    let passed = 0;
    let failed = 0;

    for (const result of results) {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.step}`);
      if (!result.success) {
        console.log(`   └─ Error: ${result.error}`);
        failed++;
      } else {
        passed++;
      }
    }

    console.log('');
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log('');

    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! 🎉');
    } else {
      console.log('⚠️ SOME TESTS FAILED');
    }

    console.log('');
    console.log('═'.repeat(60));

  } catch (error: any) {
    console.error('❌ Test execution failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();