'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, Copy, ExternalLink, MousePointerClick, 
  TrendingUp, Users, ShoppingCart, DollarSign, Pause, Play, 
  ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';

interface TrackedLink {
  id: string;
  productId: string | null;
  originalLink: string;
  trackingLink: string | null;
  shortCode: string | null;
  currentPipelineStage: string;
  pipelineHistory: { stage: string; timestamp: string; note?: string }[];
  clicks: number;
  uniqueClicks: number;
  leads: number;
  sales: number;
  revenue: number;
  commission: number;
  conversionRate: number;
  platform: string | null;
  contentType: string | null;
  status: string;
  createdAt: string;
  product?: { id: string; name: string; slug: string; price: number } | null;
  brand?: { id: string; name: string; slug: string } | null;
}

export default function LinksPage() {
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchLinks();
    fetchStats();
  }, [filterPlatform, filterStatus]);

  const fetchLinks = async () => {
    try {
      setLoading(true);
      let url = '/api/links/tracking?limit=100';
      if (filterPlatform) url += '&platform=' + filterPlatform;
      if (filterStatus) url += '&status=' + filterStatus;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setLinks(data.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/links/tracking/stats');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handlePause = async (id: string) => {
    await fetch('/api/links/tracking/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' }),
    });
    fetchLinks();
    fetchStats();
  };

  const handleActivate = async (id: string) => {
    await fetch('/api/links/tracking/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'activate' }),
    });
    fetchLinks();
    fetchStats();
  };

  const toggleExpand = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-400/10 text-green-400',
    PAUSED: 'bg-yellow-400/10 text-yellow-400',
    EXPIRED: 'bg-gray-400/10 text-gray-400',
  };

  const stageColors: Record<string, string> = {
    PRODUCT_CREATED: 'bg-blue-400/10 text-blue-400',
    CONTENT_GENERATED: 'bg-purple-400/10 text-purple-400',
    APPROVED: 'bg-cyan-400/10 text-cyan-400',
    DISTRIBUTED: 'bg-orange-400/10 text-orange-400',
    POSTED: 'bg-teal-400/10 text-teal-400',
    ACTIVE: 'bg-green-400/10 text-green-400',
    PAUSED: 'bg-yellow-400/10 text-yellow-400',
    EXPIRED: 'bg-gray-400/10 text-gray-400',
  };

  const stageIcons: Record<string, string> = {
    PRODUCT_CREATED: '📦', CONTENT_GENERATED: '📝', APPROVED: '✅',
    DISTRIBUTED: '📨', POSTED: '📤', ACTIVE: '🟢', PAUSED: '⏸️', EXPIRED: '⏹️',
  };

  const formatStage = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/w/g, c => c.toUpperCase());

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Link Tracking" description="Monitor performa dan pipeline semua link affiliate" />
      <div className="p-6 space-y-6">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatBox icon={<MousePointerClick className="h-4 w-4" />} label="Total Links" value={stats.totalLinks} />
            <StatBox icon={<TrendingUp className="h-4 w-4" />} label="Clicks" value={stats.totalClicks} />
            <StatBox icon={<Users className="h-4 w-4" />} label="Leads" value={stats.totalLeads} />
            <StatBox icon={<ShoppingCart className="h-4 w-4" />} label="Sales" value={stats.totalSales} />
            <StatBox icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={'Rp ' + Number(stats.totalRevenue).toLocaleString('id-ID')} color="text-green-400" />
            <StatBox icon={<DollarSign className="h-4 w-4" />} label="Commission" value={'Rp ' + Number(stats.totalCommission).toLocaleString('id-ID')} color="text-blue-400" />
          </div>
        )}

        <div className="flex items-center gap-4">
          <select 
            className="bg-[#1e293b] text-white rounded-lg px-3 py-2 border border-gray-700"
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
          >
            <option value="">All Platforms</option>
            <option value="TIKTOK">TikTok</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="YOUTUBE">YouTube</option>
          </select>
          <select 
            className="bg-[#1e293b] text-white rounded-lg px-3 py-2 border border-gray-700"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="EXPIRED">Expired</option>
          </select>
          <Button variant="outline" size="sm" onClick={fetchLinks}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-12 text-center">
            <p className="text-gray-400">Loading...</p>
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-12 text-center">
            <p className="text-gray-400 mb-4">No tracking links yet</p>
            <p className="text-sm text-gray-500">Create a product first to generate tracking links</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0f172a]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Link</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Platform</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Clicks</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Leads</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Sales</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {links.map((link) => (
                  <React.Fragment key={link.id}>
                    <tr className="hover:bg-gray-800/50">
                      <td className="px-4 py-4">
                        <code className="rounded bg-gray-800 px-2 py-1 text-sm text-blue-400">
                          {link.shortCode ? link.shortCode.substring(0, 12) : link.id.substring(0, 8)}
                        </code>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">{link.product?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-400">{link.brand?.name || ''}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-300">{link.platform || '-'}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusColors[link.status]}`}>
                          {stageIcons[link.currentPipelineStage]} {formatStage(link.currentPipelineStage)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 text-white">
                          <MousePointerClick className="h-4 w-4 text-gray-400" />
                          <span>{link.clicks}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-white">{link.leads}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-white">{link.sales}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-green-400">Rp {Number(link.revenue).toLocaleString('id-ID')}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusColors[link.status]}`}>
                          {link.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleExpand(link.id)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                          >
                            {expandedRow === link.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          {link.status === 'PAUSED' ? (
                            <button onClick={() => handleActivate(link.id)} className="rounded p-1.5 text-green-400 hover:bg-green-400/10" title="Activate">
                              <Play className="h-4 w-4" />
                            </button>
                          ) : (
                            <button onClick={() => handlePause(link.id)} className="rounded p-1.5 text-yellow-400 hover:bg-yellow-400/10" title="Pause">
                              <Pause className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedRow === link.id && (
                      <tr className="bg-gray-900/50">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div><p className="text-gray-400 mb-1">Original Link</p><p className="text-blue-300 truncate">{link.originalLink}</p></div>
                            <div><p className="text-gray-400 mb-1">Tracking Link</p><p className="text-blue-300 truncate">{link.trackingLink || '-'}</p></div>
                            <div><p className="text-gray-400 mb-1">Content Type</p><p className="text-white">{link.contentType || '-'}</p></div>
                            <div><p className="text-gray-400 mb-1">Conversion</p><p className="text-white">{(link.conversionRate * 100).toFixed(2)}%</p></div>
                            <div><p className="text-gray-400 mb-1">Unique Clicks</p><p className="text-white">{link.uniqueClicks}</p></div>
                            <div><p className="text-gray-400 mb-1">Commission</p><p className="text-blue-400">Rp {Number(link.commission).toLocaleString('id-ID')}</p></div>
                            <div><p className="text-gray-400 mb-1">Created</p><p className="text-white">{new Date(link.createdAt).toLocaleDateString('id-ID')}</p></div>
                            <div><p className="text-gray-400 mb-1">Pipeline</p><div>{link.pipelineHistory.slice(-3).map((h,i) => <p key={i} className="text-xs text-gray-400">{stageIcons[h.stage] || '🔗'} {formatStage(h.stage)}</p>)}</div></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
          <p className="text-sm text-blue-300"><strong>Tip:</strong> Gunakan /linktrack di Telegram untuk melihat detail link dan aksi cepat.</p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon, label, value, color = 'text-white' }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-4">
      <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">{icon}<span>{label}</span></div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
