// ============================================
// DEBUG BRAND REVENUE STATS
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const brands = await prisma.brand.findMany();

  for (const brand of brands) {
    console.log(`\nBrand: ${brand.name} (${brand.id})`);

    // Check date range
    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    console.log(` Date range: ${startDate.toISOString()} to ${now.toISOString()}`);

    // Get events
    const events = await prisma.revenueEvent.findMany({
      where: {
        brandId: brand.id,
        eventDate: { gte: startDate },
      },
    });

    console.log(` Events in range: ${events.length}`);

    // Show event dates
    const eventDates = events.map(e => new Date(e.eventDate).toISOString());
    console.log(` Sample dates: ${eventDates.slice(0, 3).join(', ')}`);

    // Calculate aggregates manually
    let clicks = 0, sales = 0, revenue = 0;
    for (const e of events) {
      if (e.eventType === 'CLICK') clicks++;
      if (e.eventType === 'SALE') {
        sales++;
        revenue += e.revenue;
      }
    }
    console.log(` Manual calc - Clicks: ${clicks}, Sales: ${sales}, Revenue: ${revenue}`);

    // Also check distribution queue directly
    const dists = await prisma.distributionQueue.findMany({
      where: { brandId: brand.id, status: 'POSTED' },
    });
    console.log(` Distributions: ${dists.length}`);
    for (const d of dists) {
      console.log(`   clicks=${d.clicks}, sales=${d.sales}, revenue=${d.revenue}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());