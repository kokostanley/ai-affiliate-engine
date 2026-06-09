// ============================================
// AFFILIATE LINK GENERATION SERVICE
// Generates tracking links for distribution
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface LinkGenerationOptions {
  productId?: string;
  brandId?: string;
  platform?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  customParams?: Record<string, string>;
}

export interface GeneratedLink {
  affiliateLink: string;
  trackingLink: string;
  shortCode?: string;
}

// UTM parameter mappings for platforms
const UTM_PLATFORM_MAP: Record<string, { source: string; medium: string }> = {
  TIKTOK: { source: 'tiktok', medium: 'social' },
  INSTAGRAM: { source: 'instagram', medium: 'social' },
  FACEBOOK: { source: 'facebook', medium: 'social' },
  YOUTUBE: { source: 'youtube', medium: 'video' },
  TWITTER: { source: 'twitter', medium: 'social' },
  LINKEDIN: { source: 'linkedin', medium: 'social' },
};

// Default link templates by brand
const BRAND_LINK_TEMPLATES: Record<string, string> = {
  'cepatdapat': '{affiliateLink}?utm_source={utm_source}&utm_medium={utm_medium}&utm_campaign=cepatdapat_{platform}',
  'crypto-ew': '{affiliateLink}?utm_source={utm_source}&utm_medium={utm_medium}&utm_campaign=cryptoew_{platform}',
};

/**
 * Generate affiliate link with tracking parameters
 */
export async function generateAffiliateLink(
  baseLink: string,
  options: LinkGenerationOptions
): Promise<GeneratedLink> {
  const {
    platform = 'TIKTOK',
    utmSource,
    utmMedium,
    utmCampaign,
    customParams = {},
  } = options;

  // Get platform-based UTM defaults
  const platformDefaults = UTM_PLATFORM_MAP[platform.toUpperCase()] || {
    source: 'social',
    medium: 'social',
  };

  // Build UTM parameters
  const utmParams = new URLSearchParams();
  utmParams.set('utm_source', utmSource || platformDefaults.source);
  utmParams.set('utm_medium', utmMedium || platformDefaults.medium);
  utmParams.set('utm_campaign', utmCampaign || `${platformDefaults.source}_campaign`);

  // Add custom parameters
  Object.entries(customParams).forEach(([key, value]) => {
    if (value) utmParams.set(key, value);
  });

  // Add timestamp for uniqueness
  utmParams.set('ref', Date.now().toString(36));

  // Build tracking link
  const trackingLink = `${baseLink}${baseLink.includes('?') ? '&' : '?'}${utmParams.toString()}`;

  return {
    affiliateLink: baseLink,
    trackingLink,
  };
}

/**
 * Generate links for a distribution item
 */
export async function generateDistributionLinks(
  distributionId: string
): Promise<{ success: boolean; affiliateLink?: string; trackingLink?: string; error?: string }> {
  try {
    // Get distribution item with brand and product info
    const item = await prisma.distributionQueue.findUnique({
      where: { id: distributionId },
      include: {
        brand: true,
        product: true,
      },
    });

    if (!item) {
      return { success: false, error: 'Distribution item not found' };
    }

    // Get base affiliate link from product or brand settings
    let baseLink = item.affiliateLink || item.product?.affiliateLink;

    if (!baseLink) {
      // Try to get from brand settings
      const brandSettings = item.brand?.settings ? JSON.parse(item.brand.settings) : {};
      baseLink = brandSettings.defaultAffiliateLink;

      if (!baseLink) {
        return { success: false, error: 'No affiliate link configured for this product/brand' };
      }
    }

    // Check for brand-specific template
    const brandTemplate = BRAND_LINK_TEMPLATES[item.brand.slug];

    if (brandTemplate) {
      // Use brand-specific template
      const platformDefaults = UTM_PLATFORM_MAP[item.platform.toUpperCase()] || {
        source: 'social',
        medium: 'social',
      };

      let trackingLink = brandTemplate
        .replace('{affiliateLink}', baseLink)
        .replace('{utm_source}', platformDefaults.source)
        .replace('{utm_medium}', platformDefaults.medium)
        .replace('{platform}', item.platform.toLowerCase());

      // Add timestamp for uniqueness
      trackingLink += `&ref=${Date.now().toString(36)}`;

      // Update distribution item
      await prisma.distributionQueue.update({
        where: { id: distributionId },
        data: {
          affiliateLink: baseLink,
          trackingLink,
        },
      });

      return { success: true, affiliateLink: baseLink, trackingLink };
    }

    // Use generic generation
    const result = await generateAffiliateLink(baseLink, {
      platform: item.platform,
      utmCampaign: `${item.brand.slug}_${item.platform.toLowerCase()}`,
    });

    // Update distribution item
    await prisma.distributionQueue.update({
      where: { id: distributionId },
      data: {
        affiliateLink: result.affiliateLink,
        trackingLink: result.trackingLink,
      },
    });

    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate short code for tracking
 */
export async function generateShortCode(): Promise<string> {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Get tracking stats for a distribution item
 */
export async function getTrackingStats(distributionId: string): Promise<{
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  conversionRate: number;
  revenue: number;
}> {
  const item = await prisma.distributionQueue.findUnique({
    where: { id: distributionId },
  });

  if (!item) {
    return { clicks: 0, uniqueClicks: 0, leads: 0, sales: 0, conversionRate: 0, revenue: 0 };
  }

  return {
    clicks: item.clicks,
    uniqueClicks: item.uniqueClicks,
    leads: item.leads,
    sales: item.sales,
    conversionRate: item.conversionRate,
    revenue: item.revenue,
  };
}

/**
 * Update click tracking for a distribution item
 */
export async function recordClick(
  distributionId: string,
  isUnique: boolean = false
): Promise<void> {
  const updateData: any = { clicks: { increment: 1 } };
  if (isUnique) {
    updateData.uniqueClicks = { increment: 1 };
  }

  await prisma.distributionQueue.update({
    where: { id: distributionId },
    data: updateData,
  });
}

/**
 * Update lead tracking
 */
export async function recordLead(distributionId: string): Promise<void> {
  await prisma.distributionQueue.update({
    where: { id: distributionId },
    data: { leads: { increment: 1 } },
  });

  // Create revenue event
  const item = await prisma.distributionQueue.findUnique({
    where: { id: distributionId },
    include: { brand: true, product: true },
  });

  if (item) {
    await prisma.revenueEvent.create({
      data: {
        distributionId,
        brandId: item.brandId,
        productId: item.productId || null,
        eventType: 'LEAD',
        platform: item.platform,
      },
    });
  }
}

/**
 * Update sale tracking
 */
export async function recordSale(
  distributionId: string,
  revenue: number,
  commission: number
): Promise<void> {
  const item = await prisma.distributionQueue.findUnique({
    where: { id: distributionId },
  });

  if (!item) return;

  // Update distribution item
  await prisma.distributionQueue.update({
    where: { id: distributionId },
    data: {
      sales: { increment: 1 },
      revenue: { increment: revenue },
      commission: { increment: commission },
      conversionRate: item.clicks > 0 ? (item.sales + 1) / item.clicks : 0,
    },
  });

  // Create revenue event
  await prisma.revenueEvent.create({
    data: {
      distributionId,
      brandId: item.brandId,
      productId: item.productId || null,
      eventType: 'SALE',
      revenue,
      commission,
    },
  });
}

/**
 * Format link for specific platform (add platform-specific tracking)
 */
export function formatLinkForPlatform(
  link: string,
  platform: string
): string {
  const baseParams = UTM_PLATFORM_MAP[platform.toUpperCase()];
  if (!baseParams) return link;

  // Add platform-specific tracking
  const separator = link.includes('?') ? '&' : '?';
  return `${link}${separator}pt=${platform.toLowerCase()}`;
}