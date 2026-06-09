// ============================================
// CONTENT CALENDAR AUTOMATION SERVICE
// Simple Queue + Auto-Schedule
// ============================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ScheduleSlot {
  platform: string;
  dayOfWeek: number;
  hour: number;
  minute: number;
  contentType: string;
  maxPosts: number;
}

/**
 * Get next scheduled time for a slot
 */
export function getNextSlotTime(slot: ScheduleSlot): Date {
  const now = new Date();
  const next = new Date();

  // Set to target time today
  next.setHours(slot.hour, slot.minute, 0, 0);

  // If time has passed today, move to next occurrence
  if (next <= now) {
    // Add days until we find the right day of week
    let daysToAdd = 1;
    while (next.getDay() !== slot.dayOfWeek) {
      next.setDate(next.getDate() + 1);
      daysToAdd++;
      if (daysToAdd > 7) break;
    }

    // If still in past, move to next week
    if (next <= now) {
      next.setDate(next.getDate() + 7);
    }
  }

  return next;
}

/**
 * Add content to queue
 */
export async function addToQueue(
  contentId: string,
  contentType: string,
  platform: string,
  brandId?: string,
  distributionId?: string
): Promise<{ success: boolean; queueId?: string; error?: string }> {
  try {
    const queueItem = await prisma.contentQueue.create({
      data: {
        brandId,
        contentId,
        distributionId,
        contentType,
        platform,
        status: 'PENDING',
      },
    });

    return { success: true, queueId: queueItem.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get pending queue items for a brand
 */
export async function getPendingQueue(brandId?: string, limit: number = 10) {
  const where: any = { status: 'PENDING' };
  if (brandId) where.brandId = brandId;

  return prisma.contentQueue.findMany({
    where,
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    take: limit,
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(brandId?: string) {
  const where = brandId ? { brandId } : {};

  const [pending, scheduled, posted, skipped] = await Promise.all([
    prisma.contentQueue.count({ where: { ...where, status: 'PENDING' } }),
    prisma.contentQueue.count({ where: { ...where, status: 'SCHEDULED' } }),
    prisma.contentQueue.count({ where: { ...where, status: 'POSTED' } }),
    prisma.contentQueue.count({ where: { ...where, status: 'SKIPPED' } }),
  ]);

  // Get by content type
  const byType = await prisma.contentQueue.groupBy({
    by: ['contentType'],
    where: { ...where, status: 'PENDING' },
    _count: true,
  });

  // Get by platform
  const byPlatform = await prisma.contentQueue.groupBy({
    by: ['platform'],
    where: { ...where, status: 'PENDING' },
    _count: true,
  });

  return {
    pending,
    scheduled,
    posted,
    skipped,
    total: pending + scheduled,
    byType: byType.reduce((acc, item) => {
      acc[item.contentType] = item._count;
      return acc;
    }, {} as Record<string, number>),
    byPlatform: byPlatform.reduce((acc, item) => {
      acc[item.platform] = item._count;
      return acc;
    }, {} as Record<string, number>),
  };
}

/**
 * Get posting schedule for a brand
 */
export async function getPostingSchedule(brandId?: string) {
  const where = brandId ? { brandId, isActive: true } : { isActive: true };

  const schedules = await prisma.postingSchedule.findMany({
    where,
    orderBy: [
      { dayOfWeek: 'asc' },
      { hour: 'asc' },
      { minute: 'asc' },
    ],
  });

  // Group by day of week
  const byDay = schedules.reduce((acc, slot) => {
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][slot.dayOfWeek];
    if (!acc[day]) acc[day] = [];
    acc[day].push({
      id: slot.id,
      platform: slot.platform,
      time: `${slot.hour.toString().padStart(2, '0')}:${slot.minute.toString().padStart(2, '0')}`,
      contentType: slot.contentType,
      maxPosts: slot.maxPosts,
    });
    return acc;
  }, {} as Record<string, any[]>);

  return { schedules, byDay };
}

/**
 * Set posting schedule slot
 */
export async function setScheduleSlot(
  platform: string,
  dayOfWeek: number,
  hour: number,
  minute: number,
  contentType: string,
  maxPosts: number = 1,
  brandId?: string
): Promise<{ success: boolean; slotId?: string; error?: string }> {
  try {
    // Check if slot already exists
    const existing = await prisma.postingSchedule.findFirst({
      where: {
        platform,
        dayOfWeek,
        hour,
        minute,
        ...(brandId ? { brandId } : {}),
      },
    });

    if (existing) {
      // Update existing
      await prisma.postingSchedule.update({
        where: { id: existing.id },
        data: {
          contentType,
          maxPosts,
          isActive: true,
        },
      });
      return { success: true, slotId: existing.id };
    }

    // Create new
    const slot = await prisma.postingSchedule.create({
      data: {
        brandId,
        platform,
        dayOfWeek,
        hour,
        minute,
        contentType,
        maxPosts,
        isActive: true,
      },
    });

    return { success: true, slotId: slot.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Remove posting schedule slot
 */
export async function removeScheduleSlot(slotId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.postingSchedule.delete({ where: { id: slotId } });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process queue - assign scheduled times based on posting schedule
 */
export async function processQueue(brandId?: string): Promise<{
  processed: number;
  scheduled: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let scheduled = 0;

  // Get posting schedules
  const schedules = await getPostingSchedule(brandId);

  // Get pending queue items
  const pending = await getPendingQueue(brandId, 50);

  // For each pending item, find next available slot
  for (const item of pending) {
    // Find matching schedule for content type
    const matchingSchedule = schedules.schedules.find(
      s => s.contentType === item.contentType && (s.platform === item.platform || s.platform === 'ANY')
    );

    if (!matchingSchedule) {
      // No schedule for this content type - use default next available time
      const nextSlot = new Date();
      nextSlot.setHours(10, 0, 0, 0); // Default 10:00 AM
      if (nextSlot <= new Date()) {
        nextSlot.setDate(nextSlot.getDate() + 1);
      }

      await prisma.contentQueue.update({
        where: { id: item.id },
        data: {
          scheduledFor: nextSlot,
          status: 'SCHEDULED',
        },
      });
      scheduled++;
    } else {
      // Calculate next slot time
      const slotTime = getNextSlotTime({
        platform: matchingSchedule.platform,
        dayOfWeek: matchingSchedule.dayOfWeek,
        hour: matchingSchedule.hour,
        minute: matchingSchedule.minute,
        contentType: matchingSchedule.contentType,
        maxPosts: matchingSchedule.maxPosts,
      });

      await prisma.contentQueue.update({
        where: { id: item.id },
        data: {
          scheduledFor: slotTime,
          status: 'SCHEDULED',
        },
      });
      scheduled++;
    }
  }

  return {
    processed: pending.length,
    scheduled,
    errors,
  };
}

/**
 * Mark queue item as posted
 */
export async function markAsPosted(queueId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.contentQueue.update({
      where: { id: queueId },
      data: {
        status: 'POSTED',
        postedAt: new Date(),
      },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Skip queue item
 */
export async function skipQueueItem(queueId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.contentQueue.update({
      where: { id: queueId },
      data: {
        status: 'SKIPPED',
        error: reason,
      },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Clear queue (remove pending items)
 */
export async function clearQueue(brandId?: string): Promise<{ success: boolean; deleted: number; error?: string }> {
  try {
    const where: any = { status: 'PENDING' };
    if (brandId) where.brandId = brandId;

    const result = await prisma.contentQueue.deleteMany({ where });
    return { success: true, deleted: result.count };
  } catch (error: any) {
    return { success: false, deleted: 0, error: error.message };
  }
}

// Day names for display
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
