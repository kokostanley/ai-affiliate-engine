'use client';

import { useState, useEffect } from 'react';
import { Wand2, Send, CheckCircle, FileText, Hash, MessageSquare } from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';

interface Product {
  id: string;
  name: string;
}

interface GeneratedContent {
  hook?: string;
  script?: string;
  caption?: string;
  hashtags?: string[];
  cta?: string;
  telegramText?: string;
}

export default function ContentPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [platform, setPlatform] = useState('TIKTOK');
  const [contentType, setContentType] = useState('TIKTOK_SCRIPT');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const platforms = [
    { value: 'TIKTOK', label: 'TikTok' },
    { value: 'INSTAGRAM', label: 'Instagram' },
    { value: 'YOUTUBE', label: 'YouTube' },
    { value: 'FACEBOOK', label: 'Facebook' },
    { value: 'TELEGRAM', label: 'Telegram' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
  ];

  const contentTypes = [
    { value: 'TIKTOK_HOOK', label: 'Hook Video' },
    { value: 'TIKTOK_SCRIPT', label: 'Script Lengkap' },
    { value: 'REELS_SCRIPT', label: 'Reels Script' },
    { value: 'SHORTS_SCRIPT', label: 'Shorts Script' },
    { value: 'CAPTION', label: 'Caption' },
    { value: 'TELEGRAM_PROMO', label: 'Telegram Promo' },
    { value: 'WHATSAPP_PROMO', label: 'WhatsApp Promo' },
    { value: 'MIXED_CONTENT', label: 'All Content' },
  ];

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.data.products || []);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const handleGenerate = async () => {
    if (!selectedProduct) return;

    setGenerating(true);
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct,
          platform,
          contentType,
          tone: 'casual',
          language: 'id',
        }),
      });

      if (res.status === 501) {
        // AI not available, use placeholder
        setGeneratedContent({
          hook: 'Check out this amazing product! 🎉',
          script: 'DAFTAR SEQUENCE:\n\n0-3s: HOOK - "Tahukah kamu..."\n3-15s: PROBLEM - "Setiap hari kita..."\n15-40s: SOLUTION - "Nah ini dia..."\n40-60s: CTA - "Link ada di bio!"',
          caption: 'Get this amazing product now! 💰\n\nLink in bio!',
          hashtags: ['#produk', '#viral', '#rekomendasi', '#affiliate'],
          cta: 'Link in bio!',
        });
      } else {
        const data = await res.json();
        if (data.success) {
          setGeneratedContent(data.data);
        }
      }
    } catch (error) {
      console.error('Error generating content:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyContent = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Content Generator" description="Buat konten affiliate dengan AI" />

      <div className="p-6 space-y-6">
        {/* Generator Form */}
        <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Generate New Content</h3>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Product</label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
              >
                {platforms.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Content Type</label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
              >
                {contentTypes.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={handleGenerate} disabled={!selectedProduct || generating}>
              <Wand2 className="h-4 w-4 mr-2" />
              {generating ? 'Generating...' : 'Generate Content'}
            </Button>
          </div>
        </div>

        {/* Generated Content */}
        {generatedContent && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Generated Content</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary">
                  <Send className="h-4 w-4 mr-2" />
                  Send to Telegram
                </Button>
                <Button size="sm" variant="primary">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Hook */}
              {generatedContent.hook && (
                <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-orange-400">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm font-medium">Hook</span>
                    </div>
                    <button
                      onClick={() => handleCopyContent(generatedContent.hook!)}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-gray-300">{generatedContent.hook}</p>
                </div>
              )}

              {/* Script */}
              {generatedContent.script && (
                <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-blue-400">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-sm font-medium">Script</span>
                    </div>
                    <button
                      onClick={() => handleCopyContent(generatedContent.script!)}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{generatedContent.script}</p>
                </div>
              )}

              {/* Caption */}
              {generatedContent.caption && (
                <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-400">Caption</span>
                    <button
                      onClick={() => handleCopyContent(generatedContent.caption!)}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{generatedContent.caption}</p>
                </div>
              )}

              {/* Hashtags */}
              {generatedContent.hashtags && (
                <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-green-400">
                      <Hash className="h-4 w-4" />
                      <span className="text-sm font-medium">Hashtags</span>
                    </div>
                    <button
                      onClick={() => handleCopyContent(generatedContent.hashtags!.join(' '))}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {generatedContent.hashtags.map((tag, i) => (
                      <span key={i} className="rounded-full bg-green-400/10 px-3 py-1 text-sm text-green-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              {generatedContent.cta && (
                <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-orange-400">CTA</span>
                    <button
                      onClick={() => handleCopyContent(generatedContent.cta!)}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-gray-300">{generatedContent.cta}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!generatedContent && !loading && (
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-12 text-center">
            <Wand2 className="mx-auto h-12 w-12 text-gray-600" />
            <p className="mt-4 text-gray-400">Select a product and click Generate to create content</p>
          </div>
        )}
      </div>
    </div>
  );
}