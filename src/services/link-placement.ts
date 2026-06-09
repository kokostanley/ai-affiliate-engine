// ============================================
// LINK PLACEMENT STRATEGY SERVICE
// Platform-specific affiliate link placement
// ============================================

import { PrismaClient } from '@prisma/client';
import { generateDistributionLinks } from './affiliate-link';

const prisma = new PrismaClient();

/**
 * Link placement types per platform
 */
export type LinkPlacementType =
  | 'BIO_LINK'           // Instagram-style bio link
  | 'STORY_STICKER'      // Story link sticker
  | 'COMMENT'            // First comment link
  | 'DIRECT'             // Direct clickable link (Telegram, WhatsApp)
  | 'PINNED_COMMENT'     // YouTube pinned comment
  | 'BIO_PLUS_CTA'       // Bio link + routing CTA text
  | 'NO_LINK';           // Platform doesn't support links (X/Twitter)

/**
 * Input for generating link placement
 */
export interface GenerateLinkPlacementInput {
  brandId: string;
  platform: string;       // TIKTOK, INSTAGRAM, FACEBOOK, YOUTUBE, TELEGRAM, WHATSAPP, PINTEREST
  contentType: string;    // VIDEO, IMAGE, CAROUSEL, STORY
  affiliateLink?: string;
  trackingUrl?: string;
  accountCapabilities?: {
    hasTikTokAffiliatePermission?: boolean;
    hasStoryLinkSticker?: boolean;
  };
}

/**
 * Result of link placement generation
 */
export interface LinkPlacementResult {
  placementType: LinkPlacementType;
  captionCTA: string;
  destinationUrl: string;
  trackingUrl: string;
  pinnedComment: string | null;
  manualAction: boolean;
  manualActionNote: string | null;
  bioLinkRequired: boolean;
  warning: string | null;
}

// ============================================
// CTA TEMPLATES BY PLATFORM
// ============================================

const CTA_TEMPLATES: Record<string, string[]> = {
  INSTAGRAM_BIO: [
    "Link ada di bio 🔗",
    "Cek link di bio ya! 👆",
    "Klik link di bio sebelum kehabisan! 🔥",
    "Shope link di bio 👆",
  ],
  INSTAGRAM_STORY: [
    "Story hari ini! Swipe up! 👆",
    "Cek link di story! 🔗",
  ],
  TIKTOK_BIO: [
    "Link di bio! 🔗",
    "Klik bio untuk info lebih lanjut! 👆",
  ],
  TIKTOK_ROUTE: [
    "Ketik MAU di DM",
    "Cek link di bio atau Telegram channel",
    "Chat WA untuk order sekarang! Stok terbatas! ⚡",
  ],
  YOUTUBE: [
    "Link di description dan pinned comment 👇",
  ],
  PINTEREST: [
    "Link di bio 🔗",
    "Klik bio untuk produk ini! 👆",
  ],
  FACEBOOK: [], // Direct link in caption
};

// ============================================
// PLATFORM CAPABILITY CHECKS
// ============================================

/**
 * Platforms that support direct clickable links in caption
 */
const DIRECT_LINK_PLATFORMS = ['TELEGRAM', 'WHATSAPP', 'LINKEDIN'];

/**
 * Platforms that support links in first comment
 */
const COMMENT_LINK_PLATFORMS = ['FACEBOOK', 'INSTAGRAM'];

/**
 * Platforms excluded from posting (paid in Zernio or not supported)
 */
const EXCLUDED_PLATFORMS = ['X', 'TWITTER', 'PINTEREST'];

/**
 * Check if platform supports direct clickable links
 */
export function supportsDirectLinks(platform: string): boolean {
  return DIRECT_LINK_PLATFORMS.includes(platform.toUpperCase());
}

/**
 * Check if platform supports links in comments
 */
export function supportsCommentLinks(platform: string): boolean {
  return COMMENT_LINK_PLATFORMS.includes(platform.toUpperCase());
}

/**
 * Check if platform is excluded
 */
export function isExcludedPlatform(platform: string): boolean {
  return EXCLUDED_PLATFORMS.includes(platform.toUpperCase());
}

/**
 * Get random CTA from template
 */
function getRandomCTA(platform: string, type: string): string {
  const key = `${platform.toUpperCase()}_${type.toUpperCase()}`;
  const templates = CTA_TEMPLATES[key] || CTA_TEMPLATES[platform.toUpperCase()] || [];
  if (templates.length === 0) return '';
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Get YouTube pinned comment text
 */
function getYouTubePinnedComment(trackingUrl: string): string {
  return `🔗 PARTNER LINK 🔗\n\nLink: ${trackingUrl}\n\nProduk yang direview ada di atas! Cek link untuk info lebih lanjut 👆\n\n#affiliate #review`;
}

/**
 * Get short link for caption (Facebook optimization)
 */
function getShortLinkCaption(trackingUrl: string): string {
  return `\n\n🔗 ${trackingUrl}`;
}

// ============================================
// MAIN LINK PLACEMENT GENERATOR
// ============================================

/**
 * Generate link placement strategy for a platform
 */
export async function generateLinkPlacement(
  input: GenerateLinkPlacementInput
): Promise<LinkPlacementResult> {
  const { brandId, platform, contentType, affiliateLink = '', trackingUrl, accountCapabilities = {} } = input;

  // Check for excluded platforms
  if (isExcludedPlatform(platform)) {
    return {
      placementType: 'NO_LINK',
      captionCTA: '',
      destinationUrl: affiliateLink,
      trackingUrl: trackingUrl || '',
      pinnedComment: null,
      manualAction: false,
      manualActionNote: null,
      bioLinkRequired: false,
      warning: `Platform ${platform} tidak didukung - berbayar di Zernio`,
    };
  }

  // Get brand for additional routing options
  let brandTelegramChannel: string | null = null;
  let brandWhatsappNumber: string | null = null;

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      settings: true,
    },
  });

  if (brand?.settings) {
    try {
      const brandSettings = JSON.parse(brand.settings);
      brandTelegramChannel = brandSettings.telegramChannel || null;
      brandWhatsappNumber = brandSettings.whatsappNumber || null;
    } catch {
      // Ignore parse errors
    }
  }

  // Generate tracking URL if not provided
  let finalTrackingUrl = trackingUrl;
  if (!finalTrackingUrl && affiliateLink) {
    try {
      // This would typically be called after generateDistributionLinks
      // For now, just use the affiliate link
      finalTrackingUrl = affiliateLink;
    } catch {
      finalTrackingUrl = affiliateLink;
    }
  }

  // Route by platform
  switch (platform.toUpperCase()) {
    case 'INSTAGRAM':
      return handleInstagram(contentType, finalTrackingUrl, accountCapabilities);

    case 'TIKTOK':
      return handleTikTok(finalTrackingUrl, accountCapabilities, brandTelegramChannel, brandWhatsappNumber);

    case 'FACEBOOK':
      return handleFacebook(finalTrackingUrl);

    case 'YOUTUBE':
      return handleYouTube(finalTrackingUrl);

    case 'TELEGRAM':
      return handleTelegram(finalTrackingUrl);

    case 'WHATSAPP':
      return handleWhatsApp(finalTrackingUrl);

    default:
      return {
        placementType: 'NO_LINK',
        captionCTA: getRandomCTA(platform, 'BIO'),
        destinationUrl: affiliateLink,
        trackingUrl: finalTrackingUrl || '',
        pinnedComment: null,
        manualAction: false,
        manualActionNote: null,
        bioLinkRequired: false,
        warning: `Platform ${platform} belum dikonfigurasi`,
      };
  }
}

// ============================================
// PLATFORM-SPECIFIC HANDLERS
// ============================================

/**
 * Handle Instagram link placement
 */
function handleInstagram(
  contentType: string,
  trackingUrl: string,
  capabilities: { hasStoryLinkSticker?: boolean }
): LinkPlacementResult {
  const isStory = contentType.toUpperCase() === 'STORY';

  if (isStory) {
    // Story uses link sticker
    const hasSticker = capabilities.hasStoryLinkSticker !== false; // Default true
    if (hasSticker) {
      return {
        placementType: 'STORY_STICKER',
        captionCTA: getRandomCTA('INSTAGRAM', 'STORY'),
        destinationUrl: trackingUrl,
        trackingUrl: trackingUrl,
        pinnedComment: null,
        manualAction: false,
        manualActionNote: null,
        bioLinkRequired: false,
        warning: null,
      };
    } else {
      // Needs manual link sticker
      return {
        placementType: 'NO_LINK',
        captionCTA: '⚠️ NEED TO ADD STORY LINK STICKER MANUALLY',
        destinationUrl: trackingUrl,
        trackingUrl: trackingUrl,
        pinnedComment: null,
        manualAction: true,
        manualActionNote: 'Need to add story link sticker manually - Zernio tidak mendukung story sticker',
        bioLinkRequired: false,
        warning: 'Story sticker perlu ditambahkan manual',
      };
    }
  }

  // Feed/Reels use bio link
  return {
    placementType: 'BIO_LINK',
    captionCTA: getRandomCTA('INSTAGRAM', 'BIO'),
    destinationUrl: trackingUrl,
    trackingUrl: trackingUrl,
    pinnedComment: null,
    manualAction: false,
    manualActionNote: null,
    bioLinkRequired: true,
    warning: null,
  };
}

/**
 * Handle TikTok link placement
 */
function handleTikTok(
  trackingUrl: string,
  capabilities: { hasTikTokAffiliatePermission?: boolean },
  telegramChannel?: string | null,
  whatsappNumber?: string | null
): LinkPlacementResult {
  const hasPermission = capabilities.hasTikTokAffiliatePermission;

  if (hasPermission) {
    // TikTok Shop or affiliate-eligible account
    return {
      placementType: 'BIO_PLUS_CTA',
      captionCTA: getRandomCTA('TIKTOK', 'BIO'),
      destinationUrl: trackingUrl,
      trackingUrl: trackingUrl,
      pinnedComment: null,
      manualAction: false,
      manualActionNote: null,
      bioLinkRequired: true,
      warning: null,
    };
  }

  // No permission - route to Telegram, WhatsApp, or landing page
  let routingCTA = getRandomCTA('TIKTOK', 'ROUTE');

  if (telegramChannel) {
    routingCTA = `Cek Telegram channel untuk info produk! ${telegramChannel} 👆`;
  } else if (whatsappNumber) {
    routingCTA = `Chat WA untuk order: ${whatsappNumber} 📲`;
  }

  return {
    placementType: 'BIO_PLUS_CTA',
    captionCTA: routingCTA,
    destinationUrl: trackingUrl,
    trackingUrl: trackingUrl,
    pinnedComment: null,
    manualAction: false,
    manualActionNote: null,
    bioLinkRequired: true,
    warning: 'TikTok tanpa permission - routing ke Telegram/WA/landing page',
  };
}

/**
 * Handle Facebook link placement
 */
function handleFacebook(trackingUrl: string): LinkPlacementResult {
  return {
    placementType: 'COMMENT',
    captionCTA: getShortLinkCaption(trackingUrl),
    destinationUrl: trackingUrl,
    trackingUrl: trackingUrl,
    pinnedComment: null,
    manualAction: false,
    manualActionNote: null,
    bioLinkRequired: false,
    warning: null,
  };
}

/**
 * Handle YouTube link placement
 */
function handleYouTube(trackingUrl: string): LinkPlacementResult {
  return {
    placementType: 'PINNED_COMMENT',
    captionCTA: getRandomCTA('YOUTUBE', ''),
    destinationUrl: trackingUrl,
    trackingUrl: trackingUrl,
    pinnedComment: getYouTubePinnedComment(trackingUrl),
    manualAction: true,
    manualActionNote: 'Tambahkan pinned comment dengan link di YouTube Studio',
    bioLinkRequired: false,
    warning: null,
  };
}

/**
 * Handle Telegram link placement
 */
function handleTelegram(trackingUrl: string): LinkPlacementResult {
  return {
    placementType: 'DIRECT',
    captionCTA: '', // Direct link in message
    destinationUrl: trackingUrl,
    trackingUrl: trackingUrl,
    pinnedComment: null,
    manualAction: false,
    manualActionNote: null,
    bioLinkRequired: false,
    warning: null,
  };
}

/**
 * Handle WhatsApp link placement
 */
function handleWhatsApp(trackingUrl: string): LinkPlacementResult {
  return {
    placementType: 'DIRECT',
    captionCTA: '', // Direct link in message
    destinationUrl: trackingUrl,
    trackingUrl: trackingUrl,
    pinnedComment: null,
    manualAction: false,
    manualActionNote: null,
    bioLinkRequired: false,
    warning: null,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get final caption with CTA appended
 */
export function appendCaptionCTA(originalCaption: string, captionCTA: string): string {
  if (!captionCTA) return originalCaption;
  return `${originalCaption}\n\n${captionCTA}`;
}

/**
 * Get caption for Zernio posting
 * - For DIRECT platforms: include tracking URL directly
 * - For BIO platforms: include CTA text only
 */
export function getZernioCaption(
  originalCaption: string,
  placement: LinkPlacementResult,
  includeTrackingUrl: boolean
): string {
  if (placement.placementType === 'DIRECT' && includeTrackingUrl) {
    // Telegram, WhatsApp - direct clickable link
    return `${originalCaption}\n\n🔗 ${placement.trackingUrl}`;
  }

  if (placement.placementType === 'COMMENT') {
    // Facebook - short link in caption
    return `${originalCaption}${placement.captionCTA}`;
  }

  if (placement.captionCTA) {
    // Bio platforms - CTA text
    return appendCaptionCTA(originalCaption, placement.captionCTA);
  }

  return originalCaption;
}

/**
 * Get Telegram preview format
 * Returns formatted string for Telegram post preview with link strategy
 */
export function getTelegramPreview(
  caption: string,
  placement: LinkPlacementResult
): string {
  let preview = '🔗 LINK STRATEGY 🔗\n';
  preview += `━━━━━━━━━━━━━━━━━━\n\n`;
  preview += `Platform: ${placement.tracementType.replace('_', ' ')}\n`;
  preview += `Placement: ${placement.placementType.replace('_', ' ')}\n`;

  if (placement.trackingUrl) {
    preview += `Tracking URL:\n${placement.trackingUrl}\n`;
  }

  if (placement.captionCTA) {
    preview += `\nCTA:\n${placement.captionCTA}\n`;
  }

  if (placement.manualAction) {
    preview += `\n⚠️ MANUAL ACTION REQUIRED:\n${placement.manualActionNote || 'Check platform requirements'}\n`;
  }

  if (placement.pinnedComment) {
    preview += `\n📌 PINNED COMMENT:\n${placement.pinnedComment}\n`;
  }

  return preview;
}

/**
 * Get final caption with all link elements
 */
export function getFinalCaption(
  originalCaption: string,
  platform: string,
  placement: LinkPlacementResult
): string {
  let finalCaption = originalCaption;

  // Add caption CTA for bio platforms
  if (['INSTAGRAM', 'TIKTOK', 'PINTEREST'].includes(platform.toUpperCase())) {
    if (placement.captionCTA) {
      finalCaption = appendCaptionCTA(finalCaption, placement.captionCTA);
    }
  }

  // Add direct link for Telegram/WhatsApp
  if (placement.placementType === 'DIRECT' && placement.trackingUrl) {
    finalCaption += `\n\n🔗 ${placement.trackingUrl}`;
  }

  // Add link in caption for Facebook
  if (placement.placementType === 'COMMENT') {
    finalCaption += placement.captionCTA;
  }

  return finalCaption;
}

/**
 * Get platform description
 */
export function getPlatformDescription(platform: string, contentType: string): string {
  const descriptions: Record<string, string> = {
    INSTAGRAM_STORY: 'Use story link sticker. Bio CTA if not supported.',
    INSTAGRAM: 'Use bio link. Add CTA to caption directing to bio.',
    TIKTOK: 'Route to bio/Telegram/WA based on account capabilities.',
    TIKTOK_SHOP: 'Use TikTok Shop affiliate link directly.',
    FACEBOOK: 'Add trackable link in caption or first comment.',
    YOUTUBE: 'Add link in description + pinned comment.',
    TELEGRAM: 'Direct clickable link in message.',
    WHATSAPP: 'Direct clickable link in message.',
    PINTEREST: 'Use destination URL if available, otherwise bio link.',
    X: 'EXCLUDED - Paid in Zernio.',
    TWITTER: 'EXCLUDED - Paid in Zernio.',
  };

  const key = `${platform.toUpperCase()}_${contentType.toUpperCase()}`;
  return descriptions[key] || descriptions[platform.toUpperCase()] || 'Platform not configured';
}

/**
 * Get platforms that support direct links in caption (for Zernio)
 */
export function getDirectLinkPlatforms(): string[] {
  return [...DIRECT_LINK_PLATFORMS];
}

/**
 * Get platforms excluded from posting
 */
export function getExcludedPlatforms(): string[] {
  return [...EXCLUDED_PLATFORMS];
}

/**
 * Validate link placement configuration
 */
export function validateLinkPlacement(
  platform: string,
  contentType: string,
  trackingUrl?: string
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check for excluded platforms
  if (isExcludedPlatform(platform)) {
    warnings.push(`Platform ${platform} is excluded from posting - paid in Zernio`);
  }

  // Check for missing tracking URL
  if (!trackingUrl) {
    warnings.push('No tracking URL configured - affiliate link may not be trackable');
  }

  // Instagram specific checks
  if (platform.toUpperCase() === 'INSTAGRAM' && contentType.toUpperCase() === 'STORY') {
    warnings.push('Verify Zernio supports story link sticker before posting');
  }

  // TikTok specific checks
  if (platform.toUpperCase() === 'TIKTOK') {
    warnings.push('TikTok affiliate links must route through bio/Telegram/WA unless Shop affiliate enabled');
  }

  // YouTube specific checks
  if (platform.toUpperCase() === 'YOUTUBE') {
    warnings.push('Pinned comment must be added manually in YouTube Studio');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
