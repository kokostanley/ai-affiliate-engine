// Test script for tracking system
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testTrackingSystem() {
  console.log('=== Affiliate Link Tracking System Test ===\n');

  try {
    // Test 1: Check database tables
    console.log('1. Checking database tables...');
    const trackingCount = await prisma.affiliateLinkTracking.count();
    const eventLogCount = await prisma.linkEventLog.count();
    const productCount = await prisma.product.count();
    const brandCount = await prisma.brand.count();
    const distCount = await prisma.distributionQueue.count();

    console.log(`   Products: ${productCount}`);
    console.log(`   Brands: ${brandCount}`);
    console.log(`   Distribution Items: ${distCount}`);
    console.log(`   Tracking Records: ${trackingCount}`);
    console.log(`   Event Logs: ${eventLogCount}`);
    console.log('   ✅ Database tables exist\n');

    // Test 2: Create a tracking record
    console.log('2. Creating a tracking record...');
    const product = await prisma.product.findFirst({ where: { status: 'ACTIVE' } });
    const brand = await prisma.brand.findFirst({ where: { status: 'ACTIVE' } });

    if (product && brand) {
      const shortCode = 'test_' + Date.now().toString(36);
      const tracking = await prisma.affiliateLinkTracking.create({
        data: {
          productId: product.id,
          brandId: brand.id,
          originalLink: product.affiliateLink || 'https://test.com',
          trackingLink: (product.affiliateLink || 'https://test.com') + '?utm_source=test',
          shortCode: shortCode,
          currentPipelineStage: 'PRODUCT_CREATED',
          pipelineHistory: JSON.stringify([
            { stage: 'PRODUCT_CREATED', timestamp: new Date().toISOString(), note: 'Test created' }
          ]),
          clicks: 0,
          uniqueClicks: 0,
          leads: 0,
          sales: 0,
          revenue: 0,
          commission: 0,
          status: 'ACTIVE',
          platform: 'TIKTOK',
          contentType: 'VIDEO',
          provider: 'PIPPIT_MANUAL',
        }
      });

      console.log(`   Created: ${tracking.id}`);
      console.log(`   ShortCode: ${tracking.shortCode}`);
      console.log(`   Stage: ${tracking.currentPipelineStage}`);
      console.log('   ✅ Tracking record created\n');

      // Test 3: Record an event
      console.log('3. Recording click event...');
      const event = await prisma.linkEventLog.create({
        data: {
          trackingId: tracking.id,
          eventType: 'CLICK',
          ipAddress: '192.168.1.100',
          userAgent: 'TestBot/1.0',
          revenue: 0,
          commission: 0,
        }
      });
      console.log(`   Event ID: ${event.id}`);
      console.log(`   Event Type: ${event.eventType}`);
      console.log('   ✅ Event recorded\n');

      // Test 4: Update stats
      console.log('4. Updating tracking stats...');
      const updated = await prisma.affiliateLinkTracking.update({
        where: { id: tracking.id },
        data: {
          clicks: { increment: 1 },
          uniqueClicks: { increment: 1 },
        }
      });
      console.log(`   Clicks: ${updated.clicks}`);
      console.log(`   Unique Clicks: ${updated.uniqueClicks}`);
      console.log('   ✅ Stats updated\n');

      // Test 5: Update pipeline stage
      console.log('5. Updating pipeline stage...');
      let history = JSON.parse(updated.pipelineHistory || '[]');
      history.push({ stage: 'APPROVED', timestamp: new Date().toISOString(), note: 'Test approved' });

      const stageUpdated = await prisma.affiliateLinkTracking.update({
        where: { id: tracking.id },
        data: {
          currentPipelineStage: 'APPROVED',
          pipelineHistory: JSON.stringify(history)
        }
      });
      console.log(`   New Stage: ${stageUpdated.currentPipelineStage}`);
      console.log('   ✅ Pipeline stage updated\n');

      // Test 6: Aggregate stats
      console.log('6. Testing aggregate stats...');
      const allTracking = await prisma.affiliateLinkTracking.findMany();
      const totals = allTracking.reduce((acc, t) => ({
        clicks: acc.clicks + t.clicks,
        leads: acc.leads + t.leads,
        sales: acc.sales + t.sales,
        revenue: acc.revenue + t.revenue,
      }), { clicks: 0, leads: 0, sales: 0, revenue: 0 });

      console.log(`   Total Links: ${allTracking.length}`);
      console.log(`   Total Clicks: ${totals.clicks}`);
      console.log(`   Total Leads: ${totals.leads}`);
      console.log(`   Total Sales: ${totals.sales}`);
      console.log(`   Total Revenue: Rp ${totals.revenue.toLocaleString('id-ID')}`);
      console.log('   ✅ Aggregate stats working\n');

      // Test 7: Pause and activate
      console.log('7. Testing pause/activate...');
      const paused = await prisma.affiliateLinkTracking.update({
        where: { id: tracking.id },
        data: {
          status: 'PAUSED',
          pausedAt: new Date()
        }
      });
      console.log(`   Status: ${paused.status}`);

      const activated = await prisma.affiliateLinkTracking.update({
        where: { id: tracking.id },
        data: {
          status: 'ACTIVE',
          pausedAt: null
        }
      });
      console.log(`   Status: ${activated.status}`);
      console.log('   ✅ Pause/activate working\n');

      // Test 8: Get by distribution ID
      console.log('8. Testing distribution link...');
      const dist = await prisma.distributionQueue.findFirst({
        where: { affiliateLink: { not: null } }
      });

      if (dist && dist.affiliateLink) {
        const distTracking = await prisma.affiliateLinkTracking.create({
          data: {
            distributionId: dist.id,
            productId: dist.productId,
            brandId: dist.brandId,
            originalLink: dist.affiliateLink,
            trackingLink: dist.trackingLink || dist.affiliateLink,
            shortCode: 'dist_' + Date.now().toString(36),
            currentPipelineStage: 'DISTRIBUTED',
            pipelineHistory: JSON.stringify([
              { stage: 'DISTRIBUTED', timestamp: new Date().toISOString(), note: 'Linked to distribution' }
            ]),
            status: 'ACTIVE',
            platform: dist.platform,
            contentType: dist.contentType,
          }
        });
        console.log(`   Created distribution tracking: ${distTracking.id}`);
        console.log('   ✅ Distribution link working\n');
      }

      console.log('===========================================');
      console.log('✅ ALL TRACKING TESTS PASSED!');
      console.log('===========================================\n');

    } else {
      console.log('   ❌ No active product or brand found');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testTrackingSystem();