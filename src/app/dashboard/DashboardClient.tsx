'use client';

import { useBrand } from '@/contexts/BrandContext';
import { RequireBrand } from '@/components/RequireBrand';
import { Package, Link2, FileText, MousePointerClick } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { QuickActions } from '@/components/QuickActions';

interface DashboardClientProps {
  initialStats: any;
  initialClicks: any;
  initialProducts: any[];
}

export function DashboardClient({ initialStats, initialClicks, initialProducts }: DashboardClientProps) {
  const { selectedBrand } = useBrand();

  const data = initialStats.data || {};
  const recentClicks = initialClicks.data?.recent || [];

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
     <div className="border-b border-gray-800 bg-[#0f172a] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-gray-400">
              {selectedBrand ? `Brand: ${selectedBrand.name}` : 'Pilih brand untuk melihat data'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Products"
            value={data.products?.total || 0}
            icon={<Package className="h-6 w-6" />}
            iconColor="text-blue-400 bg-blue-400/10"
            change="+2 this week"
            changeType="positive"
          />
          <StatCard
            title="Total Links"
            value={data.links?.total || 0}
            icon={<Link2 className="h-6 w-6" />}
            iconColor="text-green-400 bg-green-400/10"
            change="+3 this week"
            changeType="positive"
          />
          <StatCard
            title="Total Content"
            value={data.content?.total || 0}
            icon={<FileText className="h-6 w-6" />}
            iconColor="text-purple-400 bg-purple-400/10"
            change={`${data.content?.pending || 0} pending`}
            changeType="neutral"
          />
          <StatCard
            title="Total Clicks"
            value={data.links?.clicks || 0}
            icon={<MousePointerClick className="h-6 w-6" />}
            iconColor="text-orange-400 bg-orange-400/10"
            change="+12% from last week"
            changeType="positive"
          />
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">Quick Actions</h2>
          <QuickActions />
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top Products */}
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Top Products</h3>
              <a href="/products" className="text-sm text-blue-400 hover:text-blue-300">View all →</a>
            </div>
            <div className="space-y-3">
              {initialProducts.length > 0 ? initialProducts.map((product: any, i: number) => (
                <div key={product.id || i} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <div>
                    <p className="font-medium text-white">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.affiliatePlatform}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-white">{(product.price as number)?.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })}</p>
                    <p className="text-xs text-gray-400">{product.commission}% komisi</p>
                  </div>
                </div>
              )) : (
                <p className="text-gray-400 text-sm">No products yet</p>
              )}
            </div>
          </div>

          {/* Recent Clicks */}
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Recent Clicks</h3>
              <a href="/analytics" className="text-sm text-blue-400 hover:text-blue-300">View all →</a>
            </div>
            <div className="space-y-3">
              {recentClicks.length > 0 ? recentClicks.map((click: any, i: number) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-blue-400/10 p-2">
                      <MousePointerClick className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{click.source || 'DIRECT'}</p>
                      <p className="text-xs text-gray-400">{click.utmCampaign || 'Organic'}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(click.clickedAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )) : (
                <p className="text-gray-400 text-sm">No clicks yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}