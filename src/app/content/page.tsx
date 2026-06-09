'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { FileText, Star, Award, CheckCircle, XCircle, RefreshCw, Copy, Check, BarChart3, Video, Image as ImageIcon, Zap, Link as LinkIcon, AlertCircle } from 'lucide-react';

interface ContentData {
  id: string;
  productId: string;
  product?: { id: string; name: string; price: number; affiliatePlatform: string };
  contentType: string;
  platform: string;
  status: string;
  approvalStatus: string;
  hook?: string;
  caption?: string;
  cta?: string;
  script?: string;
  hashtags?: string;
  telegramText?: string;
  whatsappText?: string;
  videoPrompts?: VideoPrompt[];
  imagePrompts?: ImagePrompt[];
  qualityScores?: QualityScores;
  variants?: {
    hooks: { index: number; content: string }[];
    captions: { index: number; content: string }[];
    ctas: { index: number; content: string }[];
    scripts: { index: number; content: string }[];
  };
  // Link placement fields (from distribution)
  trackingLink?: string;
  linkPlacementType?: string;
  linkPlacementText?: string;
  bioLinkRequired?: boolean;
  manualActionRequired?: boolean;
  manualActionNote?: string;
  destinationUrl?: string;
  pinnedCommentText?: string;
  affiliateLink?: string;
}

interface VideoPrompt {
  id: string;
  tool: string;
  prompt: string;
  duration: number;
  format: string;
  hook: string;
  sceneBreakdown: string;
  voiceOver: string;
  onScreenText: string;
  suggestedMusic: string;
}

interface ImagePrompt {
  id: string;
  imageType: string;
  prompt: string;
  layout: string;
  productPlacement: string;
  background: string;
  textOverlay: string;
  visualMood: string;
}

interface QualityScores {
  hookScore: number;
  clarityScore: number;
  conversionScore: number;
  platformFitScore: number;
  overallScore: number;
  bestHook: string;
  bestCaption: string;
  bestCta: string;
  bestPlatform: string;
  shouldPost: boolean;
  recommendation: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  affiliatePlatform: string;
}

const API_BASE = 'http://localhost:3001';

export default function ContentPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [contents, setContents] = useState<ContentData[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'variants' | 'prompts' | 'quality'>('overview');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [variantData, setVariantData] = useState<any>(null);

  useEffect(() => {
    fetchProducts();
    fetchContents();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data.products);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchContents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/content?limit=50`);
      const data = await res.json();
      if (data.success) {
        setContents(data.data);
        if (data.data.length > 0 && !selectedContent) {
          loadContentDetail(data.data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching contents:', error);
    }
  };

  const loadContentDetail = async (contentId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/phase2/${contentId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedContent(data.data);
        setVariantData(data.data);
      }
    } catch (error) {
      console.error('Error fetching content detail:', error);
    }
  };

  const generatePhase2 = async (productId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/phase2/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchContents();
        await loadContentDetail(data.data.contentId);
      }
    } catch (error) {
      console.error('Error generating Phase 2:', error);
    }
    setLoading(false);
  };

  const handleApprove = async (contentId: string) => {
    try {
      await fetch(`${API_BASE}/api/phase2/${contentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: 'dashboard' }),
      });
      await fetchContents();
      await loadContentDetail(contentId);
    } catch (error) {
      console.error('Error approving:', error);
    }
  };

  const handleReject = async (contentId: string) => {
    try {
      await fetch(`${API_BASE}/api/phase2/${contentId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rejected from dashboard' }),
      });
      await fetchContents();
      await loadContentDetail(contentId);
    } catch (error) {
      console.error('Error rejecting:', error);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const getPlacementBadgeColor = (type?: string) => {
    switch (type) {
      case 'DIRECT':
        return 'bg-green-400/20 text-green-400';
      case 'BIO_LINK':
        return 'bg-blue-400/20 text-blue-400';
      case 'STORY_STICKER':
        return 'bg-purple-400/20 text-purple-400';
      case 'PINNED_COMMENT':
        return 'bg-orange-400/20 text-orange-400';
      case 'COMMENT':
        return 'bg-cyan-400/20 text-cyan-400';
      case 'BIO_PLUS_CTA':
        return 'bg-yellow-400/20 text-yellow-400';
      case 'NO_LINK':
        return 'bg-red-400/20 text-red-400';
      default:
        return 'bg-gray-400/20 text-gray-400';
    }
  };

  const getManualActionInstructions = (placementType?: string, platform?: string) => {
    switch (placementType) {
      case 'STORY_STICKER':
        return 'Zernio tidak mendukung story sticker. Tambahkan link sticker secara manual di Instagram Story.';
      case 'PINNED_COMMENT':
        return 'Tambahkan pinned comment dengan link di YouTube Studio setelah posting.';
      case 'BIO_LINK':
        return 'Pastikan link produk sudah ada di bio Instagram sebelum posting.';
      default:
        return 'Check platform requirements and add link manually if needed.';
    }
  };

  const getFinalCaptionPreview = (caption: string, placementType: string, cta: string, trackingUrl: string) => {
    let preview = caption || '';

    if (placementType === 'DIRECT') {
      preview += `\n\n🔗 ${trackingUrl}`;
    } else if (['BIO_LINK', 'BIO_PLUS_CTA', 'STORY_STICKER'].includes(placementType)) {
      if (cta) {
        preview += `\n\n${cta}`;
      }
    } else if (placementType === 'COMMENT') {
      if (trackingUrl) {
        preview += `\n\n🔗 ${trackingUrl}`;
      }
    }

    return preview;
  };

  const formatPrice = (price: number) => {
    return `Rp ${price.toLocaleString('id-ID')}`;
  };

  const pendingContents = contents.filter(c => c.approvalStatus === 'PENDING');
  const approvedContents = contents.filter(c => c.approvalStatus === 'APPROVED');
  const rejectedContents = contents.filter(c => c.approvalStatus === 'REJECTED');

  const qualityScores = variantData?.qualityScores;
  const videoPrompts = variantData?.videoPrompts || [];
  const imagePrompts = variantData?.imagePrompts || [];
  const variants = variantData?.variants || { hooks: [], captions: [], ctas: [], scripts: [] };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Content Hub Phase 2" description="AI Generated Content dengan Quality Scoring" />

      <div className="p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-400/10 rounded-lg">
                <FileText className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{contents.length}</p>
                <p className="text-sm text-gray-400">Total Content</p>
              </div>
            </div>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <RefreshCw className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{pendingContents.length}</p>
                <p className="text-sm text-gray-400">Pending</p>
              </div>
            </div>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-400/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{approvedContents.length}</p>
                <p className="text-sm text-gray-400">Approved</p>
              </div>
            </div>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-400/10 rounded-lg">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{rejectedContents.length}</p>
                <p className="text-sm text-gray-400">Rejected</p>
              </div>
            </div>
          </div>
        </div>

        {/* Product Selector & Generate */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-400 mb-2">Select Product</label>
              <select
                value=""
                onChange={(e) => generatePhase2(e.target.value)}
                className="w-full bg-[#1a2332] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Select product to generate Phase 2...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {formatPrice(p.price)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => fetchContents()}
                className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Approval Queue */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            Approval Queue ({contents.length})
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {contents.length === 0 ? (
              <p className="text-gray-400 py-4">No content yet. Select a product above to generate Phase 2 content.</p>
            ) : (
              contents.map((content) => {
                const isSelected = selectedContent?.id === content.id;
                const contentAny = content as any;
                const overallScore = contentAny.qualityScores?.overallScore || 0;

                return (
                  <div
                    key={content.id}
                    onClick={() => loadContentDetail(content.id)}
                    className={`bg-[#1a2332] rounded-lg p-3 cursor-pointer border transition-all ${
                      isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            content.approvalStatus === 'APPROVED' ? 'bg-green-400/20 text-green-400' :
                            content.approvalStatus === 'REJECTED' ? 'bg-red-400/20 text-red-400' :
                            'bg-yellow-400/20 text-yellow-400'
                          }`}>
                            {content.approvalStatus}
                          </span>
                          <span className="text-white font-medium text-sm">
                            {content.product?.name || contentAny.product?.name || 'Loading...'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Platform: {content.platform} | Type: {content.contentType}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-lg font-bold text-white">{overallScore}</p>
                          <p className="text-xs text-gray-500">/100</p>
                        </div>
                        {content.approvalStatus === 'PENDING' && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleApprove(content.id); }}
                              className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
                            >
                              ✓
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReject(content.id); }}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
                            >
                              ✗
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Content Tabs */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800">
            <div className="flex overflow-x-auto">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === 'overview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Best Content
              </button>
              <button
                onClick={() => setActiveTab('variants')}
                className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === 'variants' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                All Variants
              </button>
              <button
                onClick={() => setActiveTab('prompts')}
                className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === 'prompts' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Video & Image Prompts
              </button>
              <button
                onClick={() => setActiveTab('quality')}
                className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === 'quality' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Quality Analytics
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Overview / Best Content */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-400" />
                    Best Content (AI Selected)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Best Hook</p>
                      <p className="text-white">{qualityScores?.bestHook || selectedContent?.hook || 'No hook yet'}</p>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Best Caption</p>
                      <p className="text-white">{qualityScores?.bestCaption || selectedContent?.caption || 'No caption yet'}</p>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Best CTA</p>
                      <p className="text-white">{qualityScores?.bestCta || selectedContent?.cta || 'No CTA yet'}</p>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Best Platform</p>
                      <p className="text-white">{qualityScores?.bestPlatform || 'TBD'}</p>
                    </div>
                  </div>
                </div>

                {/* Messaging */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Messaging Templates</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-400">Telegram Message</p>
                        <button
                          onClick={() => copyToClipboard(selectedContent?.telegramText || '', 'telegram')}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {copiedItem === 'telegram' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-white text-sm whitespace-pre-wrap">{selectedContent?.telegramText || 'No content'}</p>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-400">WhatsApp Message</p>
                        <button
                          onClick={() => copyToClipboard(selectedContent?.whatsappText || '', 'whatsapp')}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          {copiedItem === 'whatsapp' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-white text-sm whitespace-pre-wrap">{selectedContent?.whatsappText || 'No content'}</p>
                    </div>
                  </div>
                </div>

                {/* Link Strategy Section */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <LinkIcon className="h-5 w-5 text-green-400" />
                    Link Strategy
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Platform</p>
                      <p className="text-white font-medium">
                        {selectedContent?.platform || 'Not distributed yet'}
                      </p>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Placement Type</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        getPlacementBadgeColor(selectedContent?.linkPlacementType)
                      }`}>
                        {selectedContent?.linkPlacementType || 'PENDING'}
                      </span>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Tracking URL</p>
                      {selectedContent?.trackingLink ? (
                        <div className="flex items-center gap-2">
                          <p className="text-white text-xs truncate flex-1">{selectedContent.trackingLink}</p>
                          <button
                            onClick={() => copyToClipboard(selectedContent?.trackingLink || '', 'tracking')}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            {copiedItem === 'tracking' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      ) : (
                        <p className="text-gray-500">No tracking URL</p>
                      )}
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Bio Link Required</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        selectedContent?.bioLinkRequired ? 'bg-yellow-400/20 text-yellow-400' : 'bg-gray-400/20 text-gray-400'
                      }`}>
                        {selectedContent?.bioLinkRequired ? 'Yes - Add to bio' : 'No'}
                      </span>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Manual Action</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        selectedContent?.manualActionRequired ? 'bg-orange-400/20 text-orange-400' : 'bg-gray-400/20 text-gray-400'
                      }`}>
                        {selectedContent?.manualActionRequired ? 'Required' : 'None'}
                      </span>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Affiliate Link</p>
                      {selectedContent?.affiliateLink ? (
                        <div className="flex items-center gap-2">
                          <p className="text-white text-xs truncate flex-1">{selectedContent.affiliateLink}</p>
                          <button
                            onClick={() => copyToClipboard(selectedContent?.affiliateLink || '', 'affiliate')}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            {copiedItem === 'affiliate' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      ) : (
                        <p className="text-gray-500">No affiliate link</p>
                      )}
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4 md:col-span-2">
                      <p className="text-sm text-gray-400 mb-2">CTA Text</p>
                      <p className="text-white">
                        {selectedContent?.linkPlacementText || 'Link ada di bio 🔗'}
                      </p>
                    </div>
                    <div className="bg-[#1a2332] rounded-lg p-4">
                      <p className="text-sm text-gray-400 mb-2">Final Destination</p>
                      {selectedContent?.destinationUrl ? (
                        <div className="flex items-center gap-2">
                          <p className="text-white text-xs truncate flex-1">{selectedContent.destinationUrl}</p>
                          <button
                            onClick={() => copyToClipboard(selectedContent?.destinationUrl || '', 'destination')}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            {copiedItem === 'destination' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      ) : (
                        <p className="text-gray-500">Not set</p>
                      )}
                    </div>
                  </div>

                  {/* Manual Action Warning */}
                  {selectedContent?.manualActionRequired && (
                    <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-4 mt-4">
                      <p className="text-sm text-yellow-400 mb-2 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Manual Action Required
                      </p>
                      <p className="text-white text-sm">
                        {selectedContent?.manualActionNote || 'Check platform requirements'}
                      </p>
                      <div className="mt-2 p-2 bg-[#0f172a] rounded">
                        <p className="text-xs text-gray-400">Action Note:</p>
                        <p className="text-sm text-white">
                          {getManualActionInstructions(selectedContent?.linkPlacementType, selectedContent?.platform)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Pinned Comment Preview */}
                  {selectedContent?.pinnedCommentText && (
                    <div className="bg-purple-400/10 border border-purple-400/30 rounded-lg p-4 mt-4">
                      <p className="text-sm text-purple-400 mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Pinned Comment Text
                      </p>
                      <p className="text-white text-sm whitespace-pre-wrap">{selectedContent.pinnedCommentText}</p>
                      <button
                        onClick={() => copyToClipboard(selectedContent?.pinnedCommentText || '', 'pinned')}
                        className="mt-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium"
                      >
                        Copy Pinned Comment
                      </button>
                    </div>
                  )}

                  {/* Final Caption Preview */}
                  <div className="bg-blue-400/10 border border-blue-400/30 rounded-lg p-4 mt-4">
                    <p className="text-sm text-blue-400 mb-2 flex items-center gap-2">
                      Final Caption Preview
                    </p>
                    <p className="text-white text-sm whitespace-pre-wrap">
                      {getFinalCaptionPreview(
                        selectedContent?.caption || '',
                        selectedContent?.linkPlacementType || 'BIO_LINK',
                        selectedContent?.linkPlacementText || 'Link ada di bio 🔗',
                        selectedContent?.trackingLink || selectedContent?.affiliateLink || ''
                      )}
                    </p>
                    <button
                      onClick={() => copyToClipboard(
                        getFinalCaptionPreview(
                          selectedContent?.caption || '',
                          selectedContent?.linkPlacementType || 'BIO_LINK',
                          selectedContent?.linkPlacementText || 'Link ada di bio 🔗',
                          selectedContent?.trackingLink || selectedContent?.affiliateLink || ''
                        ),
                        'final-caption'
                      )}
                      className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium"
                    >
                      Copy Final Caption
                    </button>
                  </div>
                </div>

                {/* Hashtags */}
                <div className="bg-[#1a2332] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-400">Hashtags</p>
                    <button
                      onClick={() => copyToClipboard(selectedContent?.hashtags || '', 'hashtags')}
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Copy className="h-4 w-4" />
                      Copy All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedContent?.hashtags?.split(',').map((tag, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-400/10 text-blue-400 rounded text-sm">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Variants */}
            {activeTab === 'variants' && (
              <div className="space-y-6">
                {/* Hooks */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Hooks ({variants.hooks?.length || 0})</h3>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {variants.hooks?.length > 0 ? variants.hooks.map((h: any) => (
                      <div key={h.index} className="bg-[#1a2332] rounded-lg p-3 flex items-start gap-3">
                        <span className="px-2 py-1 bg-orange-400/20 text-orange-400 rounded text-xs font-medium min-w-[2rem] text-center">
                          {h.index}
                        </span>
                        <p className="text-white flex-1">{h.content}</p>
                        <button
                          onClick={() => copyToClipboard(h.content, `hook-${h.index}`)}
                          className="text-gray-400 hover:text-white"
                        >
                          {copiedItem === `hook-${h.index}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    )) : (
                      <p className="text-gray-400">No hooks generated yet</p>
                    )}
                  </div>
                </div>

                {/* Captions */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Captions ({variants.captions?.length || 0})</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {variants.captions?.length > 0 ? variants.captions.map((c: any) => (
                      <div key={c.index} className="bg-[#1a2332] rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          <span className="px-2 py-1 bg-purple-400/20 text-purple-400 rounded text-xs font-medium min-w-[2rem] text-center">
                            {c.index}
                          </span>
                          <p className="text-white flex-1">{c.content}</p>
                          <button
                            onClick={() => copyToClipboard(c.content, `caption-${c.index}`)}
                            className="text-gray-400 hover:text-white"
                          >
                            {copiedItem === `caption-${c.index}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    )) : (
                      <p className="text-gray-400">No captions generated yet</p>
                    )}
                  </div>
                </div>

                {/* CTAs */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">CTAs ({variants.ctas?.length || 0})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {variants.ctas?.length > 0 ? variants.ctas.map((c: any) => (
                      <div key={c.index} className="bg-[#1a2332] rounded-lg p-3 flex items-center gap-3">
                        <span className="px-2 py-1 bg-green-400/20 text-green-400 rounded text-xs font-medium min-w-[2rem] text-center">
                          {c.index}
                        </span>
                        <p className="text-white flex-1">{c.content}</p>
                      </div>
                    )) : (
                      <p className="text-gray-400">No CTAs generated yet</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Video & Image Prompts */}
            {activeTab === 'prompts' && (
              <div className="space-y-6">
                {/* Video Prompts */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Video className="h-5 w-5 text-blue-400" />
                    Video AI Prompts ({videoPrompts.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {videoPrompts.length > 0 ? videoPrompts.map((vp: VideoPrompt) => (
                      <div key={vp.id} className="bg-[#1a2332] rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="px-3 py-1 bg-blue-400/20 text-blue-400 rounded-lg text-sm font-medium">
                            {vp.tool}
                          </span>
                          <span className="text-sm text-gray-400">{vp.duration}s | {vp.format}</span>
                        </div>
                        <p className="text-sm text-gray-300 mb-3">{vp.prompt}</p>
                        <div className="space-y-2 pt-3 border-t border-gray-700">
                          <div>
                            <p className="text-xs text-gray-500">Hook</p>
                            <p className="text-sm text-white">{vp.hook}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Voice Over</p>
                            <p className="text-sm text-white">{vp.voiceOver}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">On Screen Text</p>
                            <p className="text-sm text-white">{vp.onScreenText}</p>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="text-gray-400">No video prompts generated yet</p>
                    )}
                  </div>
                </div>

                {/* Image Prompts */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-purple-400" />
                    Image AI Prompts ({imagePrompts.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {imagePrompts.length > 0 ? imagePrompts.map((ip: ImagePrompt) => (
                      <div key={ip.id} className="bg-[#1a2332] rounded-lg p-4">
                        <span className="px-3 py-1 bg-purple-400/20 text-purple-400 rounded text-xs font-medium">
                          {ip.imageType}
                        </span>
                        <p className="text-sm text-gray-300 mt-3">{ip.prompt}</p>
                        <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
                          <p className="text-xs text-gray-500">Layout: <span className="text-gray-300">{ip.layout}</span></p>
                          <p className="text-xs text-gray-500">Mood: <span className="text-gray-300">{ip.visualMood}</span></p>
                        </div>
                      </div>
                    )) : (
                      <p className="text-gray-400">No image prompts generated yet</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quality Analytics */}
            {activeTab === 'quality' && (
              <div className="space-y-6">
                {/* Score Overview */}
                <div className="bg-[#1a2332] rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-white">Quality Score Overview</h3>
                    <div className="text-right">
                      <p className="text-4xl font-bold text-blue-400">{qualityScores?.overallScore || 0}</p>
                      <p className="text-sm text-gray-400">Overall Score</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#0f172a] rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-400">{qualityScores?.hookScore || 0}</p>
                      <p className="text-sm text-gray-400 mt-1">Hook Score</p>
                    </div>
                    <div className="bg-[#0f172a] rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-blue-400">{qualityScores?.clarityScore || 0}</p>
                      <p className="text-sm text-gray-400 mt-1">Clarity Score</p>
                    </div>
                    <div className="bg-[#0f172a] rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-yellow-400">{qualityScores?.conversionScore || 0}</p>
                      <p className="text-sm text-gray-400 mt-1">Conversion Score</p>
                    </div>
                    <div className="bg-[#0f172a] rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-purple-400">{qualityScores?.platformFitScore || 0}</p>
                      <p className="text-sm text-gray-400 mt-1">Platform Fit</p>
                    </div>
                  </div>
                </div>

                {/* Score Bars */}
                <div className="bg-[#1a2332] rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Score Breakdown</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Hook Score', value: qualityScores?.hookScore || 0, color: 'bg-green-400' },
                      { label: 'Clarity Score', value: qualityScores?.clarityScore || 0, color: 'bg-blue-400' },
                      { label: 'Conversion Score', value: qualityScores?.conversionScore || 0, color: 'bg-yellow-400' },
                      { label: 'Platform Fit Score', value: qualityScores?.platformFitScore || 0, color: 'bg-purple-400' },
                      { label: 'Overall Score', value: qualityScores?.overallScore || 0, color: 'bg-blue-500' },
                    ].map((score) => (
                      <div key={score.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">{score.label}</span>
                          <span className="text-white font-medium">{score.value}/100</span>
                        </div>
                        <div className="h-3 bg-[#0f172a] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${score.color} transition-all duration-500`}
                            style={{ width: `${score.value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommendation */}
                <div className="bg-[#1a2332] rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-400" />
                    AI Recommendation
                  </h3>
                  <div className="flex items-center gap-4 mb-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      qualityScores?.shouldPost ? 'bg-green-400/20 text-green-400' : 'bg-yellow-400/20 text-yellow-400'
                    }`}>
                      {qualityScores?.shouldPost ? '✅ Ready to Post' : '⚠️ Needs Review'}
                    </span>
                    <span className="text-sm text-gray-400">
                      Best Platform: <span className="text-white">{qualityScores?.bestPlatform || 'TBD'}</span>
                    </span>
                  </div>
                  <p className="text-gray-300">{qualityScores?.recommendation || 'No recommendation yet'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}