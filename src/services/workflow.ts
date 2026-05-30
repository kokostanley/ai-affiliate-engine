// ============================================
// Workflow Service
// Core operations: add, regenerate, preview
// ============================================

import { PrismaClient } from '@prisma/client';
import { scrapeProduct, isValidAffiliateLink, detectPlatform } from '../scraper';
import { generateContentPack } from '../lib/openai-content';
import slugify from 'slugify';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

export interface WorkflowResult {
  success: boolean;
  productId?: string;
  contentId?: string;
  linkId?: string;
  error?: string;
}

export interface PreviewData {
  product: {
    id: string;
    name: string;
    price: number;
    platform: string;
    imageUrl?: string;
  };
  hooks: string[];
  captions: string[];
  ctas: string[];
  scripts: string[];
  hashtags: string[];
  angles: string[];
  link: {
    id: string;
    shortUrl: string;
  };
}

/**
 * Main add workflow
 */
export async function runAddWorkflow(
  affiliateLink: string
): Promise<WorkflowResult> {
  try {
    // Validate
    if (!isValidAffiliateLink(affiliateLink)) {
      return { success: false, error: 'Invalid link. Supported: Shopee, TikTok, Tokopedia, Lazada' };
    }

    // Scrape
    console.log('[Workflow] Scraping:', affiliateLink);
    const scraped = await scrapeProduct(affiliateLink);

    // Create product
    let slug = slugify(scraped.name || 'product', { lower: true, strict: true }).slice(0, 50);
    slug = `${slug}-${nanoid(6)}`;

    console.log('[Workflow] Creating product:', scraped.name);

    const product = await prisma.product.create({
      data: {
        name: scraped.name || 'Product',
        slug,
        category: scraped.category || 'Uncategorized',
        price: scraped.price || 0,
        commission: 10,
        commissionAmount: (scraped.price || 0) * 0.1,
        affiliatePlatform: scraped.platform || detectPlatform(affiliateLink),
        affiliateLink,
        imageUrl: scraped.imageUrl,
        description: scraped.description,
        status: 'ACTIVE',
      },
    });

    // Generate content
    console.log('[Workflow] Generating content for:', product.name);
    const contentPack = await generateContentPack({
      productName: product.name,
      productDescription: scraped.description || '',
      productPrice: scraped.price || 0,
      productCategory: scraped.category,
    });

    // Save content
    const content = await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'MIXED_CONTENT',
        platform: 'ALL',
        hook: contentPack.hooks[0] || '',
        script: contentPack.scripts[0] || '',
        caption: contentPack.captions[0] || '',
        hashtags: contentPack.hashtags.slice(0, 20).join(','),
        cta: contentPack.ctas[0] || '',
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: 'casual',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    // Create tracking link
    await prisma.link.create({
      data: {
        productId: product.id,
        slug,
        originalLink: affiliateLink,
        status: 'ACTIVE',
      },
    });

    console.log('[Workflow] Done:', product.id);

    return {
      success: true,
      productId: product.id,
      contentId: content.id,
    };
  } catch (error: any) {
    console.error('[Workflow] Error:', error);
    return { success: false, error: error.message || 'Workflow failed' };
  }
}

/**
 * Manual add (when scraper fails)
 */
export async function runManualWorkflow(data: {
  name: string;
  category: string;
  price: number;
  affiliateLink: string;
}): Promise<WorkflowResult> {
  try {
    let slug = slugify(data.name, { lower: true, strict: true }).slice(0, 50);
    slug = `${slug}-${nanoid(6)}`;

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug,
        category: data.category,
        price: data.price,
        commission: 10,
        commissionAmount: data.price * 0.1,
        affiliatePlatform: detectPlatform(data.affiliateLink),
        affiliateLink: data.affiliateLink,
        status: 'ACTIVE',
      },
    });

    const contentPack = await generateContentPack({
      productName: data.name,
      productPrice: data.price,
      productCategory: data.category,
    });

    await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'MIXED_CONTENT',
        platform: 'ALL',
        hook: contentPack.hooks[0] || '',
        caption: contentPack.captions[0] || '',
        hashtags: contentPack.hashtags.slice(0, 20).join(','),
        cta: contentPack.ctas[0] || '',
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: 'casual',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    await prisma.link.create({
      data: {
        productId: product.id,
        slug,
        originalLink: data.affiliateLink,
        status: 'ACTIVE',
      },
    });

    return { success: true, productId: product.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get preview with full variations
 */
export async function getPreviewData(productId: string): Promise<PreviewData | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { links: { take: 1 } },
  });

  if (!product) return null;

  const content = await prisma.content.findFirst({
    where: { productId },
    orderBy: { createdAt: 'desc' },
  });

  const link = product.links[0];
  if (!link) return null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return {
    product: {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      platform: product.affiliatePlatform,
      imageUrl: product.imageUrl || undefined,
    },
    hooks: content?.hook?.split('\n').filter(Boolean) || [],
    captions: content?.caption?.split('\n\n').filter(Boolean) || [],
    ctas: content?.cta?.split('\n').filter(Boolean) || [],
    scripts: content?.script?.split('\n').filter(Boolean) || [],
    hashtags: content?.hashtags?.split(',').filter(Boolean) || [],
    angles: ['Price', 'Quality', 'Urgency'],
    link: {
      id: link.id,
      shortUrl: `${baseUrl}/go/${link.slug}`,
    },
  };
}

/**
 * Regenerate content
 */
export async function regenerateContent(productId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return { success: false, error: 'Product not found' };

    const contentPack = await generateContentPack({
      productName: product.name,
      productDescription: product.description || '',
      productPrice: Number(product.price),
      productCategory: product.category,
    });

    await prisma.content.updateMany({
      where: { productId },
      data: { approvalStatus: 'REGENERATED' },
    });

    await prisma.content.create({
      data: {
        productId: product.id,
        contentType: 'MIXED_CONTENT',
        platform: 'ALL',
        hook: contentPack.hooks[0] || '',
        caption: contentPack.captions[0] || '',
        hashtags: contentPack.hashtags.slice(0, 20).join(','),
        cta: contentPack.ctas[0] || '',
        telegramText: contentPack.telegramText,
        whatsappText: contentPack.whatsappText,
        tone: 'casual',
        language: 'id',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
      },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Approve content
 */
export async function approveContent(productId: string): Promise<void> {
  const content = await prisma.content.findFirst({
    where: { productId, approvalStatus: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  if (content) {
    await prisma.content.update({
      where: { id: content.id },
      data: { approvalStatus: 'APPROVED', approvedAt: new Date() },
    });
  }
}

/**
 * Reject content
 */
export async function rejectContent(productId: string, reason?: string): Promise<void> {
  const content = await prisma.content.findFirst({
    where: { productId, approvalStatus: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  if (content) {
    await prisma.content.update({
      where: { id: content.id },
      data: { approvalStatus: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
    });
  }
}

/**
 * Pause/unpause product
 */
export async function toggleProductStatus(productId: string): Promise<string> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Product not found');

  const newStatus = product.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';

  await prisma.product.update({
    where: { id: productId },
    data: { status: newStatus },
  });

  return newStatus;
}

/**
 * Delete product
 */
export async function deleteProduct(productId: string): Promise<void> {
  await prisma.product.delete({ where: { id: productId } });
}
