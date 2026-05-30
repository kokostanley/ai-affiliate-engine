'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Package, Play, RefreshCw, Download, Check, X, Clock, Zap, Video, Image as ImageIcon, FileText, Copy, CheckCircle } from 'lucide-react';

const API_BASE = 'http://localhost:3001';

interface ProductionStats {
  total: number;
  draft: number;
  production_ready: number;
  rendering: number;
  rendered: number;
  failed: number;
}

interface ProductionPackage {
  id: string;
  contentId: string;
  productId: string;
  status: string;
  bestPlatform: string | null;
  overallScore: number;
  videoPromptPippit: string | null;
  videoPromptVeo: string | null;
  videoPromptSeedance: string | null;
  videoPromptSora: string | null;
  imagePromptThumbnail: string | null;
  imagePromptSocial: string | null;
  imagePromptCarousel: string | null;
  imagePromptAd: string | null;
  voiceoverScript: string | null;
  subtitleScript: string | null;
  exportedAt: string | null;
  createdAt: string;
  content?: {
    hook: string;
    caption: string;
    cta: string;
    hashtags: string;
    telegramText: string;
    product?: {
      name: string;
      price: number;
    };
  };
  product?: {
    name: string;
    price: number;
  };
}

interface ApprovedContent {
  id: string;
  product: {
    id: string;
    name: string;
    price: number;
  };
  contentType: string;
  hook: string;
}

export default function ProductionPage() {
  const [packages, setPackages] = useState<ProductionPackage[]>([]);
  const [approvedContent, setApprovedContent] = useState<ApprovedContent[]>([]);
  const [stats, setStats] = useState<ProductionStats>({ total: 0, draft: 0, production_ready: 0, rendering: 0, rendered: 0, failed: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<ProductionPackage | null>(null);
  const [activeTab, setActiveTab] = useState<'packages' | 'generate' | 'export'>('packages');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  useEffect(() => {
    fetchPackages();
    fetchApprovedContent();
  }, []);

  const fetchPackages = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/production`);
      const data = await res.json();
      if (data.success) {
        setPackages(data.data.packages);
        setStats(data.data.stats);
      }
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const fetchApprovedContent = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/content?approvalStatus=APPROVED&limit=50`);
      const data = await res.json();
      if (data.success) {
        setApprovedContent(data.data);
      }
    } catch (error) {
      console.error('Error fetching approved content:', error);
    }
  };

  const generatePackage = async (contentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/production/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPackages();
        setSelectedPackage(data.data);
        setActiveTab('packages');
      }
    } catch (error) {
      console.error('Error generating package:', error);
    }
    setLoading(false);
  };

  const updateStatus = async (packageId: string, status: string) => {
    try {
      await fetch(`${API_BASE}/api/production/${packageId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await fetchPackages();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-400/20 text-gray-400',
    approved: 'bg-blue-400/20 text-blue-400',
    production_ready: 'bg-green-400/20 text-green-400',
    rendering: 'bg-yellow-400/20 text-yellow-400',
    rendered: 'bg-purple-400/20 text-purple-400',
    failed: 'bg-red-400/20 text-red-400',
  };

  const statusLabels: Record<string, string> = {
    draft: 'Draft',
    approved: 'Approved',
    production_ready: 'Ready',
    rendering: 'Rendering',
    rendered: 'Rendered',
    failed: 'Failed',
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Production Hub" description="Content Production & Export" />

      <div className="p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-sm text-gray-400">Total</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-400">{stats.draft}</p>
            <p className="text-sm text-gray-400">Draft</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-green-400">{stats.production_ready}</p>
            <p className="text-sm text-gray-400">Ready</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-yellow-400">{stats.rendering}</p>
            <p className="text-sm text-gray-400">Rendering</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-purple-400">{stats.rendered}</p>
            <p className="text-sm text-gray-400">Rendered</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
            <p className="text-sm text-gray-400">Failed</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800">
            <div className="flex">
              <button
                onClick={() => setActiveTab('packages')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'packages' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Production Packages ({packages.length})
              </button>
              <button
                onClick={() => setActiveTab('generate')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'generate' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Generate New
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Packages List */}
            {activeTab === 'packages' && (
              <div className="space-y-4">
                {packages.length === 0 ? (
                  <p className="text-gray-400 py-8 text-center">No production packages yet. Generate from approved content.</p>
                ) : (
                  packages.map((pkg) => {
                    const isSelected = selectedPackage?.id === pkg.id;
                    const productName = pkg.product?.name || pkg.content?.product?.name || 'Unknown';

                    return (
                      <div
                        key={pkg.id}
                        onClick={() => setSelectedPackage(pkg)}
                        className={`bg-[#1a2332] rounded-lg p-4 cursor-pointer border transition-all ${
                          isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-700 hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[pkg.status]}`}>
                                {statusLabels[pkg.status]}
                              </span>
                              <span className="text-white font-medium">{productName}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                              <span>Platform: {pkg.bestPlatform || 'TBD'}</span>
                              <span>Score: {pkg.overallScore}/100</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedPackage(pkg); }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Generate New */}
            {activeTab === 'generate' && (
              <div className="space-y-4">
                <p className="text-gray-400">Select approved content to generate production package:</p>
                {approvedContent.length === 0 ? (
                  <p className="text-gray-500 py-4">No approved content yet. Approve content in Content Hub first.</p>
                ) : (
                  approvedContent.map((content) => {
                    const hasPackage = packages.some(p => p.contentId === content.id);
                    return (
                      <div key={content.id} className="bg-[#1a2332] rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{content.product.name}</p>
                          <p className="text-sm text-gray-400">{content.contentType}</p>
                        </div>
                        <button
                          onClick={() => generatePackage(content.id)}
                          disabled={loading || hasPackage}
                          className={`px-4 py-2 rounded font-medium flex items-center gap-2 ${
                            hasPackage
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                          }`}
                        >
                          {hasPackage ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Has Package
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4" />
                              Generate
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Package Detail */}
        {selectedPackage && (
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl overflow-hidden">
            <div className="border-b border-gray-800 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {selectedPackage.product?.name || 'Production Package'}
                </h3>
                <p className="text-sm text-gray-400">
                  {selectedPackage.bestPlatform} | Score: {selectedPackage.overallScore}/100
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedPackage.status}
                  onChange={(e) => updateStatus(selectedPackage.id, e.target.value)}
                  className="bg-[#1a2332] border border-gray-700 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                  <option value="production_ready">Ready</option>
                  <option value="rendering">Rendering</option>
                  <option value="rendered">Rendered</option>
                  <option value="failed">Failed</option>
                </select>
                <button
                  onClick={() => {
                    copyToClipboard(JSON.stringify(selectedPackage, null, 2), 'full-package');
                  }}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium flex items-center gap-1"
                >
                  <Download className="h-4 w-4" />
                  Export JSON
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Video Prompts */}
              <div className="bg-[#1a2332] rounded-lg p-4">
                <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Video className="h-5 w-5 text-blue-400" />
                  Video Prompts
                </h4>
                <div className="space-y-3">
                  {[
                    { key: 'videoPromptPippit', label: 'PIPPIT', value: selectedPackage.videoPromptPippit },
                    { key: 'videoPromptVeo', label: 'VEO', value: selectedPackage.videoPromptVeo },
                    { key: 'videoPromptSeedance', label: 'SEEDANCE', value: selectedPackage.videoPromptSeedance },
                    { key: 'videoPromptSora', label: 'SORA', value: selectedPackage.videoPromptSora },
                  ].map((item) => (
                    <div key={item.key} className="bg-[#0f172a] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-blue-400">{item.label}</span>
                        {item.value && (
                          <button
                            onClick={() => copyToClipboard(item.value!, item.key)}
                            className="text-gray-400 hover:text-white"
                          >
                            {copiedItem === item.key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-300">{item.value || 'Not generated'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Image Prompts */}
              <div className="bg-[#1a2332] rounded-lg p-4">
                <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-purple-400" />
                  Image Prompts
                </h4>
                <div className="space-y-3">
                  {[
                    { key: 'imagePromptThumbnail', label: 'Thumbnail', value: selectedPackage.imagePromptThumbnail },
                    { key: 'imagePromptSocial', label: 'Social Post', value: selectedPackage.imagePromptSocial },
                    { key: 'imagePromptCarousel', label: 'Carousel', value: selectedPackage.imagePromptCarousel },
                    { key: 'imagePromptAd', label: 'Ad Creative', value: selectedPackage.imagePromptAd },
                  ].map((item) => (
                    <div key={item.key} className="bg-[#0f172a] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-purple-400">{item.label}</span>
                        {item.value && (
                          <button
                            onClick={() => copyToClipboard(item.value!, item.key)}
                            className="text-gray-400 hover:text-white"
                          >
                            {copiedItem === item.key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-300">{item.value || 'Not generated'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scripts */}
              <div className="bg-[#1a2332] rounded-lg p-4">
                <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-400" />
                  Scripts
                </h4>
                <div className="space-y-3">
                  <div className="bg-[#0f172a] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-400">Voiceover</span>
                      {selectedPackage.voiceoverScript && (
                        <button
                          onClick={() => copyToClipboard(selectedPackage.voiceoverScript!, 'voiceover')}
                          className="text-gray-400 hover:text-white"
                        >
                          {copiedItem === 'voiceover' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">
                      {selectedPackage.voiceoverScript || 'Not generated'}
                    </p>
                  </div>
                  <div className="bg-[#0f172a] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-400">Subtitle/Text Overlay</span>
                      {selectedPackage.subtitleScript && (
                        <button
                          onClick={() => copyToClipboard(selectedPackage.subtitleScript!, 'subtitle')}
                          className="text-gray-400 hover:text-white"
                        >
                          {copiedItem === 'subtitle' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">
                      {selectedPackage.subtitleScript || 'Not generated'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Base Content */}
              <div className="bg-[#1a2332] rounded-lg p-4">
                <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Package className="h-5 w-5 text-yellow-400" />
                  Base Content
                </h4>
                <div className="space-y-3">
                  <div className="bg-[#0f172a] rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Hook</p>
                    <p className="text-sm text-white">{selectedPackage.content?.hook || '-'}</p>
                  </div>
                  <div className="bg-[#0f172a] rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Caption</p>
                    <p className="text-sm text-white">{selectedPackage.content?.caption || '-'}</p>
                  </div>
                  <div className="bg-[#0f172a] rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">CTA</p>
                    <p className="text-sm text-white">{selectedPackage.content?.cta || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}