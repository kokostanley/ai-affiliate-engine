// ============================================
// API ROUTES - ANALYTICS
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// GET /api/analytics/overview
// ============================================
router.get('/overview', async (req, res) => {
  try {
    const [totalProducts, activeProducts, totalContent, pendingContent, approvedContent, totalLinks, linkClicks, totalPosts] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.content.count(),
      prisma.content.count({ where: { approvalStatus: 'PENDING' } }),
      prisma.content.count({ where: { approvalStatus: 'APPROVED' } }),
      prisma.link.count(),
      prisma.link.aggregate({ _sum: { clicks: true } }),
      prisma.scheduledPost.count({ where: { status: 'PUBLISHED' } }),
    ]);

    res.json({
      success: true,
      data: {
        products: { total: totalProducts, active: activeProducts },
        content: { total: totalContent, pending: pendingContent, approved: approvedContent },
        links: { total: totalLinks, clicks: linkClicks._sum.clicks || 0 },
        posts: { total: totalPosts },
        approvalRate: totalContent > 0 ? Math.round((approvedContent / totalContent) * 100) : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch analytics' } });
  }
});

// ============================================
// GET /api/analytics/clicks
// ============================================
router.get('/clicks', async (req, res) => {
  try {
    const clicks = await prisma.clickLog.findMany({
      orderBy: { clickedAt: 'desc' },
      take: 500,
    });

    const clicksByDate: Record<string, number> = {};
    const clicksBySource: Record<string, number> = {};

    clicks.forEach(click => {
      const date = click.clickedAt.toISOString().split('T')[0];
      clicksByDate[date] = (clicksByDate[date] || 0) + 1;
      clicksBySource[click.source] = (clicksBySource[click.source] || 0) + 1;
    });

    res.json({ success: true, data: { total: clicks.length, byDate: clicksByDate, bySource: clicksBySource, recent: clicks.slice(0, 50) } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch clicks' } });
  }
});

// ============================================
// GET /api/analytics/content
// ============================================
router.get('/content', async (req, res) => {
  try {
    const [byType, byPlatform, recent] = await Promise.all([
      prisma.content.groupBy({ by: ['contentType'], _count: true }),
      prisma.content.groupBy({ by: ['platform'], _count: true }),
      prisma.content.findMany({ include: { product: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    res.json({
      success: true,
      data: {
        byType: byType.map(t => ({ type: t.contentType, count: t._count })),
        byPlatform: byPlatform.map(p => ({ platform: p.platform, count: p._count })),
        recent,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch content analytics' } });
  }
});

// ============================================
// GET /api/analytics/dashboard
// ============================================
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayClicks, recentPending, recentActivity] = await Promise.all([
      prisma.clickLog.count({ where: { clickedAt: { gte: today } } }),
      prisma.content.findMany({ where: { approvalStatus: 'PENDING' }, include: { product: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.scheduledPost.findMany({ orderBy: { postedAt: 'desc' }, take: 10, include: { product: { select: { name: true } } } }),
    ]);

    res.json({ success: true, data: { todayClicks, pendingCount: recentPending.length, recentPending, recentActivity } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard' } });
  }
});

export default router;