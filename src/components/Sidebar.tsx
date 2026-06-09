'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBrand } from '@/contexts/BrandContext';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/products', label: 'Products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/links', label: 'Tracking Links', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
  { href: '/content', label: 'Content', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m-6 0h6' },
  { href: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { selectedBrand, setSelectedBrand, brands, isLoading } = useBrand();
  const [isBrandMenuOpen, setIsBrandMenuOpen] = useState(false);

  const handleBrandSelect = (brand: { id: string; name: string; slug: string }) => {
    setSelectedBrand(brand);
    setIsBrandMenuOpen(false);
  };

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-[#0f172a] border-r border-gray-800">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">
            <span className="text-orange-500">AI</span> Affiliate
          </h1>
        </div>

        {/* Brand Selector */}
        <div className="border-b border-gray-800 px-3 py-3">
          <div className="relative">
            <button
              onClick={() => setIsBrandMenuOpen(!isBrandMenuOpen)}
              className="flex w-full items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700"
              disabled={isLoading}
            >
              <span className="flex items-center gap-2">
                <span className="text-orange-500">🏢</span>
                {selectedBrand ? selectedBrand.name : 'Select Brand'}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isBrandMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isBrandMenuOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg bg-gray-800 shadow-lg">
                {brands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => handleBrandSelect(brand)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-700 ${
                      selectedBrand?.id === brand.id ? 'bg-blue-600/20 text-blue-400' : 'text-white'
                    }`}
                  >
                    <span className="text-gray-400">•</span>
                    {brand.name}
                    {selectedBrand?.id === brand.id && (
                      <span className="ml-auto text-xs text-green-400">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Click outside to close */}
          {isBrandMenuOpen && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsBrandMenuOpen(false)}
            />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <svg
                  className="h-5 w-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-800 p-4">
          <div className="text-xs text-gray-500">
            v1.0.0 • Mei 2026
          </div>
        </div>
      </div>
    </aside>
  );
}