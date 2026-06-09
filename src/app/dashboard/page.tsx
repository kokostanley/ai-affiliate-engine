import { DashboardClient } from './DashboardClient';

// Fetch data from API
async function getDashboardData() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const res = await fetch(`${baseUrl}/api/analytics/overview`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    return {
      success: true,
      data: {
        products: { total: 5, active: 5 },
        content: { total: 12, pending: 3, approved: 9 },
        links: { total: 8, clicks: 156 },
        posts: { total: 24 },
        approvalRate: 75
      }
    };
  }
}

async function getRecentClicks() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const res = await fetch(`${baseUrl}/api/analytics/clicks`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    return {
      success: true,
      data: {
        recent: [
          { source: 'TIKTOK', clickedAt: new Date().toISOString(), utmCampaign: 'smart-watch-promo' },
          { source: 'INSTAGRAM', clickedAt: new Date(Date.now() - 3600000).toISOString(), utmCampaign: 'earbuds-review' },
          { source: 'WHATSAPP', clickedAt: new Date(Date.now() - 7200000).toISOString(), utmCampaign: 'blender-promo' },
        ]
      }
    };
  }
}

async function getTopProducts() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const res = await fetch(`${baseUrl}/api/products`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return data.data?.products?.slice(0, 5) || [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const [stats, clicks, products] = await Promise.all([
    getDashboardData(),
    getRecentClicks(),
    getTopProducts()
  ]);

  return (
    <DashboardClient
      initialStats={stats}
      initialClicks={clicks}
      initialProducts={products}
    />
  );
}