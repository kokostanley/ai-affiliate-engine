// ============================================
// ZERNIO API INTEGRATION SERVICE
// Social media posting via Zernio API
// ============================================

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// Zernio API Configuration
const ZERNIO_API_URL = process.env.ZERNIO_API_URL || 'https://api.zernio.com/v1';

export interface ZernioAccount {
  id: string;
  platform: 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE';
  accountId: string;
  accountName: string;
  username?: string;
  avatar?: string;
  followers?: number;
  status: 'ACTIVE' | 'PAUSED' | 'INACTIVE';
}

export interface ZernioPlatform {
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'twitter' | 'linkedin';
  accountId: string;
}

export interface ZernioPostRequest {
  accountId: string;
  platforms?: ZernioPlatform[];  // Override default platform selection
  publishNow?: boolean;           // Publish immediately (ignored if scheduledFor is set)
  content: {
    videoUrl?: string;
    thumbnailUrl?: string;
    caption?: string;
    hashtags?: string[];
    script?: string;
    voiceoverUrl?: string;
  };
  schedule?: {
    publishAt: string;      // ISO date string for scheduled posting
    timezone?: string;      // e.g., 'Asia/Jakarta', defaults to UTC
  };
}

export interface ZernioPostResponse {
  success: boolean;
  postId?: string;
  postUrl?: string;
  status?: string;           // 'draft' | 'scheduled' | 'published'
  error?: string;
}

export interface ZernioConfig {
  id: string;
  name: string;
  apiKey: string;
  accountLimit: number;
  isActive: boolean;
}

/**
 * Get Zernio accounts for a brand
 */
export async function getZernioAccounts(brandId: string): Promise<ZernioAccount[]> {
  const accounts = await prisma.socialAccount.findMany({
    where: { brandId, status: 'ACTIVE' },
    orderBy: { priority: 'desc' },
  });

  return accounts.map(acc => ({
    id: acc.id,
    platform: acc.platform as any,
    accountId: acc.accountId,
    accountName: acc.accountName,
    username: acc.accountUsername || undefined,
    avatar: acc.avatarUrl || undefined,
    followers: acc.followers,
    status: acc.status as any,
  }));
}

/**
 * Get Zernio API key from environment based on brand slug
 */
export function getZernioKeyFromEnv(brandSlug: string): string | null {
  const slug = brandSlug.toLowerCase();

  if (slug.includes('cepat') || slug.includes('dapat')) {
    return process.env.ZERNIO_CEPAT_KEY_1 || process.env.ZERNIO_CEPAT_KEY_2 || null;
  }

  if (slug.includes('crypto') || slug.includes('ew')) {
    return process.env.ZERNIO_CRYPTO_KEY_1 || process.env.ZERNIO_CRYPTO_KEY_2 || process.env.ZERNIO_CRYPTO_KEY_3 || null;
  }

  return null;
}

/**
 * Get brand slug from config ID
 */
export async function getBrandSlug(configId: string): Promise<string | null> {
  const config = await prisma.zernioConfig.findUnique({ where: { id: configId } });
  if (!config) return null;

  const brand = await prisma.brand.findUnique({ where: { id: config.brandId } });
  return brand?.slug || null;
}

/**
 * Post content via Zernio
 *
 * PUBLISHING MODES:
 * - Draft: No platforms array, no future scheduledFor → saves as draft
 * - Scheduled: Include platforms array + future scheduledFor → auto-publishes at time
 * - Immediate: Include publishNow: true → publishes immediately (if supported)
 *
 * PLATFORMS: Must include { platform: "tiktok", accountId: "..." } - lowercase!
 * MEDIA: TikTok posts REQUIRE media (images or videos)
 */
export async function postToZernio(
  apiKey: string,
  request: ZernioPostRequest
): Promise<ZernioPostResponse> {
  try {
    // Zernio API endpoint
    const ZERNIO_API_URL = process.env.ZERNIO_API_URL || 'https://api.zernio.com/v1';

    console.log(`[Zernio] Posting to account ${request.accountId}`);

    // Build platforms array - Zernio requires lowercase platform names
    // Also requires explicit platforms array for scheduling to work
    const platforms = request.platforms?.map(p => ({
      platform: p.platform.toLowerCase(),
      accountId: p.accountId || request.accountId,
    })) || [{ platform: 'tiktok', accountId: request.accountId }];

    // Determine publishing mode
    const hasSchedule = request.schedule?.publishAt;
    const publishNow = request.publishNow && !hasSchedule;

    // Check if scheduled date is in the future
    const scheduledDate = hasSchedule ? new Date(request.schedule.publishAt) : null;
    const isFutureSchedule = scheduledDate && scheduledDate.getTime() > Date.now();

    // Build the request payload
    const payload: any = {
      platforms, // Include platforms array for scheduling to work
    };

    // Add content
    if (request.content.caption) {
      payload.content = request.content.caption;
    }

    // Add hashtags at top level
    if (request.content.hashtags && request.content.hashtags.length > 0) {
      payload.hashtags = request.content.hashtags;
    }

    // Add script as title if available
    if (request.content.script) {
      payload.title = request.content.script.substring(0, 200);
    }

    // Add media items (images/videos from Google Drive or direct URLs)
    // REQUIRED for TikTok posts!
    const mediaItems: any[] = [];
    if (request.content.thumbnailUrl) {
      mediaItems.push({
        type: 'image',
        url: request.content.thumbnailUrl,
      });
    }
    if (request.content.videoUrl) {
      mediaItems.push({
        type: 'video',
        url: request.content.videoUrl,
      });
    }
    if (mediaItems.length > 0) {
      payload.mediaItems = mediaItems;
    }

    // Publishing mode settings
    if (isFutureSchedule) {
      // Schedule for future - this triggers auto-publish at scheduled time
      payload.scheduledFor = request.schedule.publishAt;
      payload.timezone = request.schedule.timezone || 'Asia/Jakarta';
      console.log(`[Zernio] Scheduling for: ${request.schedule.publishAt}`);
    } else if (publishNow) {
      // Publish immediately
      payload.publishNow = true;
      console.log(`[Zernio] Publishing immediately`);
    } else {
      // Draft mode (default) - no platforms array or scheduledFor
      // Just use accountId without platforms for draft
      delete payload.platforms;
      console.log(`[Zernio] Creating draft`);
    }

    const response = await fetch(`${ZERNIO_API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Zernio] API error ${response.status}:`, error);
      return { success: false, error: `API error: ${response.status} - ${error}` };
    }

    const result: any = await response.json();
    const post = result.post || result;

    // Determine actual post status from response
    // Status values: 'draft', 'scheduled', 'published', 'pending'
    const postStatus = post.status || 'draft';
    const hasUrl = post.url || post.postUrl;

    console.log(`[Zernio] Post created - Status: ${postStatus}, URL: ${hasUrl || 'none'}`);

    return {
      success: true,
      postId: post._id || post.id || result.id,
      postUrl: post.url || post.postUrl,
      status: postStatus,
    };
  } catch (error: any) {
    console.error('[Zernio] Post failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Schedule an existing draft post for future publishing
 * NOTE: Zernio PATCH doesn't update scheduledFor. We must create a new scheduled post.
 * This creates a NEW post with scheduling - the original draft remains.
 */
export async function scheduleExistingPost(
  apiKey: string,
  originalPostId: string,
  platform: string,
  accountId: string,
  scheduledFor: Date,
  content?: string,
  hashtags?: string[],
  mediaItems?: any[]
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const ZERNIO_API_URL = process.env.ZERNIO_API_URL || 'https://api.zernio.com/v1';

    // Get original post to copy content
    const original = await getPostStatus(apiKey, originalPostId);
    if (!original.success) {
      return { success: false, error: 'Could not fetch original post' };
    }

    // Build new scheduled post payload
    const payload: any = {
      platforms: [{
        platform: platform.toLowerCase(),
        accountId: accountId,
      }],
      content: content || '',
      scheduledFor: scheduledFor.toISOString(),
      timezone: 'Asia/Jakarta',
    };

    if (hashtags && hashtags.length > 0) {
      payload.hashtags = hashtags;
    }

    if (mediaItems && mediaItems.length > 0) {
      payload.mediaItems = mediaItems;
    }

    console.log(`[Zernio] Creating scheduled post from draft ${originalPostId}`);

    const response = await fetch(`${ZERNIO_API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Zernio] Schedule error ${response.status}:`, error);
      return { success: false, error: `API error: ${response.status}` };
    }

    const result: any = await response.json();
    const post = result.post || result;

    console.log(`[Zernio] Scheduled post created - ID: ${post._id || post.id}, Status: ${post.status}`);

    return {
      success: true,
      postId: post._id || post.id,
    };
  } catch (error: any) {
    console.error('[Zernio] Schedule failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get post status from Zernio
 */
export async function getPostStatus(
  apiKey: string,
  postId: string
): Promise<{ success: boolean; status?: string; stats?: any; error?: string }> {
  try {
    const ZERNIO_API_URL = process.env.ZERNIO_API_URL || 'https://api.zernio.com/v1';

    const response = await fetch(`${ZERNIO_API_URL}/posts/${postId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, error: `API error: ${response.status}` };
    }

    const result: any = await response.json();
    // Zernio returns { post: {...} } structure
    const post = result.post || result;

    return {
      success: true,
      status: post.status,
      stats: post.analytics || post.stats,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Schedule a post for future publishing
 * Returns success even if Zernio doesn't support scheduling (we track locally)
 */
export async function schedulePost(
  apiKey: string,
  postId: string,
  scheduledFor: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    const ZERNIO_API_URL = process.env.ZERNIO_API_URL || 'https://api.zernio.com/v1';

    // Try PATCH to update scheduledFor
    const response = await fetch(`${ZERNIO_API_URL}/posts/${postId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scheduledFor: scheduledFor.toISOString(),
      }),
    });

    if (!response.ok) {
      // Scheduling in Zernio may not be fully supported
      // We'll track schedule in our database anyway
      console.log(`[Zernio] Schedule PATCH returned ${response.status} - tracking locally`);
      return { success: true }; // Still success - we track locally
    }

    return { success: true };
  } catch (error: any) {
    // Don't fail - we track schedule in our database
    console.log(`[Zernio] Schedule error (tracking locally): ${error.message}`);
    return { success: true };
  }
}

/**
 * Get available Zernio API key for a brand (with load balancing)
 */
export async function getAvailableZernioKey(brandId: string): Promise<ZernioConfig | null> {
  const configs = await prisma.zernioConfig.findMany({
    where: {
      brandId,
      isActive: true,
    },
    orderBy: [
      { lastUsedAt: 'asc' }, // Prefer least recently used
    ],
  });

  // Get brand slug to resolve actual API key from env
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  const brandSlug = brand?.slug || '';

  // Filter by account limit (not implementing full logic here)
  for (const config of configs) {
    // Check if this key has room for more accounts
    const accountCount = await prisma.socialAccount.count({
      where: { zernioConfigId: config.id },
    });

    if (accountCount < config.accountLimit) {
      // Get the actual API key from environment variable based on brand
      let actualApiKey = config.apiKey;

      // If database has placeholder or empty key, get from env
      if (!actualApiKey || actualApiKey.startsWith('ZERNIO_KEY')) {
        actualApiKey = getZernioKeyFromEnv(brandSlug) || config.apiKey;
      }

      return {
        id: config.id,
        name: config.name,
        apiKey: actualApiKey,
        accountLimit: config.accountLimit,
        isActive: config.isActive,
      };
    }
  }

  return null;
}

/**
 * Mark Zernio key as used
 */
export async function markZernioKeyUsed(configId: string): Promise<void> {
  await prisma.zernioConfig.update({
    where: { id: configId },
    data: { lastUsedAt: new Date() },
  });
}

/**
 * Get account posting status (check cooldown and daily limits)
 */
export async function canPostToAccount(accountId: string): Promise<{
  canPost: boolean;
  reason?: string;
  waitMinutes?: number;
}> {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    return { canPost: false, reason: 'Account not found' };
  }

  if (account.status !== 'ACTIVE') {
    return { canPost: false, reason: 'Account is not active' };
  }

  // Check daily limit
  if (account.dailyUsed >= account.dailyLimit) {
    return { canPost: false, reason: 'Daily limit reached' };
  }

  // Check cooldown
  if (account.lastPostedAt) {
    const cooldownMs = account.cooldownMinutes * 60 * 1000;
    const timeSinceLastPost = Date.now() - account.lastPostedAt.getTime();
    const waitMinutes = Math.ceil((cooldownMs - timeSinceLastPost) / 60000);

    if (waitMinutes > 0) {
      return { canPost: false, reason: 'Cooldown period', waitMinutes };
    }
  }

  return { canPost: true };
}

/**
 * Record post to account
 */
export async function recordPostToAccount(accountId: string): Promise<void> {
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      dailyUsed: { increment: 1 },
      lastPostedAt: new Date(),
    },
  });

  // Also reset daily count if needed (simplified - in production, use proper day boundaries)
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (account && account.lastPostedAt) {
    const hoursSincePost = (Date.now() - account.lastPostedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSincePost >= 24) {
      await prisma.socialAccount.update({
        where: { id: accountId },
        data: { dailyUsed: 0 },
      });
    }
  }
}

/**
 * Get next available account for a platform
 */
export async function getNextAvailableAccount(
  brandId: string,
  platform: string
): Promise<{ account: ZernioAccount; zernioConfig: ZernioConfig } | null> {
  const accounts = await prisma.socialAccount.findMany({
    where: {
      brandId,
      platform,
      status: 'ACTIVE',
    },
    orderBy: [
      { priority: 'desc' },
      { lastPostedAt: 'asc' },
    ],
  });

  for (const account of accounts) {
    const canPost = await canPostToAccount(account.id);
    if (canPost.canPost) {
      const zernioConfig = await getAvailableZernioKey(brandId);
      if (zernioConfig) {
        return {
          account: {
            id: account.id,
            platform: account.platform as any,
            accountId: account.accountId,
            accountName: account.accountName,
            username: account.accountUsername || undefined,
            followers: account.followers,
            status: account.status as any,
          },
          zernioConfig,
        };
      }
    }
  }

  return null;
}

/**
 * Test Zernio API connection
 */
export async function testZernioConnection(apiKey: string): Promise<{
  success: boolean;
  message: string;
  accounts?: ZernioAccount[];
}> {
  try {
    const ZERNIO_API_URL = process.env.ZERNIO_API_URL || 'https://api.zernio.com/v1';

    const response = await fetch(`${ZERNIO_API_URL}/accounts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, message: `API error: ${response.status}` };
    }

    const result: any = await response.json();
    const accounts: ZernioAccount[] = (result.accounts || result.data || []).map((acc: any) => ({
      id: acc.id,
      platform: acc.platform.toUpperCase(),
      accountId: acc.account_id || acc.accountId,
      accountName: acc.name || acc.account_name,
      username: acc.username,
      avatar: acc.avatar,
      followers: acc.followers || 0,
      status: acc.status || 'ACTIVE',
    }));

    return { success: true, message: `Connected. Found ${accounts.length} accounts.`, accounts };
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

/**
 * Create Zernio draft for a distribution item
 * This creates a draft post in Zernio that can be scheduled or posted later
 */
export async function createZernioDraft(
  distributionId: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // Get distribution item
    const distribution = await prisma.distributionQueue.findUnique({
      where: { id: distributionId },
      include: { brand: true },
    });

    if (!distribution) {
      return { success: false, error: 'Distribution not found' };
    }

    // Get available account and Zernio key
    const available = await getNextAvailableAccount(distribution.brandId, distribution.platform);
    if (!available) {
      return { success: false, error: 'No available Zernio account for this platform' };
    }

    // Parse hashtags
    const hashtags = distribution.hashtags ? distribution.hashtags.split(',').filter(Boolean) : [];

    // Build caption with tracking link
    const caption = distribution.caption || '';
    const trackingUrl = distribution.trackingLink || '';
    const fullCaption = trackingUrl ? `${caption}\n\n${trackingUrl}` : caption;

    // Post to Zernio (creates draft - no platforms array)
    const result = await postToZernio(available.zernioConfig.apiKey, {
      accountId: available.account.accountId,
      content: {
        videoUrl: distribution.videoUrl || undefined,
        thumbnailUrl: distribution.thumbnailUrl || undefined,
        caption: fullCaption,
        hashtags,
        script: distribution.script || undefined,
      },
      // No platforms = creates draft
    });

    if (result.success) {
      // Update distribution with post info
      await prisma.distributionQueue.update({
        where: { id: distributionId },
        data: {
          postId: result.postId,
          postUrl: result.postUrl || undefined,
          zernioConfigId: available.zernioConfig.id,
          socialAccountId: available.account.id,
          status: result.status === 'draft' ? 'ZERNIO_DRAFT_CREATED' : 'ZERNIO_SCHEDULED',
        },
      });

      console.log(`[Zernio] Draft created for distribution ${distributionId}: ${result.postId}`);
      return { success: true, postId: result.postId };
    }

    return { success: false, error: result.error };
  } catch (error: any) {
    console.error('[Zernio] Create draft failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create Zernio draft with media from Google Drive
 * For image/carousel content that has been uploaded to Google Drive
 */
export async function createZernioDraftWithMedia(
  distributionId: string,
  mediaUrl: string,
  mediaType: 'image' | 'video' = 'image'
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const distribution = await prisma.distributionQueue.findUnique({
      where: { id: distributionId },
      include: { brand: true },
    });

    if (!distribution) {
      return { success: false, error: 'Distribution not found' };
    }

    const available = await getNextAvailableAccount(distribution.brandId, distribution.platform);
    if (!available) {
      return { success: false, error: 'No available Zernio account' };
    }

    const hashtags = distribution.hashtags ? distribution.hashtags.split(',').filter(Boolean) : [];
    const caption = distribution.caption || '';
    const trackingUrl = distribution.trackingLink || '';
    const fullCaption = trackingUrl ? `${caption}\n\n${trackingUrl}` : caption;

    const result = await postToZernio(available.zernioConfig.apiKey, {
      accountId: available.account.accountId,
      platforms: [{
        platform: distribution.platform.toLowerCase() as any,
        accountId: available.account.accountId,
      }],
      content: {
        thumbnailUrl: mediaType === 'image' ? mediaUrl : undefined,
        videoUrl: mediaType === 'video' ? mediaUrl : undefined,
        caption: fullCaption,
        hashtags,
        script: distribution.script || undefined,
      },
    });

    if (result.success) {
      await prisma.distributionQueue.update({
        where: { id: distributionId },
        data: {
          postId: result.postId,
          postUrl: result.postUrl || undefined,
          zernioConfigId: available.zernioConfig.id,
          socialAccountId: available.account.id,
          status: 'ZERNIO_DRAFT_CREATED',
        },
      });

      return { success: true, postId: result.postId };
    }

    return { success: false, error: result.error };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
