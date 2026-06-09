'use client';

import { useState, useEffect } from 'react';
import { Plus, Copy, ExternalLink, Edit2, Trash2, MousePointerClick } from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/Modal';

interface Link {
  id: string;
  slug: string;
  productId: string;
  originalLink: string;
  clicks: number;
  uniqueClicks: number;
  status: string;
  createdAt: string;
  product?: {
    name: string;
    slug: string;
  };
}

export default function LinksPage() {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const res = await fetch('/api/links');
      const data = await res.json();
      if (data.success) {
        setLinks(data.data);
      }
    } catch (error) {
      console.error('Error fetching links:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (slug: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const link = `${baseUrl}/go/${slug}`;
    await navigator.clipboard.writeText(link);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleCopyAffiliateLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-400/10 text-green-400',
    PAUSED: 'bg-yellow-400/10 text-yellow-400',
    EXPIRED: 'bg-gray-400/10 text-gray-400',
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Tracking Links" description="Kelola short link affiliate Anda" />

      <div className="p-6 space-y-6">
        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-400">
            {links.length} tracking links
          </div>
          <Button onClick={() => setShowCreateModal(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Link
          </Button>
        </div>

        {/* Links Table */}
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
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Short Link</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Clicks</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-gray-800 px-2 py-1 text-sm text-blue-400">
                          /go/{link.slug}
                        </code>
                        <button
                          onClick={() => handleCopyLink(link.slug)}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-white">{link.product?.name || 'Unknown'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 text-white">
                        <MousePointerClick className="h-4 w-4 text-gray-400" />
                        <span>{link.clicks || 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusColors[link.status]}`}>
                        {link.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      {new Date(link.createdAt).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCopyAffiliateLink(link.originalLink)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                          title="Copy Affiliate Link"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Info Box */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
          <p className="text-sm text-blue-300">
            <strong>Tip:</strong> Short links format: <code className="bg-blue-500/20 px-1 rounded">/go/product-slug</code>
            Klik tracking akan otomatis tercatat saat link diklik.
          </p>
        </div>
      </div>
    </div>
  );
}