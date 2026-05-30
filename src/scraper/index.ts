// ============================================
// Product Scraper Service
// Extracts product info from affiliate links
// ============================================

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapedProduct {
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  description?: string;
  category?: string;
  rating?: number;
  sold?: number;
  shop?: string;
  platform: string;
  affiliateLink: string;
  productId?: string;
}

export type Platform = 'shopee' | 'tiktok' | 'tokopedia' | 'lazada' | 'unknown';

const PLATFORM_PATTERNS = {
  shopee: /shopee\.co\.id/i,
  tiktok: /tiktok\.com/i,
  tokopedia: /tokopedia\.com/i,
  lazada: /lazada\.co\.id/i,
};

const PLATFORM_NAMES = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  tokopedia: 'Tokopedia',
  lazada: 'Lazada',
};

/**
 * Detect platform from URL
 */
export function detectPlatform(url: string): Platform {
  for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    if (pattern.test(url)) {
      return platform as Platform;
    }
  }
  return 'unknown';
}

/**
 * Detect platform name
 */
export function getPlatformName(platform: Platform): string {
  return PLATFORM_NAMES[platform] || 'Unknown';
}

/**
 * Main scrape function - routes to platform-specific scraper
 */
export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const platform = detectPlatform(url);

  switch (platform) {
    case 'shopee':
      return scrapeShopee(url);
    case 'tiktok':
      return scrapeTiktok(url);
    case 'tokopedia':
      return scrapeTokopedia(url);
    case 'lazada':
      return scrapeLazada(url);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Extract product ID from Shopee URL
 */
function extractShopeeProductId(url: string): string | null {
  // Pattern: shopee.co.id/product-name.123456789.1234567890
  const match = url.match(/\.i\.(\d+)\.(\d+)/);
  return match ? match[2] : null;
}

/**
 * Scrape Shopee product
 */
async function scrapeShopee(url: string): Promise<ScrapedProduct> {
  try {
    const productId = extractShopeeProductId(url);

    // Use Shopee API directly for better results
    const shopIdMatch = url.match(/shopee\.co\.id\/[\w-]+-i\.(\d+)/);
    const shopId = shopIdMatch ? shopIdMatch[1] : null;

    // Try to scrape basic info from page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    // Try to extract from page data
    let name = '';
    let price = 0;
    let imageUrl = '';
    let description = '';
    let category = '';

    // Look for JSON-LD data
    const jsonLdMatch = response.data.match(/"name"\s*:\s*"([^"]+)"/);
    if (jsonLdMatch) name = jsonLdMatch[1];

    // Look for price in page
    const priceMatch = response.data.match(/(\d{1,3}(?:[.,]\d{3})*)/);

    // Look for image
    const imgMatch = response.data.match(/"image"\s*:\s*"([^"]+)"/);
    if (imgMatch) imageUrl = imgMatch[1];

    // Extract from meta tags as fallback
    if (!name) name = $('meta[property="og:title"]').attr('content') || '';
    if (!imageUrl) imageUrl = $('meta[property="og:image"]').attr('content') || '';
    if (!price) {
      const priceText = $('meta[property="product:price:amount"]').attr('content');
      if (priceText) price = parseFloat(priceText);
    }

    // Clean name
    name = name.replace(' - Shopee Indonesia', '').replace(' - Official Shopee', '').trim();

    // Parse price from text
    if (!price) {
      const priceStr = response.data.match(/Rp\s*([\d.,]+)/)?.[1] || '0';
      price = parseInt(priceStr.replace(/[.,]/g, ''));
    }

    return {
      name: name || 'Shopee Product',
      price: price || 0,
      imageUrl,
      description,
      platform: 'Shopee',
      affiliateLink: url,
      productId: productId || undefined,
    };
  } catch (error) {
    console.error('Shopee scrape error:', error);

    // Return basic info from URL
    return {
      name: extractProductNameFromUrl(url) || 'Shopee Product',
      price: extractPriceFromUrl(url),
      platform: 'Shopee',
      affiliateLink: url,
    };
  }
}

/**
 * Scrape TikTok product
 */
async function scrapeTiktok(url: string): Promise<ScrapedProduct> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    const name = $('meta[property="og:title"]').attr('content') || 'TikTok Product';
    const imageUrl = $('meta[property="og:image"]').attr('content') || '';
    const priceText = $('meta[property="product:price:amount"]').attr('content') || '0';

    return {
      name: name.replace(' | TikTok Shop', '').trim(),
      price: parseFloat(priceText) || 0,
      imageUrl,
      platform: 'TikTok Shop',
      affiliateLink: url,
    };
  } catch (error) {
    console.error('TikTok scrape error:', error);
    return {
      name: extractProductNameFromUrl(url) || 'TikTok Product',
      price: extractPriceFromUrl(url),
      platform: 'TikTok Shop',
      affiliateLink: url,
    };
  }
}

/**
 * Scrape Tokopedia product
 */
async function scrapeTokopedia(url: string): Promise<ScrapedProduct> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    const name = $('meta[property="og:title"]').attr('content') || 'Tokopedia Product';
    const imageUrl = $('meta[property="og:image"]').attr('content') || '';
    const priceText = $('meta[property="product:price:amount"]').attr('content') || '0';

    return {
      name: name.replace(' - Tokopedia', '').trim(),
      price: parseFloat(priceText) || 0,
      imageUrl,
      platform: 'Tokopedia',
      affiliateLink: url,
    };
  } catch (error) {
    console.error('Tokopedia scrape error:', error);
    return {
      name: extractProductNameFromUrl(url) || 'Tokopedia Product',
      price: extractPriceFromUrl(url),
      platform: 'Tokopedia',
      affiliateLink: url,
    };
  }
}

/**
 * Scrape Lazada product
 */
async function scrapeLazada(url: string): Promise<ScrapedProduct> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    const name = $('meta[property="og:title"]').attr('content') || 'Lazada Product';
    const imageUrl = $('meta[property="og:image"]').attr('content') || '';
    const priceText = $('meta[property="product:price:amount"]').attr('content') || '0';

    return {
      name: name.replace(' - Lazada', '').trim(),
      price: parseFloat(priceText) || 0,
      imageUrl,
      platform: 'Lazada',
      affiliateLink: url,
    };
  } catch (error) {
    console.error('Lazada scrape error:', error);
    return {
      name: extractProductNameFromUrl(url) || 'Lazada Product',
      price: extractPriceFromUrl(url),
      platform: 'Lazada',
      affiliateLink: url,
    };
  }
}

/**
 * Extract product name from URL as fallback
 */
function extractProductNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // Find the product name part
    for (const part of pathParts) {
      if (!['product', 'shop', 'seller', 'item'].includes(part.toLowerCase())) {
        return decodeURIComponent(part)
          .replace(/-/g, ' ')
          .replace(/\./g, ' ')
          .replace(/\d+\.\d+/g, '') // Remove IDs
          .trim()
          .split(' ')
          .filter(w => w.length > 2)
          .slice(0, 8)
          .join(' ');
      }
    }
    return 'Product';
  } catch {
    return 'Product';
  }
}

/**
 * Extract price from URL as fallback (for cases where price is in URL)
 */
function extractPriceFromUrl(url: string): number {
  const priceMatch = url.match(/(\d{4,})/);
  return priceMatch ? parseInt(priceMatch[1]) : 0;
}

/**
 * Validate affiliate link format
 */
export function isValidAffiliateLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    const validDomains = [
      'shopee.co.id',
      'tiktok.com',
      'tokopedia.com',
      'lazada.co.id',
      'blibli.com',
      'bukalapak.com',
    ];

    return validDomains.some(domain => hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Get example affiliate link for platform
 */
export function getExampleLink(platform: Platform): string {
  const examples: Record<Platform, string> = {
    shopee: 'https://shopee.co.id/example-product.123456789.1234567890',
    tiktok: 'https://www.tiktok.com/shop/product/example-123',
    tokopedia: 'https://www.tokopedia.com/example/product/example-123',
    lazada: 'https://www.lazada.co.id/products/example-123.html',
    unknown: '',
  };
  return examples[platform];
}