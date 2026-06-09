// ============================================
// BRAND MANAGEMENT SERVICE
// Brand/project management with provider settings
// ============================================

import { PrismaClient } from '@prisma/client';
import slugify from 'slugify';

const prisma = new PrismaClient();

export interface BrandSettings {
  defaultVideoProvider: 'PIPPIT_MANUAL' | 'HIGGSFIELD_AUTO';
  defaultImageProvider: 'HIGGSFIELD' | 'DALL_E';
  autoApprove: boolean;
  maxPostsPerDay: number;
  defaultCooldownMinutes: number;
  postingHours: {
    start: number; // 0-23
    end: number;
  };
}

export interface CreateBrandInput {
  name: string;
  description?: string;
  logo?: string;
  settings?: Partial<BrandSettings>;
}

export interface BrandWithRelations {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  status: string;
  settings: BrandSettings | null;
  zernioConfigs: Array<{
    id: string;
    name: string;
    isActive: boolean;
    accountLimit: number;
  }>;
  socialAccounts: Array<{
    id: string;
    platform: string;
    accountName: string;
    status: string;
    followers: number;
  }>;
  stats: {
    totalAccounts: number;
    activeAccounts: number;
    totalPosts: number;
    pendingApprovals: number;
  };
}

/**
 * Get all brands
 */
export async function getAllBrands(): Promise<BrandWithRelations[]> {
  const brands = await prisma.brand.findMany({
    include: {
      zernioConfigs: {
        select: { id: true, name: true, isActive: true, accountLimit: true },
      },
      socialAccounts: {
        select: { id: true, platform: true, accountName: true, status: true, followers: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Get stats for each brand
  const result: BrandWithRelations[] = [];
  for (const brand of brands) {
    const [totalPosts, pendingApprovals] = await Promise.all([
      prisma.distributionQueue.count({ where: { brandId: brand.id, status: 'POSTED' } }),
      prisma.distributionQueue.count({ where: { brandId: brand.id, approvalStatus: 'PENDING' } }),
    ]);

    result.push({
      ...brand,
      settings: brand.settings ? JSON.parse(brand.settings) : null,
      stats: {
        totalAccounts: brand.socialAccounts.length,
        activeAccounts: brand.socialAccounts.filter(a => a.status === 'ACTIVE').length,
        totalPosts,
        pendingApprovals,
      },
    });
  }

  return result;
}

/**
 * Get brand by ID or slug
 */
export async function getBrandById(brandId: string): Promise<BrandWithRelations | null> {
  const brand = await prisma.brand.findFirst({
    where: {
      OR: [{ id: brandId }, { slug: brandId }],
    },
    include: {
      zernioConfigs: true,
      socialAccounts: true,
    },
  });

  if (!brand) return null;

  const [totalPosts, pendingApprovals] = await Promise.all([
    prisma.distributionQueue.count({ where: { brandId: brand.id, status: 'POSTED' } }),
    prisma.distributionQueue.count({ where: { brandId: brand.id, approvalStatus: 'PENDING' } }),
  ]);

  return {
    ...brand,
    settings: brand.settings ? JSON.parse(brand.settings) : null,
    zernioConfigs: brand.zernioConfigs,
    socialAccounts: brand.socialAccounts,
    stats: {
      totalAccounts: brand.socialAccounts.length,
      activeAccounts: brand.socialAccounts.filter(a => a.status === 'ACTIVE').length,
      totalPosts,
      pendingApprovals,
    },
  };
}

/**
 * Create a new brand
 */
export async function createBrand(input: CreateBrandInput): Promise<{ success: boolean; brand?: BrandWithRelations; error?: string }> {
  try {
    const slug = slugify(input.name, { lower: true, strict: true });

    // Check if brand exists
    const existing = await prisma.brand.findUnique({ where: { slug } });
    if (existing) {
      return { success: false, error: 'Brand with this name already exists' };
    }

    const defaultSettings: BrandSettings = {
      defaultVideoProvider: 'PIPPIT_MANUAL',
      defaultImageProvider: 'HIGGSFIELD',
      autoApprove: false,
      maxPostsPerDay: 10,
      defaultCooldownMinutes: 60,
      postingHours: { start: 9, end: 21 },
      ...input.settings,
    };

    const brand = await prisma.brand.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        logo: input.logo,
        settings: JSON.stringify(defaultSettings),
        status: 'ACTIVE',
      },
      include: {
        zernioConfigs: true,
        socialAccounts: true,
      },
    });

    return { success: true, brand: { ...brand, settings: defaultSettings, stats: { totalAccounts: 0, activeAccounts: 0, totalPosts: 0, pendingApprovals: 0 } } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Update brand settings
 */
export async function updateBrandSettings(
  brandId: string,
  settings: Partial<BrandSettings>
): Promise<{ success: boolean; brand?: BrandWithRelations; error?: string }> {
  try {
    const brand = await prisma.brand.findFirst({
      where: { OR: [{ id: brandId }, { slug: brandId }] },
    });

    if (!brand) {
      return { success: false, error: 'Brand not found' };
    }

    const currentSettings = brand.settings ? JSON.parse(brand.settings) : {};
    const newSettings = { ...currentSettings, ...settings };

    const updated = await prisma.brand.update({
      where: { id: brand.id },
      data: { settings: JSON.stringify(newSettings) },
      include: { zernioConfigs: true, socialAccounts: true },
    });

    return { success: true, brand: { ...updated, settings: newSettings, stats: { totalAccounts: 0, activeAccounts: 0, totalPosts: 0, pendingApprovals: 0 } } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Add Zernio API key to brand
 */
export async function addZernioConfig(
  brandId: string,
  name: string,
  apiKey: string,
  accountLimit?: number
): Promise<{ success: boolean; config?: any; error?: string }> {
  try {
    const brand = await prisma.brand.findFirst({
      where: { OR: [{ id: brandId }, { slug: brandId }] },
    });

    if (!brand) {
      return { success: false, error: 'Brand not found' };
    }

    // Check if name already exists for this brand
    const existing = await prisma.zernioConfig.findUnique({
      where: { brandId_name: { brandId: brand.id, name } },
    });

    if (existing) {
      return { success: false, error: 'Configuration with this name already exists' };
    }

    const config = await prisma.zernioConfig.create({
      data: {
        brandId: brand.id,
        name,
        apiKey,
        accountLimit: accountLimit || 10,
        isActive: true,
      },
    });

    return { success: true, config };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Add social account to brand
 */
export async function addSocialAccount(
  brandId: string,
  data: {
    platform: string;
    accountId: string;
    accountName: string;
    accountUsername?: string;
    avatarUrl?: string;
    followers?: number;
    zernioConfigId?: string;
  }
): Promise<{ success: boolean; account?: any; error?: string }> {
  try {
    const brand = await prisma.brand.findFirst({
      where: { OR: [{ id: brandId }, { slug: brandId }] },
    });

    if (!brand) {
      return { success: false, error: 'Brand not found' };
    }

    // Check if account already exists
    const existing = await prisma.socialAccount.findUnique({
      where: {
        brandId_platform_accountId: {
          brandId: brand.id,
          platform: data.platform,
          accountId: data.accountId,
        },
      },
    });

    if (existing) {
      return { success: false, error: 'Social account already exists for this brand' };
    }

    const account = await prisma.socialAccount.create({
      data: {
        brandId: brand.id,
        platform: data.platform,
        accountId: data.accountId,
        accountName: data.accountName,
        accountUsername: data.accountUsername,
        avatarUrl: data.avatarUrl,
        followers: data.followers || 0,
        zernioConfigId: data.zernioConfigId,
        status: 'ACTIVE',
      },
    });

    return { success: true, account };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Update social account settings
 */
export async function updateSocialAccount(
  accountId: string,
  data: {
    status?: string;
    dailyLimit?: number;
    cooldownMinutes?: number;
    priority?: number;
    zernioConfigId?: string;
  }
): Promise<{ success: boolean; account?: any; error?: string }> {
  try {
    const account = await prisma.socialAccount.update({
      where: { id: accountId },
      data,
    });

    return { success: true, account };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get brand stats
 */
export async function getBrandStats(brandId: string): Promise<{
  totalAccounts: number;
  activeAccounts: number;
  totalPosts: number;
  pendingApprovals: number;
  postedToday: number;
  failedToday: number;
}> {
  const brand = await prisma.brand.findFirst({
    where: { OR: [{ id: brandId }, { slug: brandId }] },
    include: { socialAccounts: true },
  });

  if (!brand) {
    throw new Error('Brand not found');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalPosts,
    pendingApprovals,
    postedToday,
    failedToday,
  ] = await Promise.all([
    prisma.distributionQueue.count({ where: { brandId: brand.id, status: 'POSTED' } }),
    prisma.distributionQueue.count({ where: { brandId: brand.id, approvalStatus: 'PENDING' } }),
    prisma.distributionQueue.count({
      where: { brandId: brand.id, status: 'POSTED', postedAt: { gte: today } },
    }),
    prisma.distributionQueue.count({
      where: { brandId: brand.id, status: 'FAILED', updatedAt: { gte: today } },
    }),
  ]);

  return {
    totalAccounts: brand.socialAccounts.length,
    activeAccounts: brand.socialAccounts.filter(a => a.status === 'ACTIVE').length,
    totalPosts,
    pendingApprovals,
    postedToday,
    failedToday,
  };
}

/**
 * Get accounts by platform for a brand
 */
export async function getAccountsByPlatform(brandId: string, platform: string): Promise<any[]> {
  return prisma.socialAccount.findMany({
    where: { brandId, platform, status: 'ACTIVE' },
    orderBy: [{ priority: 'desc' }, { lastPostedAt: 'asc' }],
  });
}

/**
 * Get brand settings
 */
export async function getBrandSettings(brandId: string): Promise<BrandSettings | null> {
  const brand = await prisma.brand.findFirst({
    where: { OR: [{ id: brandId }, { slug: brandId }] },
  });

  if (!brand || !brand.settings) return null;
  return JSON.parse(brand.settings);
}
