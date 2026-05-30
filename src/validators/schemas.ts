// ============================================
// Validators Schema (Simplified for SQLite)
// ============================================

export const productIdSchema = z.object({ id: z.string() });
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

import { z } from 'zod';

// Product schemas
export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  price: z.number().positive(),
  commission: z.number().min(0).max(100),
  affiliatePlatform: z.string(),
  affiliateLink: z.string().url(),
  imageUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
});

export const updateProductSchema = createProductSchema.partial();

// Content schemas
export const createContentSchema = z.object({
  productId: z.string(),
  contentType: z.string(),
  platform: z.string(),
  hook: z.string().optional(),
  script: z.string().optional(),
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  cta: z.string().optional(),
  tone: z.string().default('casual'),
  language: z.string().default('id'),
});

// Approval schemas
export const approveContentSchema = z.object({
  contentId: z.string(),
  notes: z.string().optional(),
});

export const rejectContentSchema = z.object({
  contentId: z.string(),
  reason: z.string().min(1),
});

export type CreateProduct = z.infer<typeof createProductSchema>;
export type CreateContent = z.infer<typeof createContentSchema>;