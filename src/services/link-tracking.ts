// ============================================
// AFFILIATE LINK TRACKING SERVICE
// Unified tracking from creation to conversion
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// TYPES
// ============================================

export type PipelineStage = 
  | 'PRODUCT_CREATED' 
  | 'CONTENT_GENERATED' 
  | 'APPROVED' 
  | 'DISTRIBUTED' 
  | 'POSTED' 
  | 'ACTIVE' 
  | 'PAUSED' 
  | 'EXPIRED';

export type EventType = 'CLICK' | 'LEAD' | 'SALE' | 'STAGE_CHANGE' | 'STATUS_CHANGE';

export interface CreateTrackingInput {
  productId?: string;
  contentId?: string;
  distributionId?: string;
  brandId?: string;
  originalLink: string;
  trackingLink?: string;
  shortCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  platform?: string;
  contentType?: string;
  provider?: string;
}

export interface RecordEventInput {
  trackingId: string;
  eventType: EventType;
  revenue?: number;
  commission?: number;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  country?: string;
  device?: string;
  metadata?: Record<string, unknown>;
}

export interface TrackingStats {
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  revenue: number;
  commission: number;
  conversionRate: number;
}

export interface TrackedLink {
  id: string;
  productId: string | null;
  contentId: string | null;
  distributionId: string | null;
  brandId: string | null;
  originalLink: string;
  trackingLink: string | null;
  shortCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  currentPipelineStage: string;
  pipelineHistory: PipelineStageEntry[];
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  revenue: number;
  commission: number;
  conversionRate: number;
  platform: string | null;
  contentType: string | null;
  provider: string | null;
  postUrl: string | null;
  postId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  product?: {
    id: string;
    name: string;
    slug: string;
    price: number;
    commissionAmount: number;
  } | null;
  brand?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  eventLogs?: LinkEventLogItem[];
}

export interface PipelineStageEntry {
  stage: PipelineStage;
  timestamp: string;
  note?: string;
}

export interface LinkEventLogItem {
  id: string;
  eventType: string;
  eventDate: Date;
  revenue: number;
  commission: number;
  ipAddress: string | null;
  userAgent: string | null;
  country: string | null;
  device: string | null;
}

// ============================================
// SERVICE FUNCTIONS
// ============================================

/**
 * Create a new tracking record
 * Called when distribution is created or product is added
 */
export async function createTrackingRecord(
  input: CreateTrackingInput
): Promise<{ success: boolean; tracking?: TrackedLink; error?: string }> {
  try {
    // Validate required fields
    if (!input.originalLink) {
      return { success: false, error: 'Original link is required' };
    }

    // Check for existing tracking by distributionId
    if (input.distributionId) {
      const existing = await prisma.affiliateLinkTracking.findFirst({
        where: { distributionId: input.distributionId },
      });
      if (existing) {
        return { success: false, error: 'Tracking record already exists for this distribution' };
      }
    }

    // Check for existing tracking by shortCode
    if (input.shortCode) {
      const existing = await prisma.affiliateLinkTracking.findFirst({
        where: { shortCode: input.shortCode },
      });
      if (existing) {
        return { success: false, error: 'Short code already exists' };
      }
    }

    // Initial pipeline stage based on input
    let initialStage: PipelineStage = 'PRODUCT_CREATED';
    if (input.distributionId) {
      initialStage = 'DISTRIBUTED';
    } else if (input.contentId) {
      initialStage = 'CONTENT_GENERATED';
    }

    const pipelineHistory: PipelineStageEntry[] = [{
      stage: initialStage,
      timestamp: new Date().toISOString(),
      note: 'Tracking record created',
    }];

    // Create the tracking record
    const tracking = await prisma.affiliateLinkTracking.create({
      data: {
        productId: input.productId,
        contentId: input.contentId,
        distributionId: input.distributionId,
        brandId: input.brandId,
        originalLink: input.originalLink,
        trackingLink: input.trackingLink,
        shortCode: input.shortCode,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        currentPipelineStage: initialStage,
        pipelineHistory: JSON.stringify(pipelineHistory),
        platform: input.platform,
        contentType: input.contentType,
        provider: input.provider,
        status: 'ACTIVE',
      },
    });

    // Log the creation event
    await prisma.linkEventLog.create({
      data: {
        trackingId: tracking.id,
        eventType: 'STAGE_CHANGE',
        metadata: JSON.stringify({ stage: initialStage, note: 'Tracking created' }),
      },
    });

    return { success: true, tracking: await getTrackingRecord(tracking.id) };
  } catch (error: any) {
    console.error('[LinkTracking] Error creating tracking:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update pipeline stage as content moves through the pipeline
 */
export async function updatePipelineStage(
  trackingId: string,
  newStage: PipelineStage,
  note?: string
): Promise<{ success: boolean; tracking?: TrackedLink; error?: string }> {
  try {
    const tracking = await prisma.affiliateLinkTracking.findUnique({
      where: { id: trackingId },
    });

    if (!tracking) {
      return { success: false, error: 'Tracking record not found' };
    }

    // Parse existing pipeline history
    let pipelineHistory: PipelineStageEntry[] = [];
    try {
      pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
    } catch {
      pipelineHistory = [];
    }

    // Add new stage entry
    const stageEntry: PipelineStageEntry = {
      stage: newStage,
      timestamp: new Date().toISOString(),
      note,
    };
    pipelineHistory.push(stageEntry);

    // Update tracking record
    const updated = await prisma.affiliateLinkTracking.update({
      where: { id: trackingId },
      data: {
        currentPipelineStage: newStage,
        pipelineHistory: JSON.stringify(pipelineHistory),
        // Update post-related fields when reaching POSTED stage
        ...(newStage === 'POSTED' && tracking.trackingLink ? {
          postUrl: tracking.trackingLink,
        } : {}),
      },
    });

    // Log stage change
    await prisma.linkEventLog.create({
      data: {
        trackingId,
        eventType: 'STAGE_CHANGE',
        metadata: JSON.stringify({ stage: newStage, note }),
      },
    });

    return { success: true, tracking: await getTrackingRecord(updated.id) };
  } catch (error: any) {
    console.error('[LinkTracking] Error updating stage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Record an event (click, lead, sale)
 */
export async function recordEvent(
  input: RecordEventInput
): Promise<{ success: boolean; event?: unknown; error?: string }> {
  try {
    const tracking = await prisma.affiliateLinkTracking.findUnique({
      where: { id: input.trackingId },
    });

    if (!tracking) {
      return { success: false, error: 'Tracking record not found' };
    }

    // Create the event log
    const event = await prisma.linkEventLog.create({
      data: {
        trackingId: input.trackingId,
        eventType: input.eventType,
        revenue: input.revenue || 0,
        commission: input.commission || 0,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        referer: input.referer,
        country: input.country,
        device: input.device,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      },
    });

    // Update cumulative stats based on event type
    const updateData: Record<string, unknown> = {
      lastClickedAt: new Date(),
    };

    switch (input.eventType) {
      case 'CLICK':
        updateData.clicks = { increment: 1 };
        // Check for unique click (first click from this IP/user agent combo)
        const isUnique = await checkUniqueClick(input.trackingId, input.ipAddress);
        if (isUnique) {
          updateData.uniqueClicks = { increment: 1 };
        }
        break;
      case 'LEAD':
        updateData.leads = { increment: 1 };
        break;
      case 'SALE':
        updateData.sales = { increment: 1 };
        updateData.revenue = { increment: input.revenue || 0 };
        updateData.commission = { increment: input.commission || 0 };
        // Update conversion rate
        const newSales = tracking.sales + 1;
        const totalClicks = tracking.clicks + 1; // Approximate since we just incremented
        updateData.conversionRate = totalClicks > 0 ? newSales / totalClicks : 0;
        break;
    }

    await prisma.affiliateLinkTracking.update({
      where: { id: input.trackingId },
      data: updateData,
    });

    // Also update DistributionQueue if linked
    if (tracking.distributionId) {
      await updateDistributionStats(tracking.distributionId, input);
    }

    return { success: true, event };
  } catch (error: any) {
    console.error('[LinkTracking] Error recording event:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if this is a unique click (first from this IP)
 */
async function checkUniqueClick(trackingId: string, ipAddress?: string): Promise<boolean> {
  if (!ipAddress) return false;

  // Check if this IP has clicked this tracking link before
  const existingClick = await prisma.linkEventLog.findFirst({
    where: {
      trackingId,
      eventType: 'CLICK',
      ipAddress,
    },
    orderBy: { eventDate: 'desc' },
  });

  // If no previous click from this IP, it is unique
  // Also check if last click was more than 30 minutes ago (to count repeat visitors)
  if (!existingClick) return true;
  
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return existingClick.eventDate < thirtyMinutesAgo;
}

/**
 * Update distribution stats when tracking event occurs
 */
async function updateDistributionStats(distributionId: string, input: RecordEventInput): Promise<void> {
  const updateData: Record<string, unknown> = {};

  switch (input.eventType) {
    case 'CLICK':
      updateData.clicks = { increment: 1 };
      break;
    case 'LEAD':
      updateData.leads = { increment: 1 };
      break;
    case 'SALE':
      updateData.sales = { increment: 1 };
      updateData.revenue = { increment: input.revenue || 0 };
      updateData.commission = { increment: input.commission || 0 };
      break;
  }

  if (Object.keys(updateData).length > 0) {
    try {
      await prisma.distributionQueue.update({
        where: { id: distributionId },
        data: updateData as never,
      });
    } catch (error) {
      console.error('[LinkTracking] Error updating distribution stats:', error);
    }
  }
}

/**
 * Get full stats for a tracking link
 */
export async function getLinkStats(
  trackingId: string
): Promise<{ success: boolean; stats?: TrackingStats; error?: string }> {
  try {
    const tracking = await prisma.affiliateLinkTracking.findUnique({
      where: { id: trackingId },
    });

    if (!tracking) {
      return { success: false, error: 'Tracking record not found' };
    }

    return {
      success: true,
      stats: {
        clicks: tracking.clicks,
        uniqueClicks: tracking.uniqueClicks,
        leads: tracking.leads,
        sales: tracking.sales,
        revenue: tracking.revenue,
        commission: tracking.commission,
        conversionRate: tracking.conversionRate,
      },
    };
  } catch (error: any) {
    console.error('[LinkTracking] Error getting stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a single tracking record with full details
 */
export async function getTrackingRecord(
  trackingId: string
): Promise<TrackedLink | null> {
  const tracking = await prisma.affiliateLinkTracking.findUnique({
    where: { id: trackingId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          commissionAmount: true,
        },
      },
      brand: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      eventLogs: {
        orderBy: { eventDate: 'desc' },
        take: 100,
      },
    },
  });

  if (!tracking) return null;

  // Parse pipeline history
  let pipelineHistory: PipelineStageEntry[] = [];
  try {
    pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
  } catch {
    pipelineHistory = [];
  }

  return {
    ...tracking,
    pipelineHistory,
    eventLogs: tracking.eventLogs.map(e => ({
      id: e.id,
      eventType: e.eventType,
      eventDate: e.eventDate,
      revenue: e.revenue,
      commission: e.commission,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      country: e.country,
      device: e.device,
    })),
  };
}

/**
 * Get all tracking links with filters
 */
export async function getAllLinks(options?: {
  brandId?: string;
  platform?: string;
  status?: string;
  stage?: PipelineStage;
  limit?: number;
  offset?: number;
}): Promise<{ links: TrackedLink[]; total: number }> {
  const where: Record<string, unknown> = {};
  
  if (options?.brandId) where.brandId = options.brandId;
  if (options?.platform) where.platform = options.platform;
  if (options?.status) where.status = options.status;
  if (options?.stage) where.currentPipelineStage = options.stage;

  const [links, total] = await Promise.all([
    prisma.affiliateLinkTracking.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            commissionAmount: true,
          },
        },
        brand: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.affiliateLinkTracking.count({ where }),
  ]);

  return {
    links: links.map(tracking => {
      let pipelineHistory: PipelineStageEntry[] = [];
      try {
        pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
      } catch {
        pipelineHistory = [];
      }
      return {
        ...tracking,
        pipelineHistory,
      };
    }),
    total,
  };
}

/**
 * Get tracking by short code
 */
export async function getTrackingByShortCode(shortCode: string): Promise<TrackedLink | null> {
  const tracking = await prisma.affiliateLinkTracking.findUnique({
    where: { shortCode },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          commissionAmount: true,
        },
      },
      brand: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!tracking) return null;

  let pipelineHistory: PipelineStageEntry[] = [];
  try {
    pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
  } catch {
    pipelineHistory = [];
  }

  return {
    ...tracking,
    pipelineHistory,
  };
}

/**
 * Get tracking by distribution ID
 */
export async function getTrackingByDistributionId(distributionId: string): Promise<TrackedLink | null> {
  const tracking = await prisma.affiliateLinkTracking.findFirst({
    where: { distributionId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          commissionAmount: true,
        },
      },
      brand: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!tracking) return null;

  let pipelineHistory: PipelineStageEntry[] = [];
  try {
    pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
  } catch {
    pipelineHistory = [];
  }

  return {
    ...tracking,
    pipelineHistory,
  };
}

/**
 * Pause a tracking link
 */
export async function pauseLink(trackingId: string): Promise<{ success: boolean; tracking?: TrackedLink; error?: string }> {
  try {
    const tracking = await prisma.affiliateLinkTracking.findUnique({
      where: { id: trackingId },
    });

    if (!tracking) {
      return { success: false, error: 'Tracking record not found' };
    }

    const updated = await prisma.affiliateLinkTracking.update({
      where: { id: trackingId },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
      },
    });

    // Log status change
    await prisma.linkEventLog.create({
      data: {
        trackingId,
        eventType: 'STATUS_CHANGE',
        metadata: JSON.stringify({ status: 'PAUSED' }),
      },
    });

    return { success: true, tracking: await getTrackingRecord(updated.id) };
  } catch (error: any) {
    console.error('[LinkTracking] Error pausing link:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Activate a paused tracking link
 */
export async function activateLink(trackingId: string): Promise<{ success: boolean; tracking?: TrackedLink; error?: string }> {
  try {
    const tracking = await prisma.affiliateLinkTracking.findUnique({
      where: { id: trackingId },
    });

    if (!tracking) {
      return { success: false, error: 'Tracking record not found' };
    }

    if (tracking.status !== 'PAUSED') {
      return { success: false, error: 'Link is not paused' };
    }

    const updated = await prisma.affiliateLinkTracking.update({
      where: { id: trackingId },
      data: {
        status: 'ACTIVE',
        currentPipelineStage: 'ACTIVE',
      },
    });

    // Update pipeline stage
    let pipelineHistory: PipelineStageEntry[] = [];
    try {
      pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
    } catch {
      pipelineHistory = [];
    }
    pipelineHistory.push({
      stage: 'ACTIVE',
      timestamp: new Date().toISOString(),
      note: 'Link reactivated',
    });

    await prisma.affiliateLinkTracking.update({
      where: { id: trackingId },
      data: {
        pipelineHistory: JSON.stringify(pipelineHistory),
      },
    });

    // Log status change
    await prisma.linkEventLog.create({
      data: {
        trackingId,
        eventType: 'STATUS_CHANGE',
        metadata: JSON.stringify({ status: 'ACTIVE' }),
      },
    });

    return { success: true, tracking: await getTrackingRecord(updated.id) };
  } catch (error: any) {
    console.error('[LinkTracking] Error activating link:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Expire a tracking link
 */
export async function expireLink(trackingId: string): Promise<{ success: boolean; tracking?: TrackedLink; error?: string }> {
  try {
    const tracking = await prisma.affiliateLinkTracking.findUnique({
      where: { id: trackingId },
    });

    if (!tracking) {
      return { success: false, error: 'Tracking record not found' };
    }

    const updated = await prisma.affiliateLinkTracking.update({
      where: { id: trackingId },
      data: {
        status: 'EXPIRED',
        currentPipelineStage: 'EXPIRED',
        expiredAt: new Date(),
      },
    });

    // Update pipeline history
    let pipelineHistory: PipelineStageEntry[] = [];
    try {
      pipelineHistory = JSON.parse(tracking.pipelineHistory || '[]');
    } catch {
      pipelineHistory = [];
    }
    pipelineHistory.push({
      stage: 'EXPIRED',
      timestamp: new Date().toISOString(),
      note: 'Link expired',
    });

    await prisma.affiliateLinkTracking.update({
      where: { id: trackingId },
      data: {
        pipelineHistory: JSON.stringify(pipelineHistory),
      },
    });

    // Log status change
    await prisma.linkEventLog.create({
      data: {
        trackingId,
        eventType: 'STATUS_CHANGE',
        metadata: JSON.stringify({ status: 'EXPIRED' }),
      },
    });

    return { success: true, tracking: await getTrackingRecord(updated.id) };
  } catch (error: any) {
    console.error('[LinkTracking] Error expiring link:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get aggregate stats for all links or by brand
 */
export async function getAggregateStats(brandId?: string): Promise<{
  totalLinks: number;
  totalClicks: number;
  totalUniqueClicks: number;
  totalLeads: number;
  totalSales: number;
  totalRevenue: number;
  totalCommission: number;
  avgConversionRate: number;
  byStage: Record<string, number>;
  byPlatform: Record<string, { clicks: number; revenue: number }>;
}> {
  const where = brandId ? { brandId } : {};

  const [links, byStageResult, byPlatformResult] = await Promise.all([
    prisma.affiliateLinkTracking.findMany({
      where,
      select: {
        clicks: true,
        uniqueClicks: true,
        leads: true,
        sales: true,
        revenue: true,
        commission: true,
        conversionRate: true,
        currentPipelineStage: true,
        platform: true,
      },
    }),
    prisma.affiliateLinkTracking.groupBy({
      by: ['currentPipelineStage'],
      where,
      _count: true,
    }),
    prisma.affiliateLinkTracking.groupBy({
      by: ['platform'],
      where,
      _count: true,
    }),
  ]);

  // Calculate aggregates
  const totals = links.reduce(
    (acc, link) => ({
      totalClicks: acc.totalClicks + link.clicks,
      totalUniqueClicks: acc.totalUniqueClicks + link.uniqueClicks,
      totalLeads: acc.totalLeads + link.leads,
      totalSales: acc.totalSales + link.sales,
      totalRevenue: acc.totalRevenue + link.revenue,
      totalCommission: acc.totalCommission + link.commission,
      conversionSum: acc.conversionSum + link.conversionRate,
      count: acc.count + 1,
    }),
    { totalClicks: 0, totalUniqueClicks: 0, totalLeads: 0, totalSales: 0, totalRevenue: 0, totalCommission: 0, conversionSum: 0, count: 0 }
  );

  // Calculate by stage
  const byStage: Record<string, number> = {};
  for (const stage of byStageResult) {
    byStage[stage.currentPipelineStage] = stage._count;
  }

  // Calculate by platform (needs separate query for revenue)
  const byPlatform: Record<string, { clicks: number; revenue: number }> = {};
  for (const platform of byPlatformResult) {
    const platformLinks = links.filter(l => l.platform === platform.platform);
    byPlatform[platform.platform || 'UNKNOWN'] = {
      clicks: platformLinks.reduce((sum, l) => sum + l.clicks, 0),
      revenue: platformLinks.reduce((sum, l) => sum + l.revenue, 0),
    };
  }

  return {
    totalLinks: links.length,
    totalClicks: totals.totalClicks,
    totalUniqueClicks: totals.totalUniqueClicks,
    totalLeads: totals.totalLeads,
    totalSales: totals.totalSales,
    totalRevenue: totals.totalRevenue,
    totalCommission: totals.totalCommission,
    avgConversionRate: totals.count > 0 ? totals.conversionSum / totals.count : 0,
    byStage,
    byPlatform,
  };
}

/**
 * Generate a short code for a tracking link
 */
export function generateShortCode(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}
