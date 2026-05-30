// ============================================
// Database Utilities for Telegram Bot (SQLite version)
// ============================================

import { PrismaClient } from '@prisma/client';
import type { BotSessionData, BotUser } from './types';

const prisma = new PrismaClient();

// ============================================
// Session Management
// ============================================

export async function getOrCreateSession(telegramId: string): Promise<BotUser> {
  let user = await prisma.telegramSession.findUnique({ where: { telegramId } });

  if (!user) {
    user = await prisma.telegramSession.create({
      data: { telegramId, state: 'START' },
    });
  }

  return {
    telegramId: user.telegramId,
    username: user.username ?? undefined,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    isAdmin: user.isAdmin,
    isApproved: user.isApproved,
  };
}

export async function updateUserInfo(
  telegramId: string,
  data: { username?: string; firstName?: string; lastName?: string }
): Promise<void> {
  await prisma.telegramSession.update({
    where: { telegramId },
    data: { username: data.username, firstName: data.firstName, lastName: data.lastName },
  });
}

export async function updateUserState(telegramId: string, state: string, stateData?: object): Promise<void> {
  await prisma.telegramSession.update({
    where: { telegramId },
    data: { state, stateData: stateData ? JSON.stringify(stateData) : undefined },
  });
}

export async function getSessionData(telegramId: string): Promise<BotSessionData | null> {
  const user = await prisma.telegramSession.findUnique({ where: { telegramId } });
  if (!user) return null;
  return {
    state: user.state as BotSessionData['state'],
    ...(user.stateData ? JSON.parse(user.stateData) : {}),
  } as BotSessionData;
}

// ============================================
// Product Operations
// ============================================

export async function getActiveProducts(): Promise<Array<{
  id: string; name: string; slug: string; category: string;
  affiliatePlatform: string; price: number; commission: number;
}>> {
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, slug: true, category: true, affiliatePlatform: true, price: true, commission: true },
    orderBy: { createdAt: 'desc' },
  });
  return products.map(p => ({ ...p, price: Number(p.price), commission: Number(p.commission) }));
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { links: { where: { status: 'ACTIVE' }, take: 1 } },
  });
}

// ============================================
// Content Operations
// ============================================

export async function getPendingContent(limit: number = 10) {
  return prisma.content.findMany({
    where: { approvalStatus: 'PENDING', status: 'DRAFT' },
    include: { product: { select: { id: true, name: true, slug: true, affiliatePlatform: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getContentById(id: string) {
  return prisma.content.findUnique({
    where: { id },
    include: { product: true, scheduledPosts: { take: 5, orderBy: { scheduledAt: 'desc' } } },
  });
}

export async function updateContentApproval(contentId: string, action: string, actionBy: string, reason?: string): Promise<void> {
  const updateData: any = {
    approvalStatus: action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'REGENERATED',
    approvedBy: actionBy,
  };

  if (action === 'approve') {
    updateData.approvedAt = new Date();
  } else if (action === 'reject') {
    updateData.rejectedAt = new Date();
    updateData.rejectedBy = actionBy;
    if (reason) updateData.rejectionReason = reason;
  }

  await prisma.content.update({ where: { id: contentId }, data: updateData });

  await prisma.approvalLog.create({
    data: { contentId, action: action.toUpperCase(), actionBy, notes: reason },
  });
}

export async function createContent(data: {
  productId: string; contentType: string; platform: string; hook?: string; script?: string;
  caption?: string; hashtags?: string[]; cta?: string; telegramText?: string; whatsappText?: string;
  tone?: string; language?: string; aiModel?: string; tokensUsed?: number;
}) {
  return prisma.content.create({
    data: {
      productId: data.productId, contentType: data.contentType, platform: data.platform,
      hook: data.hook, script: data.script, caption: data.caption,
      hashtags: data.hashtags ? JSON.stringify(data.hashtags) : undefined,
      cta: data.cta, telegramText: data.telegramText, whatsappText: data.whatsappText,
      tone: data.tone || 'casual', language: data.language || 'id',
      aiModel: data.aiModel, tokensUsed: data.tokensUsed || 0,
      status: 'DRAFT', approvalStatus: 'PENDING',
    },
  });
}

// ============================================
// Analytics Operations
// ============================================

export async function getSystemStats() {
  const [totalProducts, activeProducts, pendingContent, approvedContent, totalClicks, todayPosts] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.content.count({ where: { approvalStatus: 'PENDING' } }),
    prisma.content.count({ where: { approvalStatus: 'APPROVED' } }),
    prisma.link.aggregate({ _sum: { clicks: true } }),
    prisma.scheduledPost.count({ where: { postedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
  ]);

  return { totalProducts, activeProducts, pendingContent, approvedContent, totalClicks: totalClicks._sum.clicks || 0, todayPosts };
}

export async function getUserStats(telegramId: string) {
  const user = await prisma.telegramSession.findUnique({ where: { telegramId } });
  return { approvedCount: user?.approvedCount || 0, rejectedCount: user?.rejectedCount || 0 };
}

export async function updateUserStats(telegramId: string, approved: boolean) {
  const data = approved ? { approvedCount: { increment: 1 } } : { rejectedCount: { increment: 1 } };
  return prisma.telegramSession.update({ where: { telegramId }, data });
}

export async function isAdmin(telegramId: string): Promise<boolean> {
  const user = await prisma.telegramSession.findUnique({ where: { telegramId } });
  return user?.isAdmin || false;
}

export async function getAdminChatIds(): Promise<string[]> {
  const admins = await prisma.telegramSession.findMany({ where: { isAdmin: true }, select: { telegramId: true } });
  return admins.map(a => a.telegramId);
}

export { prisma };