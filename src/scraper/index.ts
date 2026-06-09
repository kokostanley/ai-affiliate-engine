// ============================================
// ENHANCED PRODUCT SCRAPER SERVICE
// Extracts product info from affiliate links
// Supports: Shopee, TikTok, Tokopedia, Lazada, Blibli, Bukalapak
// ============================================

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapedProduct {
  name: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  imageUrl?: string;
  description?: string;
  category?: string;
  rating?: number;
  sold?: number;
  shop?: string;
  shopName?: string;
  platform: string;
  platformDisplay: string;
  affiliateLink: string;
  productId?: string;
  available: boolean;
  stock?: number;
  location?: string;
  url: string;
}

export interface ValidationResult {
  valid: boolean;
  platform?: string;
  platformDisplay?: string;
  productId?: string;
  error?: string;
  suggestions?: string[];
}

export type Platform = 'shopee' | 'tiktok' | 'tokopedia' | 'lazada' | 'blibli' | 'bukalapak' | 'unknown';

interface PlatformConfig {
  pattern: RegExp;
  displayName: string;
  example: string;
  scrape: (url: string) => Promise<ScrapedProduct>;
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  shopee: {
    pattern: /shopee\.co\.id/i,
    displayName: 'Shopee',
    example: 'https://shopee.co.id/product-name.123456789.1234567890',
    scrape: scrapeShopee,
  },
  tiktok: {
    pattern: /tiktok\.com/i,
    displayName: 'TikTok Shop',
    example: 'https://www.tiktok.com/shop/product/example-123',
    scrape: scrapeTiktok,
  },
  tokopedia: {
    pattern: /tokopedia\.com/i,
    displayName: 'Tokopedia',
    example: 'https://www.tokopedia.com/shop/product/example-123',
    scrape: scrapeTokopedia,
  },
  lazada: {
    pattern: /lazada\.co\.id/i,
    displayName: 'Lazada',
    example: 'https://www.lazada.co.id/products/example-123.html',
    scrape: scrapeLazada,
  },
  blibli: {
    pattern: /blibli\.com/i,
    displayName: 'Blibli',
    example: 'https://www.blibli.com/p/product/example',
    scrape: scrapeBlibli,
  },
  bukalapak: {
    pattern: /bukalapak\.com/i,
    displayName: 'Bukalapak',
    example: 'https://www.bukalapak.com/p/product/example',
    scrape: scrapeBukalapak,
  },
};

/**
 * Detect platform from URL
 */
export function detectPlatform(url: string): Platform {
  for (const [platform, config] of Object.entries(PLATFORM_CONFIGS)) {
    if (config.pattern.test(url)) {
      return platform as Platform;
    }
  }
  return 'unknown';
}

/**
 * Get platform display name
 */
export function getPlatformDisplay(url: string): string {
  const platform = detectPlatform(url);
  return PLATFORM_CONFIGS[platform]?.displayName || 'Unknown';
}

/**
 * Validate affiliate link and get info
 */
export function validateAffiliateLink(url: string): ValidationResult {
  const trimmedUrl = url.trim();

  // Check basic URL format
  if (!trimmedUrl) {
    return {
      valid: false,
      error: 'URL tidak boleh kosong',
      suggestions: ['Masukkan URL lengkap, contoh: https://shopee.co.id/...'],
    };
  }

  // Check URL protocol
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return {
      valid: false,
      error: 'URL harus dimulai dengan http:// atau https://',
      suggestions: ['Contoh: https://shopee.co.id/product/...'],
    };
  }

  // Detect platform
  const platform = detectPlatform(trimmedUrl);

  if (platform === 'unknown') {
    const supportedPlatforms = Object.entries(PLATFORM_CONFIGS)
      .filter(p => p[0] !== 'unknown')
      .map(([_, config]) => config.displayName)
      .join(', ');

    return {
      valid: false,
      error: `Platform "${getHostname(trimmedUrl)}" belum didukung`,
      suggestions: [
        `Platform yang didukung: ${supportedPlatforms}`,
        'Contoh: https://shopee.co.id/...',
        'Contoh: https://www.tiktok.com/shop/...',
      ],
    };
  }

  // Extract product ID for validation
  const productId = extractProductId(trimmedUrl, platform);

  return {
    valid: true,
    platform,
    platformDisplay: PLATFORM_CONFIGS[platform].displayName,
    productId,
  };
}

/**
 * Get hostname from URL
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Extract product ID from URL based on platform
 */
function extractProductId(url: string, platform: Platform): string | undefined {
  try {
    switch (platform) {
      case 'shopee': {
        // Pattern: shopee.co.id/product-name.123456789.1234567890
        const match = url.match(/\.i\.(\d+)\.(\d+)/);
        return match ? `${match[1]}-${match[2]}` : undefined;
      }
      case 'tiktok': {
        // Pattern: tiktok.com/shop/product/123456
        const match = url.match(/\/product\/(\d+)/);
        return match?.[1];
      }
      case 'tokopedia': {
        // Pattern: tokopedia.com/product-name-123
        const match = url.match(/-p-(\d+)$/) || url.match(/\/(\d+)\.html$/);
        return match?.[1];
      }
      case 'lazada': {
        // Pattern: lazada.co.id/products/example-123.html
        const match = url.match(/\/(\d+)\.html$/);
        return match?.[1];
      }
      case 'blibli': {
        // Pattern: blibli.com/p/product-name-sku123
        const match = url.match(/-(sku[^-]+)$/) || url.match(/\/p\/([^-]+-?\d+)$/);
        return match?.[1];
      }
      case 'bukalapak': {
        // Pattern: bukalapak.com/p/product-name-123
        const match = url.match(/-(\d+)$/);
        return match?.[1];
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Main scrape function
 */
export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const validation = validateAffiliateLink(url);

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const config = PLATFORM_CONFIGS[validation.platform!];
  return config.scrape(url);
}

/**
 * Validate affiliate link format (legacy function)
 */
export function isValidAffiliateLink(url: string): boolean {
  return validateAffiliateLink(url).valid;
}

/**
 * Get supported platforms
 */
export function getSupportedPlatforms(): Array<{ id: Platform; name: string; example: string }> {
  return Object.entries(PLATFORM_CONFIGS)
    .filter(([id]) => id !== 'unknown')
    .map(([id, config]) => ({
      id: id as Platform,
      name: config.displayName,
      example: config.example,
    }));
}

// ============================================
// PLATFORM-SPECIFIC SCRAPERS
// ============================================

async function scrapeShopee(url: string): Promise<ScrapedProduct> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  };

  try {
    const response = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);

    // Extract from meta tags first
    let name = $('meta[property="og:title"]').attr('content') || '';
    let imageUrl = $('meta[property="og:image"]').attr('content') || '';
    let price = 0;
    let originalPrice = 0;
    let discount = 0;
    let sold: number | undefined;
    let rating: number | undefined;
    let shopName: string | undefined;
    let location: string | undefined;
    let available = true;

    // Clean name
    name = name
      .replace(/\s*-\s*Shopee Indonesia\s*$/i, '')
      .replace(/\s*-\s*Official Store\s*$/i, '')
      .replace(/\s*-\s*Garansi Resmi\s*$/i, '')
      .trim();

    // Extract price from various possible locations
    const priceStr = $('meta[property="product:price:amount"]').attr('content') ||
                     $('meta[property="og:price:amount"]').attr('content') ||
                     $('[data-price]').attr('data-price') ||
                     '';

    if (priceStr) {
      price = parseFloat(priceStr) || 0;
    }

    // Try to extract from script data
    const scriptData = response.data.match(/window\.__INIT_PROPS__\s*=\s*({.+?});/s);
    if (scriptData) {
      try {
        const data = JSON.parse(scriptData[1]);
        if (data.product) {
          price = price || data.product.price || 0;
          originalPrice = data.product.originalPrice || 0;
          discount = data.product.discount || 0;
          sold = data.product.sold;
          rating = data.product.rating;
          shopName = data.product.shopName;
          location = data.product.location;
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    // Extract from page as fallback
    if (!price) {
      const priceMatch = response.data.match(/"price"\s*:\s*(\d+)/);
      if (priceMatch) {
        price = parseInt(priceMatch[1]);
      }
    }

    // Calculate discount if original price found
    if (originalPrice && price) {
      discount = Math.round((1 - price / originalPrice) * 100);
    }

    // Extract sold count
    if (!sold) {
      const soldMatch = response.data.match(/"sold_count"\s*:\s*(\d+)/);
      if (soldMatch) sold = parseInt(soldMatch[1]);
    }

    // Check availability
    const unavailable = response.data.includes('Stok habis') ||
                       response.data.includes('produk tidak tersedia') ||
                       $('.sold-out-product').length > 0;
    available = !unavailable;

    return {
      name: name || 'Shopee Product',
      price,
      originalPrice: originalPrice || undefined,
      discount: discount || undefined,
      imageUrl,
      platform: 'shopee',
      platformDisplay: 'Shopee',
      affiliateLink: url,
      sold,
      rating,
      shopName,
      location,
      available,
      url,
    };
  } catch (error: any) {
    console.error('Shopee scrape error:', error.message);
    return createFallbackProduct(url, 'Shopee', 'shopee');
  }
}

async function scrapeTiktok(url: string): Promise<ScrapedProduct> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  try {
    const response = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);

    let name = $('meta[property="og:title"]').attr('content') || '';
    let imageUrl = $('meta[property="og:image"]').attr('content') || '';
    let price = 0;

    // Clean name
    name = name.replace(/\s*\|\s*TikTok\s*Shop\s*$/i, '').trim();

    // Extract price
    const priceStr = $('meta[property="product:price:amount"]').attr('content') ||
                     $('[data-price]').attr('data-price') || '';
    if (priceStr) {
      price = parseFloat(priceStr) || 0;
    }

    return {
      name: name || 'TikTok Product',
      price,
      imageUrl,
      platform: 'tiktok',
      platformDisplay: 'TikTok Shop',
      affiliateLink: url,
      available: true,
      url,
    };
  } catch (error: any) {
    console.error('TikTok scrape error:', error.message);
    return createFallbackProduct(url, 'TikTok Shop', 'tiktok');
  }
}

async function scrapeTokopedia(url: string): Promise<ScrapedProduct> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  try {
    const response = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);

    let name = $('meta[property="og:title"]').attr('content') || '';
    let imageUrl = $('meta[property="og:image"]').attr('content') || '';
    let price = 0;

    // Clean name
    name = name.replace(/\s*-\s*Tokopedia\s*$/i, '').trim();

    // Extract price
    const priceStr = $('meta[property="product:price:amount"]').attr('content') || '';
    if (priceStr) {
      price = parseFloat(priceStr) || 0;
    }

    return {
      name: name || 'Tokopedia Product',
      price,
      imageUrl,
      platform: 'tokopedia',
      platformDisplay: 'Tokopedia',
      affiliateLink: url,
      available: true,
      url,
    };
  } catch (error: any) {
    console.error('Tokopedia scrape error:', error.message);
    return createFallbackProduct(url, 'Tokopedia', 'tokopedia');
  }
}

async function scrapeLazada(url: string): Promise<ScrapedProduct> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  try {
    const response = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);

    let name = $('meta[property="og:title"]').attr('content') || '';
    let imageUrl = $('meta[property="og:image"]').attr('content') || '';
    let price = 0;
    let originalPrice = 0;
    let discount = 0;
    let sold: number | undefined;
    let rating: number | undefined;
    let shopName: string | undefined;

    // Clean name
    name = name.replace(/\s*-\s*Lazada\s*Indonesia\s*$/i, '').trim();

    // Extract price
    const priceStr = $('meta[property="product:price:amount"]').attr('content') || '';
    if (priceStr) {
      price = parseFloat(priceStr) || 0;
    }

    // Extract from script data
    const scriptMatch = response.data.match(/window\.productDataZone\s*=\s*({.+?});/s);
    if (scriptMatch) {
      try {
        const data = JSON.parse(scriptMatch[1]);
        price = price || data.price || 0;
        originalPrice = data.originalPrice || 0;
        discount = data.discount || 0;
        sold = data.soldQuantity;
        rating = data.rating;
        shopName = data.sellerName;
      } catch (e) {
        // Ignore
      }
    }

    return {
      name: name || 'Lazada Product',
      price,
      originalPrice: originalPrice || undefined,
      discount: discount || undefined,
      imageUrl,
      platform: 'lazada',
      platformDisplay: 'Lazada',
      affiliateLink: url,
      sold,
      rating,
      shopName,
      available: true,
      url,
    };
  } catch (error: any) {
    console.error('Lazada scrape error:', error.message);
    return createFallbackProduct(url, 'Lazada', 'lazada');
  }
}

async function scrapeBlibli(url: string): Promise<ScrapedProduct> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  try {
    const response = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);

    const name = $('meta[property="og:title"]').attr('content') || 'Blibli Product';
    const imageUrl = $('meta[property="og:image"]').attr('content') || '';
    const priceStr = $('meta[property="product:price:amount"]').attr('content') || '0';
    const price = parseFloat(priceStr) || 0;

    return {
      name: name.replace(/\s*-\s*Blibli\s*$/i, '').trim(),
      price,
      imageUrl,
      platform: 'blibli',
      platformDisplay: 'Blibli',
      affiliateLink: url,
      available: true,
      url,
    };
  } catch (error: any) {
    console.error('Blibli scrape error:', error.message);
    return createFallbackProduct(url, 'Blibli', 'blibli');
  }
}

async function scrapeBukalapak(url: string): Promise<ScrapedProduct> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  try {
    const response = await axios.get(url, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);

    const name = $('meta[property="og:title"]').attr('content') || 'Bukalapak Product';
    const imageUrl = $('meta[property="og:image"]').attr('content') || '';
    const priceStr = $('meta[property="product:price:amount"]').attr('content') || '0';
    const price = parseFloat(priceStr) || 0;

    return {
      name: name.replace(/\s*-\s*Bukalapak\s*$/i, '').trim(),
      price,
      imageUrl,
      platform: 'bukalapak',
      platformDisplay: 'Bukalapak',
      affiliateLink: url,
      available: true,
      url,
    };
  } catch (error: any) {
    console.error('Bukalapak scrape error:', error.message);
    return createFallbackProduct(url, 'Bukalapak', 'bukalapak');
  }
}

// ============================================
// HELPERS
// ============================================

function createFallbackProduct(url: string, platformName: string, platformId: string): ScrapedProduct {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);

  // Extract meaningful name from URL
  let name = 'Product';
  for (const part of pathParts) {
    if (part.length > 3 && !part.match(/^\d+$/)) {
      name = decodeURIComponent(part)
        .replace(/-/g, ' ')
        .replace(/\./g, '')
        .replace(/\d{6,}/g, '') // Remove long numbers (IDs)
        .split(' ')
        .filter(w => w.length > 2)
        .slice(0, 6)
        .join(' ');
      break;
    }
  }

  return {
    name,
    price: 0,
    platform: platformId,
    platformDisplay: platformName,
    affiliateLink: url,
    available: true,
    url,
  };
}

/**
 * Format price to Indonesian Rupiah
 */
export function formatPrice(price: number): string {
  return `Rp ${price.toLocaleString('id-ID', { minimumFractionDigits: 0 })}`;
}

/**
 * Format discount percentage
 */
export function formatDiscount(discount: number): string {
  return `${discount}% OFF`;
}