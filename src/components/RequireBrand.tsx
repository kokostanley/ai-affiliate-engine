'use client';

import { useBrand } from '@/contexts/BrandContext';
import { AlertTriangle, X } from 'lucide-react';

interface RequireBrandProps {
  children: React.ReactNode;
  fallback?: 'block' | 'banner';
}

export function RequireBrand({ children, fallback = 'banner' }: RequireBrandProps) {
  const { selectedBrand, brands, isLoading } = useBrand();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (selectedBrand) {
    return <>{children}</>;
  }

  // Show brand selector
  if (fallback === 'banner') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="w-full max-w-md rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-6 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Pilih Brand terlebih dahulu
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            Silakan pilih brand untuk melanjutkan.
          </p>

          <div className="space-y-2">
            {brands.map((brand) => (
              <BrandButton key={brand.id} brand={brand} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
        <div>
          <h4 className="font-medium text-white">Brand belum dipilih</h4>
          <p className="text-sm text-gray-400 mb-3">
            Pilih brand di sidebar untuk melanjutkan.
          </p>
          <div className="flex gap-2">
            {brands.map((brand) => (
              <BrandButton key={brand.id} brand={brand} size="sm" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandButton({
  brand,
  size = 'md'
}: {
  brand: { id: string; name: string; slug: string };
  size?: 'sm' | 'md';
}) {
  const { setSelectedBrand } = useBrand();

  const handleClick = () => {
    setSelectedBrand(brand);
  };

  const baseClass = "flex items-center gap-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors";

  if (size === 'sm') {
    return (
      <button
        onClick={handleClick}
        className={`${baseClass} px-3 py-1.5 text-sm text-white`}
      >
        {brand.name}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`${baseClass} w-full justify-center px-4 py-3 text-white`}
    >
      <span className="text-lg">🏢</span>
      <span className="font-medium">{brand.name}</span>
    </button>
  );
}

// Hook to check if brand is selected
export function useCheckBrand() {
  const { selectedBrand, brands, setSelectedBrand, isLoading } = useBrand();

  return {
    selectedBrand,
    brands,
    setSelectedBrand,
    isLoading,
    hasSelected: !!selectedBrand,
    requireBrand: !selectedBrand,
  };
}