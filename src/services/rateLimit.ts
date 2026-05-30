// ============================================
// Rate Limit Service
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Rate limit intervals in milliseconds
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

// Store rate limit data in memory (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Check if a request should be rate limited
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  // If no record or expired, create new record
  if (!record || now > record.resetTime) {
    const resetTime = now + RATE_LIMIT_WINDOW;
    rateLimitStore.set(identifier, { count: 1, resetTime });
    return { allowed: true, remaining: maxRequests - 1, resetTime };
  }

  // If within window, check count
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  // Increment count
  record.count++;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

/**
 * Start the rate limit cleaner (runs periodically)
 */
export function startRateLimitCleaner(): void {
  // Clean up expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    rateLimitStore.forEach((value, key) => {
      if (now > value.resetTime) {
        rateLimitStore.delete(key);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`[RateLimit] Cleaned ${cleaned} expired entries`);
    }
  }, 5 * 60 * 1000);

  console.log('[RateLimit] Cleaner started');
}

/**
 * Get rate limit status for an identifier
 */
export function getRateLimitStatus(identifier: string): {
  count: number;
  remaining: number;
  resetTime: number;
} | null {
  const record = rateLimitStore.get(identifier);

  if (!record) {
    return null;
  }

  return {
    count: record.count,
    remaining: 100 - record.count,
    resetTime: record.resetTime,
  };
}

/**
 * Reset rate limit for an identifier
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Check platform-specific posting limits
 */
export async function checkPlatformRateLimit(platform: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const rateLimit = await prisma.rateLimit.findUnique({
    where: { platform: platform as any },
  });

  if (!rateLimit) {
    return { allowed: true };
  }

  const now = new Date();

  // Reset daily if needed
  if (now.getDate() !== rateLimit.lastResetAt.getDate()) {
    await prisma.rateLimit.update({
      where: { platform: platform as any },
      data: {
        dailyUsed: 0,
        lastResetAt: now,
      },
    });
    return { allowed: true };
  }

  // Check daily limit
  if (rateLimit.dailyUsed >= rateLimit.dailyLimit) {
    return {
      allowed: false,
      reason: `Daily limit reached for ${platform}. Limit: ${rateLimit.dailyLimit}`,
    };
  }

  return { allowed: true };
}

/**
 * Record a platform post
 */
export async function recordPlatformPost(platform: string): Promise<void> {
  await prisma.rateLimit.upsert({
    where: { platform: platform as any },
    update: {
      dailyUsed: { increment: 1 },
      weeklyUsed: { increment: 1 },
      monthlyUsed: { increment: 1 },
    },
    create: {
      platform: platform as any,
      dailyUsed: 1,
      weeklyUsed: 1,
      monthlyUsed: 1,
    },
  });
}