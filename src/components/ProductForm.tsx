'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/Button';

interface Product {
  id?: string;
  name: string;
  category: string;
  price: number;
  commission: number;
  affiliatePlatform: string;
  affiliateLink: string;
  imageUrl?: string;
  description?: string;
}

interface ProductFormProps {
  product?: Product;
  onSubmit: (data: Product) => void;
  onCancel: () => void;
}

const platforms = ['Shopee', 'Tokopedia', 'TikTok Shop', 'Lazada', 'Blibli', 'Bukalapak', 'Lainnya'];

export function ProductForm({ product, onSubmit, onCancel }: ProductFormProps) {
  const [formData, setFormData] = useState<Product>({
    name: product?.name || '',
    category: product?.category || '',
    price: product?.price || 0,
    commission: product?.commission || 10,
    affiliatePlatform: product?.affiliatePlatform || 'Shopee',
    affiliateLink: product?.affiliateLink || '',
    imageUrl: product?.imageUrl || '',
    description: product?.description || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.category.trim()) newErrors.category = 'Category is required';
    if (!formData.price || formData.price <= 0) newErrors.price = 'Valid price is required';
    if (!formData.affiliateLink.trim()) newErrors.affiliateLink = 'Affiliate link is required';
    if (!formData.affiliateLink.startsWith('http')) {
      newErrors.affiliateLink = 'Link must start with http/https';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Product Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={`w-full rounded-lg border ${errors.name ? 'border-red-500' : 'border-gray-700'} bg-gray-900 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
          placeholder="e.g., Smart Watch Pro X9"
        />
        {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
      </div>

      {/* Category & Platform */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Category <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className={`w-full rounded-lg border ${errors.category ? 'border-red-500' : 'border-gray-700'} bg-gray-900 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
            placeholder="e.g., Elektronik"
          />
          {errors.category && <p className="mt-1 text-sm text-red-400">{errors.category}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Platform</label>
          <select
            value={formData.affiliatePlatform}
            onChange={(e) => setFormData({ ...formData, affiliatePlatform: e.target.value })}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {platforms.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Price & Commission */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Price (IDR) <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">Rp</span>
            <input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
              className={`w-full rounded-lg border ${errors.price ? 'border-red-500' : 'border-gray-700'} bg-gray-900 pl-10 pr-4 py-2.5 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
              placeholder="0"
            />
          </div>
          {errors.price && <p className="mt-1 text-sm text-red-400">{errors.price}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Commission <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              value={formData.commission}
              onChange={(e) => setFormData({ ...formData, commission: parseInt(e.target.value) || 0 })}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 pl-4 pr-8 py-2.5 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              min="0"
              max="100"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">%</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            = Rp {(formData.price * formData.commission / 100).toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      {/* Affiliate Link */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Affiliate Link <span className="text-red-400">*</span>
        </label>
        <input
          type="url"
          value={formData.affiliateLink}
          onChange={(e) => setFormData({ ...formData, affiliateLink: e.target.value })}
          className={`w-full rounded-lg border ${errors.affiliateLink ? 'border-red-500' : 'border-gray-700'} bg-gray-900 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
          placeholder="https://..."
        />
        {errors.affiliateLink && <p className="mt-1 text-sm text-red-400">{errors.affiliateLink}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Brief description of the product..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : product?.id ? 'Update Product' : 'Add Product'}
        </Button>
      </div>
    </form>
  );
}