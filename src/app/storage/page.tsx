'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Cloud, HardDrive, Trash2, RefreshCw, ExternalLink, Check, X, Folder, CheckCircle, AlertCircle } from 'lucide-react';

interface StorageStats {
  local: { count: number; size: number; files: { id: string; fileName: string; localPath: string; localSize: number }[] };
  googleDrive: { count: number; size: number };
  dropbox: { count: number; size: number };
  summary: { totalFiles: number; totalSize: number; byProvider: Record<string, number> };
}

interface ProviderConfig {
  provider: string;
  configured: boolean;
  message: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function StoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [statsRes, providersRes] = await Promise.all([
        fetch('/api/assets/stats/usage'),
        fetch('/api/assets/providers'),
      ]);

      const statsData = await statsRes.json();
      const providersData = await providersRes.json();

      if (statsData.success) setStats(statsData.data);
      if (providersData.success) setProviders(providersData.data);
    } catch (error) {
      console.error('Failed to fetch storage data:', error);
    }
    setLoading(false);
  }

  const handleCleanup = async () => {
    if (!confirm('Clean up all local cache files? Cloud files will not be affected.')) return;

    setCleaning(true);
    try {
      const res = await fetch('/api/assets/cleanup', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        alert(`Cleaned up ${data.data.deleted} file(s)`);
        fetchData();
      }
    } catch {
      alert('Failed to cleanup');
    }
    setCleaning(false);
  };

  const getProviderStatus = (provider: string) => {
    const config = providers.find(p => p.provider === provider);
    if (!config) return { icon: AlertCircle, color: 'text-gray-400', bg: 'bg-gray-500/10' };

    if (config.configured) {
      return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' };
    }
    return { icon: AlertCircle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
  };

  const maxSize = stats
    ? Math.max(
        stats.local.size || 1,
        stats.googleDrive.size || 1,
        stats.dropbox.size || 1
      )
    : 1;

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Storage" description="Cloud Storage Configuration & Usage" />

      <div className="p-6 space-y-6">
        {/* Storage Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Folder className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Total Assets</p>
                <p className="text-2xl font-bold text-white">{stats?.summary.totalFiles || 0}</p>
                <p className="text-xs text-gray-500">{formatBytes(stats?.summary.totalSize || 0)} total</p>
              </div>
            </div>
          </div>

          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Cloud className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Cloud Storage</p>
                <p className="text-2xl font-bold text-green-400">
                  {(stats?.googleDrive.count || 0) + (stats?.dropbox.count || 0)}
                </p>
                <p className="text-xs text-gray-500">
                  {formatBytes((stats?.googleDrive.size || 0) + (stats?.dropbox.size || 0))}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-500/10 rounded-lg">
                  <HardDrive className="h-6 w-6 text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Local Cache</p>
                  <p className="text-2xl font-bold text-yellow-400">{stats?.local.count || 0}</p>
                  <p className="text-xs text-gray-500">{formatBytes(stats?.local.size || 0)}</p>
                </div>
              </div>
              <button
                onClick={handleCleanup}
                disabled={cleaning || (stats?.local.count || 0) === 0}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {cleaning ? 'Cleaning...' : 'Clean'}
              </button>
            </div>
          </div>
        </div>

        {/* Storage Distribution */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Storage Distribution</h2>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Google Drive Bar */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="flex items-center gap-2 text-gray-300">
                    <span className="w-3 h-3 bg-green-500 rounded"></span>
                    Google Drive
                  </span>
                  <span className="text-gray-400">
                    {stats?.googleDrive.count || 0} files · {formatBytes(stats?.googleDrive.size || 0)}
                  </span>
                </div>
                <div className="h-6 bg-[#1a2332] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${((stats?.googleDrive.size || 0) / maxSize) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Dropbox Bar */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="flex items-center gap-2 text-gray-300">
                    <span className="w-3 h-3 bg-purple-500 rounded"></span>
                    Dropbox
                  </span>
                  <span className="text-gray-400">
                    {stats?.dropbox.count || 0} files · {formatBytes(stats?.dropbox.size || 0)}
                  </span>
                </div>
                <div className="h-6 bg-[#1a2332] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${((stats?.dropbox.size || 0) / maxSize) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Local Cache Bar */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="flex items-center gap-2 text-gray-300">
                    <span className="w-3 h-3 bg-yellow-500 rounded"></span>
                    Local Cache
                  </span>
                  <span className="text-gray-400">
                    {stats?.local.count || 0} files · {formatBytes(stats?.local.size || 0)}
                  </span>
                </div>
                <div className="h-6 bg-[#1a2332] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                    style={{ width: `${((stats?.local.size || 0) / maxSize) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cloud Storage Providers */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Cloud Storage Providers</h2>

          <div className="space-y-4">
            {/* Google Drive */}
            {(() => {
              const status = getProviderStatus('GOOGLE_DRIVE');
              const Icon = status.icon;
              const provider = providers.find(p => p.provider === 'GOOGLE_DRIVE');

              return (
                <div className="flex items-center gap-4 p-4 bg-[#1a2332] rounded-lg">
                  <div className={`p-3 ${status.bg} rounded-lg`}>
                    <Cloud className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">Google Drive</p>
                    <p className="text-sm text-gray-400">
                      {provider?.message || 'Add GOOGLE_ACCESS_TOKEN or GOOGLE_REFRESH_TOKEN to .env'}
                    </p>
                  </div>
                  {provider?.configured ? (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-400 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      Not Configured
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Dropbox */}
            {(() => {
              const provider = providers.find(p => p.provider === 'DROPBOX');

              return (
                <div className="flex items-center gap-4 p-4 bg-[#1a2332] rounded-lg">
                  <div className={`p-3 ${provider?.configured ? 'bg-green-500/10' : 'bg-yellow-500/10'} rounded-lg`}>
                    <Cloud className="h-5 w-5 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">Dropbox</p>
                    <p className="text-sm text-gray-400">
                      {provider?.message || 'Add DROPBOX_ACCESS_TOKEN to .env'}
                    </p>
                  </div>
                  {provider?.configured ? (
                    <span className="flex items-center gap-1 text-green-400 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-400 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      Not Configured
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Local */}
            <div className="flex items-center gap-4 p-4 bg-[#1a2332] rounded-lg">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <HardDrive className="h-5 w-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">Local Temp</p>
                <p className="text-sm text-gray-400">Store files temporarily on local disk (./tmp)</p>
              </div>
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <CheckCircle className="h-4 w-4" />
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Local Cache Files */}
        {stats && stats.local.files.length > 0 && (
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Local Cache Files (Will be cleaned)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-800">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Filename</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Size</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Path</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {stats.local.files.map((file) => (
                    <tr key={file.id}>
                      <td className="px-4 py-2 text-sm text-white">{file.fileName}</td>
                      <td className="px-4 py-2 text-sm text-gray-400">{formatBytes(file.localSize)}</td>
                      <td className="px-4 py-2 text-sm text-gray-500 font-mono truncate max-w-xs">{file.localPath}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}