/**
 * Automation Manager Service
 * Main orchestrator for the full automation pipeline
 */

import { PrismaClient } from '@prisma/client';
import { Platform, ContentType, POVType } from '../lib/content-variations';
import { platformStrategy } from './platform-strategy';
import { contentRotator } from './content-rotator';
import { smartScheduler } from './smart-scheduler';

const prisma = new PrismaClient();

export interface ProcessOptions {
  autoApprove?: boolean;
  targetPlatform?: Platform;
  targetContentType?: ContentType;
  targetPOV?: POVType;
}

export interface PipelineResult {
  success: boolean;
  contentId?: string;
  distributionId?: string;
  queueId?: string;
  steps: string[];
  errors: string[];
  error?: string;
}

export interface AutomationStatus {
  enabled: boolean;
  postsPerDay: number;
  platforms: Platform[];
  contentTypes: ContentType[];
  postingTimes: string[];
  todayPosts: number;
  nextPostTime: Date | null;
  paused: boolean;
  pausedUntil: Date | null;
}

// Supported affiliate link patterns
const LINK_PATTERNS = {
  SHOPEE: /shopee\.co\.id|shopee\.id/i,
  TIKTOK: /tiktok\.com|vt\.tiktok/i,
};

export type DetectedPlatform = 'SHOPEE' | 'TIKTOK' | 'OTHER';

/**
 * Detect platform from affiliate link
 */
export function detectLinkPlatform(link: string): DetectedPlatform {
  if (LINK_PATTERNS.SHOPEE.test(link)) return 'SHOPEE';
  if (LINK_PATTERNS.TIKTOK.test(link)) return 'TIKTOK';
  return 'OTHER';
}

/**
 * Extract links from text
 */
export function extractLinks(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s]+/gi;
  return text.match(urlPattern) || [];
}

/**
 * Automation Manager Service
 */
export class AutomationManager {
  /**
   * Process affiliate link through full pipeline
   */
  async processLink(
    link: string,
    brandId: string,
    options: ProcessOptions = {}
  ): Promise<PipelineResult> {
    const steps: string[] = [];
    const errors: string[] = [];

    try {
      // 1. Detect and validate link
      const detected = detectLinkPlatform(link);
      if (detected === 'OTHER') {
        return { success: false, errors: ['Link tidak dikenali', 'Unsupported platform'], steps, error: 'Unsupported platform' };
      }
      steps.push(`✅ Link terdeteksi: ${detected}`);

      // 2. Get or create product
      const product = await this.getOrCreateProduct(link, detected);
      if (!product) {
        return { success: false, errors: ['Scrape gagal', 'Gagal membuat product'], steps, error: 'Gagal membuat product' };
      }
      steps.push(`✅ Product: ${product.name}`);

      // 3. Get automation config
      const config = await this.getAutomationConfig(brandId);
      const platform = options.targetPlatform || await this.selectPlatform(brandId);
      const contentType = options.targetContentType || this.selectContentType(config);
      const pov = options.targetPOV || await contentRotator.getNextPOV({
        brandId,
        productId: product.id,
        platform,
        contentType,
      });

      steps.push(`✅ Platform: ${platform}, Type: ${contentType}, POV: ${pov}`);

      // 4. Generate content with POV
      const content = await contentRotator.generatePOVContent(product, pov, platform);
      steps.push(`✅ Content generated (${pov})`);

      // 5. Create content record
      const contentRecord = await prisma.content.create({
        data: {
          productId: product.id,
          contentType,
          platform,
          hook: content.hook,
          caption: content.caption,
          hashtags: content.hashtags.join(' '),
          cta: 'Link ada di bio',
          tone: 'casual',
          status: 'GENERATED',
          approvalStatus: options.autoApprove || config.autoApprove ? 'APPROVED' : 'PENDING',
        },
      });
      steps.push(`✅ Content record created`);

      // 6. Create distribution queue item
      const distribution = await this.createDistribution({
        brandId,
        productId: product.id,
        contentId: contentRecord.id,
        platform,
        contentType,
        caption: content.caption,
        hashtags: content.hashtags,
        pov,
      });

      if (!distribution) {
        return { success: false, errors: ['Distribution failed', 'Gagal create distribution'], steps, error: 'Gagal create distribution' };
      }
      steps.push(`✅ Distribution created`);

      // 7. Queue for posting
      const queueResult = await smartScheduler.queueForPosting({
        brandId,
        productId: product.id,
        contentId: contentRecord.id,
        distributionId: distribution.id,
        platform,
        contentType,
        pov,
      });
      steps.push(`✅ Queued for posting at ${queueResult.scheduledFor.toISOString()}`);

      // 8. Log event
      await this.logEvent(brandId, 'POST_CREATED', {
        contentId: contentRecord.id,
        distributionId: distribution.id,
        queueId: queueResult.id,
        platform,
        contentType,
        pov,
      });

      return {
        success: true,
        contentId: contentRecord.id,
        distributionId: distribution.id,
        queueId: queueResult.id,
        steps,
        errors: [],
      };
    } catch (error: any) {
      console.error('[AutomationManager] Error:', error);
      return { success: false, errors: [error.message], steps, error: error.message };
    }
  }

  /**
   * Enable automation for brand
   */
  async enableAutomation(brandId: string, config?: Partial<{
    postsPerDay: number;
    platforms: string;
    contentTypes: string;
    postingTimes: string;
    autoApprove: boolean;
  }>): Promise<void> {
    await prisma.autoPostConfig.upsert({
      where: { brandId },
      create: {
        brandId,
        enabled: true,
        postsPerDay: config?.postsPerDay || 3,
        platforms: config?.platforms || 'INSTAGRAM,TIKTOK,YOUTUBE,X,THREADS',
        contentTypes: config?.contentTypes || 'IMAGE,CAROUSEL,VIDEO',
        postingTimes: config?.postingTimes || '09:00,14:00,19:00',
        autoApprove: config?.autoApprove ?? true,
      },
      update: { enabled: true },
    });

    await this.logEvent(brandId, 'AUTOMATION_ENABLED', {});
  }

  /**
   * Disable automation for brand
   */
  async disableAutomation(brandId: string): Promise<void> {
    await prisma.autoPostConfig.update({
      where: { brandId },
      data: { enabled: false },
    });

    await this.logEvent(brandId, 'AUTOMATION_DISABLED', {});
  }

  /**
   * Pause automation temporarily
   */
  async pauseAutomation(brandId: string, hours: number = 24): Promise<void> {
    const pausedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);

    await prisma.autoPostConfig.update({
      where: { brandId },
      data: { pausedUntil },
    });

    await this.logEvent(brandId, 'AUTOMATION_PAUSED', { hours, pausedUntil });
  }

  /**
   * Resume automation
   */
  async resumeAutomation(brandId: string): Promise<void> {
    await prisma.autoPostConfig.update({
      where: { brandId },
      data: { pausedUntil: null },
    });

    await this.logEvent(brandId, 'AUTOMATION_RESUMED', {});
  }

  /**
   * Get automation status
   */
  async getStatus(brandId: string): Promise<AutomationStatus> {
    const config = await prisma.autoPostConfig.findUnique({
      where: { brandId },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const todayPosts = await prisma.autoPostQueue.count({
      where: {
        brandId,
        scheduledFor: { gte: today, lt: tomorrow },
        status: { in: ['SCHEDULED', 'POSTING', 'POSTED'] },
      },
    });

    const nextSlot = await smartScheduler.getNextPostingTime(brandId);

    return {
      enabled: config?.enabled || false,
      postsPerDay: config?.postsPerDay || 3,
      platforms: (config?.platforms?.split(',') as Platform[]) || [],
      contentTypes: (config?.contentTypes?.split(',') as ContentType[]) || [],
      postingTimes: config?.postingTimes.split(',') || [],
      todayPosts,
      nextPostTime: nextSlot?.scheduledFor || null,
      paused: config?.pausedUntil ? config.pausedUntil > new Date() : false,
      pausedUntil: config?.pausedUntil || null,
    };
  }

  /**
   * Get automation config
   */
  async getAutomationConfig(brandId: string): Promise<any> {
    return prisma.autoPostConfig.findUnique({ where: { brandId } });
  }

  /**
   * Log automation event
   */
  async logEvent(brandId: string, eventType: string, data: any): Promise<void> {
    await prisma.automationLog.create({
      data: {
        brandId,
        eventType,
        message: `${eventType}`,
        metadata: JSON.stringify(data),
      },
    });
  }

  /**
   * Get or create product from affiliate link
   */
  private async getOrCreateProduct(link: string, platform: DetectedPlatform): Promise<any> {
    // Check if product already exists
    const existing = await prisma.product.findFirst({
      where: { affiliateLink: link },
    });

    if (existing) {
      return existing;
    }

    // For now, create a placeholder product
    // In production, this would scrape the actual product info
    const productName = this.extractProductName(link, platform);

    return prisma.product.create({
      data: {
        name: productName,
        slug: `product-${Date.now()}`,
        category: 'home_appliance',
        price: 0, // Will be updated when scraped
        commission: 0,
        commissionAmount: 0,
        affiliatePlatform: platform,
        affiliateLink: link,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Extract product name from link
   */
  private extractProductName(link: string, platform: DetectedPlatform): string {
    // Simple extraction - in production, use actual scraping
    try {
      const url = new URL(link);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const lastPart = pathParts[pathParts.length - 1] || '';
      // Clean up the name
      const name = lastPart
        .replace(/\.[^.]+$/, '') // Remove extension
        .replace(/-/g, ' ')
        .replace(/\d+\.html$/, '')
        .substring(0, 100);
      return name || `Product ${Date.now()}`;
    } catch {
      return `Product ${Date.now()}`;
    }
  }

  /**
   * Select platform based on rotation
   */
  private async selectPlatform(brandId: string): Promise<Platform> {
    const config = await this.getAutomationConfig(brandId);
    const platforms = (config?.platforms?.split(',') as Platform[]) || ['INSTAGRAM'];

    // Get recent posts to avoid repetition
    const recentPosts = await prisma.distributionQueue.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const usedPlatforms = new Set(recentPosts.map((p) => p.platform as Platform));
    const unused = platforms.filter((p) => !usedPlatforms.has(p));

    if (unused.length > 0) {
      return unused[Math.floor(Math.random() * unused.length)];
    }

    return platforms[0];
  }

  /**
   * Select content type based on rotation
   */
  private selectContentType(config: any): ContentType {
    const types = (config?.contentTypes?.split(',') as ContentType[]) || ['IMAGE'];
    return types[Math.floor(Math.random() * types.length)];
  }

  /**
   * Create distribution queue item
   */
  private async createDistribution(params: {
    brandId: string;
    productId: string;
    contentId: string;
    platform: Platform;
    contentType: ContentType;
    caption: string;
    hashtags: string[];
    pov: string;
  }): Promise<any> {
    const { brandId, productId, contentId, platform, contentType, caption, hashtags, pov } = params;

    // Get link placement strategy
    const linkPlacement = platformStrategy.getLinkPlacement(platform);

    return prisma.distributionQueue.create({
      data: {
        brandId,
        productId,
        // Note: contentId is not stored in DistributionQueue
        platform,
        contentType,
        caption,
        hashtags: Array.isArray(hashtags) ? hashtags.join(' ') : hashtags,
        provider: 'AUTO_GENERATED',
        status: 'READY',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        linkPlacementType: linkPlacement.type,
        linkPlacementText: linkPlacement.text,
        pov,
      },
    });
  }
}

// Export singleton instance
export const automationManager = new AutomationManager();
