'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Pause, Play, Link as LinkIcon, Wand2, Copy, ExternalLink } from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/Modal';
import { ProductForm } from '@/components/ProductForm';

interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  price: number;
  commission: number;
  commissionAmount: number;
  affiliatePlatform: string;
  affiliateLink: string;
  imageUrl?: string;
  status: string;
  createdAt: string;
  _count?: {
    links: number;
    contents: number;
  };
  links?: Array<{ slug: string }>;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.data.products);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async (productData: any) => {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      const data = await res.json();
      if (data.success) {
        fetchProducts();
        setShowAddModal(false);
      }
    } catch (error) {
      console.error('Error adding product:', error);
    }
  };

  const handleAddViaLink = async () => {
    if (!linkInput.trim()) return;

    setAddingLink(true);
    try {
      const res = await fetch('/api/workflow/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: linkInput }),
      });
      const data = await res.json();

      if (data.success) {
        fetchProducts();
        setShowLinkModal(false);
        setLinkInput('');
      } else {
        alert(data.error?.message || 'Failed to add product from link');
      }
    } catch (error) {
      console.error('Error adding via link:', error);
      alert('Failed to add product. Check the link format.');
    } finally {
      setAddingLink(false);
    }
  };

  const handleUpdateProduct = async (productData: any) => {
    if (!editingProduct) return;
    try {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      const data = await res.json();
      if (data.success) {
        fetchProducts();
        setEditingProduct(null);
      }
    } catch (error) {
      console.error('Error updating product:', error);
    }
  };

  const handleToggleStatus = async (product: Product) => {
    setActionLoading(product.id);
    try {
      const newStatus = product.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      const res = await fetch(`/api/products/${product.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchProducts();
    } catch (error) {
      console.error('Error toggling status:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;
    try {
      const res = await fetch(`/api/products/${deletingProduct.id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProducts();
        setDeletingProduct(null);
      }
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  const handleCopyLink = async (slug: string) => {
    const link = `${window.location.origin}/go/${slug}`;
    await navigator.clipboard.writeText(link);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-500/20 text-green-400 border-green-500/30',
    PAUSED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    ARCHIVED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const platformColors: Record<string, string> = {
    Shopee: 'text-orange-400',
    TikTok: 'text-pink-400',
    Tokopedia: 'text-green-400',
    Lazada: 'text-blue-400',
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Products" description="Kelola produk affiliate Anda" />

      <div className="p-6 space-y-6">
        {/* Actions Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-400">
            {products.length} products
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowLinkModal(true)} variant="secondary" size="sm">
              <LinkIcon className="h-4 w-4 mr-2" />
              Add via Link
            </Button>
            <Button onClick={() => setShowAddModal(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Manual
            </Button>
          </div>
        </div>

        {/* Products Table */}
        {loading ? (
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-12 text-center">
            <p className="text-gray-400">Loading...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-12 text-center">
            <p className="text-gray-400 mb-4">No products yet</p>
            <div className="flex justify-center gap-3">
              <Button onClick={() => setShowLinkModal(true)} variant="secondary">
                <LinkIcon className="h-4 w-4 mr-2" />
                Add via Link
              </Button>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Manual
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0f172a]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Commission</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Link</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium text-white">{product.name}</p>
                        <p className={`text-xs ${platformColors[product.affiliatePlatform] || 'text-gray-400'}`}>
                          {product.affiliatePlatform} • {product.category}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium text-white">
                      Rp {product.price.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-orange-400">{product.commission}%</span>
                      <span className="ml-1 text-xs text-gray-500">
                        (Rp {(product.price * product.commission / 100).toLocaleString('id-ID')})
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {product.links && product.links[0] ? (
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-gray-800 px-2 py-1 text-xs text-blue-400">
                            /go/{product.links[0].slug.slice(0, 15)}...
                          </code>
                          <button
                            onClick={() => handleCopyLink(product.links![0].slug)}
                            className="rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-white transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">No link</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColors[product.status]}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleStatus(product)}
                          disabled={actionLoading === product.id}
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-700 hover:text-white transition-colors"
                          title={product.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                        >
                          {product.status === 'ACTIVE' ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-700 hover:text-white transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingProduct(product)}
                          className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add via Link Modal */}
      <Modal isOpen={showLinkModal} onClose={() => setShowLinkModal(false)} title="Add Product via Link" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Paste affiliate link dari Shopee, TikTok, Tokopedia, atau Lazada.
            Sistem akan otomatis scrape info produk dan generate konten.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Affiliate Link</label>
            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://shopee.co.id/product-..."
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="rounded-lg bg-gray-800/50 p-3 text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-1">Supported platforms:</p>
            <div className="flex flex-wrap gap-2">
              {['Shopee', 'TikTok Shop', 'Tokopedia', 'Lazada'].map((p) => (
                <span key={p} className="rounded bg-gray-700 px-2 py-0.5">{p}</span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowLinkModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddViaLink} disabled={!linkInput.trim() || addingLink}>
              {addingLink ? (
                <>
                  <span className="mr-2 animate-spin">⏳</span>
                  Processing...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Scrape & Generate
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Manual Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Product" size="lg">
        <ProductForm onSubmit={handleAddProduct} onCancel={() => setShowAddModal(false)} />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editingProduct} onClose={() => setEditingProduct(null)} title="Edit Product" size="lg">
        {editingProduct && (
          <ProductForm
            product={editingProduct}
            onSubmit={handleUpdateProduct}
            onCancel={() => setEditingProduct(null)}
          />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deletingProduct} onClose={() => setDeletingProduct(null)} title="Delete Product">
        <div className="space-y-4">
          <p className="text-gray-300">
            Are you sure you want to delete <strong className="text-white">{deletingProduct?.name}</strong>?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeletingProduct(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteProduct}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}