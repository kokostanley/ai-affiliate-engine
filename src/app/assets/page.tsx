'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Cloud, HardDrive, Trash2, ExternalLink, Folder, Search, Filter, RefreshCw, FileVideo, FileImage, File } from 'lucide-react';

interface Asset {
  id: string;
  fileName: string;
  fileType: string;
  mimeType?: string;
  cloudProvider?: string;
  cloudUrl?: string;
  cloudFileId?: string;
  localPath?: string;
  fileSize?: string;
  uploadStatus: string;
  product?: { id: string; name: string; slug: string };
  createdAt: string;
  uploadedAt?: string;
}

interface StorageStats {
  local: { count: number; size: number };
  googleDrive: { count: number; size: number };
  dropbox: { count: number; size: number };
  summary: { totalFiles: number; totalSize: number; byProvider: Record<string, number> };
}

const FILE_TYPES = ['VIDEO', 'IMAGE', 'AUDIO', 'DOCUMENT'];
const PROVIDERS = ['GOOGLE_DRIVE', 'DROPBOX', 'LOCAL'];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AssetLibraryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [filters, setFilters] = useState({
    fileType: '',
    cloudProvider: '',
    search: '',
  });
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    fetchAssets();
    fetchStats();
  }, [filters, pagination.offset]);

  async function fetchAssets() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      });
      if (filters.fileType) params.append('fileType', filters.fileType);
      if (filters.cloudProvider) params.append('cloudProvider', filters.cloudProvider);
      if (filters.search) params.append('search', filters.search);

      const res = await fetch(`/api/assets?${params}`);
      const data = await res.json();

      if (data.success) {
        setAssets(data.data.assets);
        setPagination(prev => ({ ...prev, total: data.data.pagination.total }));
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    }
    setLoading(false);
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/assets/stats/usage');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  async function handleDelete(assetId: string) {
    if (!confirm('Delete this asset? Cloud file will be permanently deleted.')) return;

    try {
      const res = await fetch(`/api/assets/${assetId}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        setAssets(prev => prev.filter(a => a.id !== assetId));
        fetchStats();
      } else {
        alert(data.error?.message || 'Failed to delete asset');
      }
    } catch {
      alert('Failed to delete asset');
    }
  }

  async function handleCleanup() {
    if (!confirm('Clean up all local cache files? Cloud files will not be affected.')) return;

    setCleaning(true);
    try {
      const res = await fetch('/api/assets/cleanup', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        alert(`Cleaned up ${data.data.deleted} file(s)`);
        fetchAssets();
        fetchStats();
      }
    } catch {
      alert('Failed to cleanup');
    }
    setCleaning(false);
  }

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'VIDEO': return <FileVideo className="h-4 w-4 text-purple-400" />;
      case 'IMAGE': return <FileImage className="h-4 w-4 text-green-400" />;
      default: return <File className="h-4 w-4 text-gray-400" />;
    }
  };

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case 'GOOGLE_DRIVE':
        return <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">Google Drive</span>;
      case 'DROPBOX':
        return <span className="px-2 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-400">Dropbox</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">Local</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Asset Library" description="Browse and manage all cloud-stored assets" />

      <div className="p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Asset Library</h1>
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {cleaning ? 'Cleaning...' : '🧹 Clean Local Cache'}
          </button>
        </div>

        {/* Storage Summary Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Folder className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.summary.totalFiles}</p>
                  <p className="text-sm text-gray-400">Total Assets</p>
                  <p className="text-xs text-gray-500">{formatBytes(stats.summary.totalSize)}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-500/10 rounded-lg">
                  <HardDrive className="h-6 w-6 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-400">{stats.local.count}</p>
                  <p className="text-sm text-gray-400">Local Cache</p>
                  <p className="text-xs text-gray-500">{formatBytes(stats.local.size)}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <Cloud className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-400">{stats.googleDrive.count}</p>
                  <p className="text-sm text-gray-400">Google Drive</p>
                  <p className="text-xs text-gray-500">{formatBytes(stats.googleDrive.size)}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <Cloud className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-400">{stats.dropbox.count}</p>
                  <p className="text-sm text-gray-400">Dropbox</p>
                  <p className="text-xs text-gray-500">{formatBytes(stats.dropbox.size)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-300">Filters</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="Search by filename..."
                  className="w-full pl-10 pr-3 py-2 bg-[#1a2332] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">File Type</label>
              <select
                value={filters.fileType}
                onChange={(e) => setFilters(prev => ({ ...prev, fileType: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a2332] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">All Types</option>
                {FILE_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cloud Provider</label>
              <select
                value={filters.cloudProvider}
                onChange={(e) => setFilters(prev => ({ ...prev, cloudProvider: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a2332] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">All Providers</option>
                {PROVIDERS.map(provider => (
                  <option key={provider} value={provider}>{provider.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Asset Table */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl overflow-hidden">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-[#0d1321]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">File</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Provider</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading assets...
                  </td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No assets found
                  </td>
                </tr>
              ) : (
                assets.map(asset => (
                  <tr key={asset.id} className="hover:bg-[#0d1321]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {getFileIcon(asset.fileType)}
                        <div>
                          <p className="text-sm font-medium text-white">{asset.fileName}</p>
                          {asset.cloudUrl && (
                            <a
                              href={asset.cloudUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open Link
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-400">
                        {asset.fileType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {asset.cloudProvider ? getProviderBadge(asset.cloudProvider) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {asset.product?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {formatDate(asset.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDelete(asset.id)}
                        className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="px-6 py-4 flex justify-between items-center border-t border-gray-800">
            <div className="text-sm text-gray-400">
              Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={pagination.offset === 0}
                className="px-3 py-1 border border-gray-700 rounded text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={pagination.offset + pagination.limit >= pagination.total}
                className="px-3 py-1 border border-gray-700 rounded text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}