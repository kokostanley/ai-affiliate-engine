// ============================================
// REVENUE TRACKING SERVICE
// Track clicks, leads, sales, and commissions
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface RevenueEventInput {
  distributionId: string;
  brandId: string;
  productId?: string;
  eventType: 'CLICK' | 'LEAD' | 'SALE' | 'COMMISSION_PAID';
  revenue?: number;
  commission?: number;
  quantity?: number;
  platform?: string;
  socialAccountId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  country?: string;
  device?: string;
}

export interface RevenueStats {
  brandId: string;
  brandName: string;
  period: string;
  postsCount: number;
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  revenue: number;
  commission: number;
  estimatedCommission: number;
  conversionRate: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    clicks: number;
    sales: number;
    revenue: number;
  }>;
  topPlatforms: Array<{
    platform: string;
    posts: number;
    clicks: number;
    revenue: number;
  }>;
}

/**
 * Record a revenue event
 */
export async function recordRevenueEvent(input: RevenueEventInput): Promise<{
  success: boolean;
  eventId?: string;
  error?: string;
}> {
  try {
    const event = await prisma.revenueEvent.create({
      data: {
        distributionId: input.distributionId,
        brandId: input.brandId,
        productId: input.productId,
        eventType: input.eventType,
        revenue: input.revenue || 0,
        commission: input.commission || 0,
        quantity: input.quantity || 1,
        platform: input.platform,
        socialAccountId: input.socialAccountId,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        referer: input.referer,
        country: input.country,
        device: input.device,
      },
    });

    // Update distribution queue stats
    if (input.distributionId) {
      await updateDistributionRevenue(input.distributionId, input.eventType, input.revenue, input.commission);
    }

    return { success: true, eventId: event.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Update distribution queue with revenue data
 */
async function updateDistributionRevenue(
  distributionId: string,
  eventType: string,
  revenue?: number,
  commission?: number
): Promise<void> {
  const updateData: any = {};

  switch (eventType) {
    case 'CLICK':
      updateData.clicks = { increment: 1 };
      break;
    case 'LEAD':
      updateData.leads = { increment: 1 };
      break;
    case 'SALE':
      updateData.sales = { increment: 1 };
      if (revenue) updateData.revenue = { increment: revenue };
      if (commission) updateData.commission = { increment: commission };
      break;
    case 'COMMISSION_PAID':
      if (commission) updateData.commission = { increment: commission };
      break;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.distributionQueue.update({
      where: { id: distributionId },
      data: updateData,
    });
  }
}

/**
 * Record a click from a distribution link
 */
export async function recordClick(
  distributionId: string,
  brandId: string,
  data?: {
    ipAddress?: string;
    userAgent?: string;
    referer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  }
): Promise<{ success: boolean; isUnique: boolean }> {
  try {
    // Check for unique click (same IP in last 24 hours)
    const recentClick = await prisma.revenueEvent.findFirst({
      where: {
        distributionId,
        eventType: 'CLICK',
        ipAddress: data?.ipAddress,
        eventDate: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    const isUnique = !recentClick;

    // Record the click event
    await recordRevenueEvent({
      distributionId,
      brandId,
      eventType: 'CLICK',
      ipAddress: data?.ipAddress,
      userAgent: data?.userAgent,
      referer: data?.referer,
      utmSource: data?.utmSource,
      utmMedium: data?.utmMedium,
      utmCampaign: data?.utmCampaign,
    });

    // Update unique clicks if unique
    if (isUnique) {
      await prisma.distributionQueue.update({
        where: { id: distributionId },
        data: { uniqueClicks: { increment: 1 } },
      });
    }

    return { success: true, isUnique };
  } catch (error: any) {
    return { success: false, isUnique: false };
  }
}

/**
 * Record a sale/conversion
 */
export async function recordSale(
  distributionId: string,
  brandId: string,
  productId: string,
  revenue: number,
  commissionRate: number = 10
): Promise<{ success: boolean; commission: number }> {
  const commission = revenue * (commissionRate / 100);

  await recordRevenueEvent({
    distributionId,
    brandId,
    productId,
    eventType: 'SALE',
    revenue,
    commission,
    quantity: 1,
  });

  // Update conversion rate
  const dist = await prisma.distributionQueue.findUnique({
    where: { id: distributionId },
  });

  if (dist && dist.clicks > 0) {
    const conversionRate = (dist.sales + 1) / dist.clicks;
    await prisma.distributionQueue.update({
      where: { id: distributionId },
      data: { conversionRate },
    });
  }

  return { success: true, commission };
}

/**
 * Get revenue stats for a brand
 */
export async function getBrandRevenueStats(
  brandId: string,
  period: 'TODAY' | 'WEEK' | 'MONTH' | 'ALL' = 'MONTH'
): Promise<RevenueStats> {
  const brand = await prisma.brand.findFirst({
    where: { OR: [{ id: brandId }, { slug: brandId }] },
  });

  if (!brand) {
    throw new Error('Brand not found');
  }

  console.log(`[Revenue] Getting stats for brand ${brand.id}, period ${period}`);

  // Calculate date range
  let startDate = new Date(0);
  const now = new Date();

  switch (period) {
    case 'TODAY':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'WEEK':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'MONTH':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  console.log(`[Revenue] Date range: ${startDate.toISOString()} to ${now.toISOString()}`);

  // Get revenue events
  const events = await prisma.revenueEvent.findMany({
    where: {
      brandId: brand.id,
      eventDate: { gte: startDate },
    },
  });

  console.log(`[Revenue] Found ${events.length} events`);

  // Aggregate stats
  const stats = {
    clicks: 0,
    uniqueClicks: 0,
    leads: 0,
    sales: 0,
    revenue: 0,
    commission: 0,
  };

  for (const event of events) {
    switch (event.eventType) {
      case 'CLICK':
        stats.clicks++;
        break;
      case 'LEAD':
        stats.leads++;
        break;
      case 'SALE':
        stats.sales++;
        stats.revenue += event.revenue;
        stats.commission += event.commission;
        break;
    }
  }

  // Get posts count - ONLY count POSTED_CONFIRMED, not drafts
  const postsCount = await prisma.distributionQueue.count({
    where: {
      brandId: brand.id,
      status: 'POSTED_CONFIRMED',
      postedAt: { gte: startDate },
    },
  });

  // Calculate estimated commission for clicks without sales
  const estimatedCommission = stats.commission + (stats.clicks * 0.01); // Rough estimate

  // Get top products
  const productStats = await getProductRevenueStats(brand.id, startDate);

  // Get platform breakdown
  const platformStats = await getPlatformRevenueStats(brand.id, startDate);

  return {
    brandId: brand.id,
    brandName: brand.name,
    period,
    postsCount,
    clicks: stats.clicks,
    uniqueClicks: stats.uniqueClicks,
    leads: stats.leads,
    sales: stats.sales,
    revenue: stats.revenue,
    commission: stats.commission,
    estimatedCommission,
    conversionRate: stats.clicks > 0 ? stats.sales / stats.clicks : 0,
    topProducts: productStats,
    topPlatforms: platformStats,
  } as RevenueStats;
}

/**
 * Get product-level revenue stats
 */
async function getProductRevenueStats(brandId: string, startDate: Date): Promise<Array<{
  productId: string;
  productName: string;
  clicks: number;
  sales: number;
  revenue: number;
}>> {
  const events = await prisma.revenueEvent.findMany({
    where: {
      brandId,
      eventDate: { gte: startDate },
      productId: { not: null },
    },
  });

  // Aggregate by product
  const productMap = new Map<string, any>();

  for (const event of events) {
    if (!event.productId) continue;

    if (!productMap.has(event.productId)) {
      productMap.set(event.productId, {
        productId: event.productId,
        productName: 'Product',
        clicks: 0,
        sales: 0,
        revenue: 0,
      });
    }

    const stats = productMap.get(event.productId);
    if (event.eventType === 'CLICK') stats.clicks++;
    if (event.eventType === 'SALE') {
      stats.sales++;
      stats.revenue += event.revenue;
    }
  }

  return Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}

/**
 * Get platform-level revenue stats
 */
async function getPlatformRevenueStats(brandId: string, startDate: Date): Promise<Array<{
  platform: string;
  posts: number;
  clicks: number;
  revenue: number;
}>> {
  const events = await prisma.revenueEvent.findMany({
    where: {
      brandId,
      eventDate: { gte: startDate },
    },
  });

  const posts = await prisma.distributionQueue.findMany({
    where: {
      brandId,
      status: 'POSTED_CONFIRMED', // Only count confirmed posts, not drafts
      postedAt: { gte: startDate },
    },
  });

  // Aggregate by platform
  const platformMap = new Map<string, any>();

  for (const post of posts) {
    if (!platformMap.has(post.platform)) {
      platformMap.set(post.platform, {
        platform: post.platform,
        posts: 0,
        clicks: 0,
        revenue: 0,
      });
    }
    platformMap.get(post.platform).posts++;
  }

  for (const event of events) {
    if (!event.platform) continue;

    if (!platformMap.has(event.platform)) {
      platformMap.set(event.platform, {
        platform: event.platform,
        posts: 0,
        clicks: 0,
        revenue: 0,
      });
    }

    const stats = platformMap.get(event.platform);
    if (event.eventType === 'CLICK') stats.clicks++;
    if (event.eventType === 'SALE') stats.revenue += event.revenue;
  }

  return Array.from(platformMap.values())
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Get distribution-level revenue stats
 */
export async function getDistributionRevenue(distributionId: string): Promise<{
  distributionId: string;
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  revenue: number;
  commission: number;
  conversionRate: number;
  events: Array<{
    eventType: string;
    count: number;
    totalRevenue: number;
    totalCommission: number;
  }>;
}> {
  const dist = await prisma.distributionQueue.findUnique({
    where: { id: distributionId },
  });

  if (!dist) {
    throw new Error('Distribution not found');
  }

  const events = await prisma.revenueEvent.groupBy({
    by: ['eventType'],
    where: { distributionId },
    _count: true,
    _sum: {
      revenue: true,
      commission: true,
    },
  });

  return {
    distributionId,
    clicks: dist.clicks,
    uniqueClicks: dist.uniqueClicks,
    leads: dist.leads,
    sales: dist.sales,
    revenue: dist.revenue,
    commission: dist.commission,
    conversionRate: dist.conversionRate,
    events: events.map(e => ({
      eventType: e.eventType,
      count: e._count,
      totalRevenue: e._sum.revenue || 0,
      totalCommission: e._sum.commission || 0,
    })),
  };
}

/**
 * Get all brands revenue summary
 */
export async function getAllBrandsRevenue(
  period: 'TODAY' | 'WEEK' | 'MONTH' = 'MONTH'
): Promise<RevenueStats[]> {
  const brands = await prisma.brand.findMany();

  const results: RevenueStats[] = [];

  for (const brand of brands) {
    try {
      const stats = await getBrandRevenueStats(brand.id, period);
      results.push(stats);
    } catch (error) {
      // Skip brands with errors
    }
  }

  return results;
}

/**
 * Update estimated commission for all distributions
 */
export async function updateEstimatedCommissions(): Promise<{ updated: number }> {
  const distributions = await prisma.distributionQueue.findMany({
    where: {
      status: 'POSTED_CONFIRMED', // Only update confirmed posts
      clicks: { gt: 0 },
    },
  });

  let updated = 0;

  for (const dist of distributions) {
    // Estimate based on typical conversion rate and commission
    const estimatedCommission = dist.clicks * 0.01 *0.1; // 1% conversion, 10% commission

    if (dist.estimatedCommission !== estimatedCommission) {
      await prisma.distributionQueue.update({
        where: { id: dist.id },
        data: { estimatedCommission },
      });
      updated++;
    }
  }

  return { updated };
}
