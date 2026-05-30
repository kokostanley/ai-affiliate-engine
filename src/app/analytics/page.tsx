'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { StatCard } from '@/components/StatCard';
import { MousePointerClick, Package, FileText, TrendingUp } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface AnalyticsData {
  products?: any[];
  clicks?: any;
  content?: any;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<any>(null);
  const [clicksBySource, setClicksBySource] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [overviewRes, clicksRes] = await Promise.all([
        fetch('/api/analytics/overview'),
        fetch('/api/analytics/clicks'),
      ]);

      const overviewData = await overviewRes.json();
      const clicksData = await clicksRes.json();

      if (overviewData.success) {
        setOverview(overviewData.data);
      }

      if (clicksData.success) {
        setClicksBySource(clicksData.data?.bySource || {});
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const sourceColors: Record<string, string> = {
    TIKTOK: 'text-pink-400',
    INSTAGRAM: 'text-purple-400',
    FACEBOOK: 'text-blue-400',
    YOUTUBE: 'text-red-400',
    WHATSAPP: 'text-green-400',
    TELEGRAM: 'text-cyan-400',
    DIRECT: 'text-gray-400',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a]">
        <Header title="Analytics" description="Analytics dan statistik" />
        <div className="p-6">
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-12 text-center">
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Analytics" description="Analytics dan statistik affiliate" />

      <div className="p-6 space-y-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Products"
            value={overview?.products?.total || 0}
            icon={<Package className="h-6 w-6" />}
            iconColor="text-blue-400 bg-blue-400/10"
          />
          <StatCard
            title="Total Clicks"
            value={overview?.links?.clicks || 0}
            icon={<MousePointerClick className="h-6 w-6" />}
            iconColor="text-orange-400 bg-orange-400/10"
          />
          <StatCard
            title="Total Content"
            value={overview?.content?.total || 0}
            icon={<FileText className="h-6 w-6" />}
            iconColor="text-purple-400 bg-purple-400/10"
          />
          <StatCard
            title="Approval Rate"
            value={`${overview?.approvalRate || 0}%`}
            icon={<TrendingUp className="h-6 w-6" />}
            iconColor="text-green-400 bg-green-400/10"
            change={`${overview?.content?.approved || 0} approved`}
          />
        </div>

        {/* Clicks by Source */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="	rounded-xl border border-gray-800 bg-[#0f172a] p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Clicks by Platform</h3>
            <div className="space-y-3">
              {Object.entries(clicksBySource).length > 0 ? (
                Object.entries(clicksBySource).map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`font-medium ${sourceColors[source] || 'text-gray-400'}`}>
                        {source}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 rounded-full bg-gray-800">
                        <div
                          className={`h-2 rounded-full ${sourceColors[source]?.replace('text-', 'bg-') || 'bg-gray-400'}`}
                          style={{
                            width: `${Math.min((count / Math.max(...Object.values(clicksBySource))) * 100, 100)}%`
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-400 w-12 text-right">{count}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">No click data yet</p>
              )}
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Content Status</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Total Content</span>
                <span className="font-medium text-white">{overview?.content?.total || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Approved</span>
                <div className="flex items-center gap-2">
                  <span className="text-green-400">{overview?.content?.approved || 0}</span>
                  <span className="text-xs text-gray-500">
                    ({overview?.content?.total ? Math.round((overview?.content?.approved / overview?.content?.total) * 100) : 0}%)
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Pending</span>
                <span className="text-yellow-400">{overview?.content?.pending || 0}</span>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-400 mb-3">Content Progress</h4>
              <div className="h-3 w-full rounded-full bg-gray-800">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-500"
                  style={{
                    width: `${overview?.approvalRate || 0}%`
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-500">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}