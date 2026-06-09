'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface BrandContextType {
  selectedBrand: Brand | null;
  setSelectedBrand: (brand: Brand | null) => void;
  brands: Brand[];
  setBrands: (brands: Brand[]) => void;
  isLoading: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

const STORAGE_KEY = 'selected_brand';

export function BrandProvider({ children }: { children: ReactNode }) {
  const [selectedBrand, setSelectedBrandState] = useState<Brand | null>(null);
  const [brands, setBrandsState] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSelectedBrandState(parsed);
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    // Fetch brands from API
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    try {
      const response = await fetch('/api/brands');
      if (response.ok) {
        const data = await response.json();
        setBrandsState(data.data.map((b: any) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
        })));
      }
    } catch (e) {
      console.error('Failed to fetch brands:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const setSelectedBrand = (brand: Brand | null) => {
    setSelectedBrandState(brand);
    if (brand) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const setBrands = (newBrands: Brand[]) => {
    setBrandsState(newBrands);
  };

  return (
    <BrandContext.Provider value={{
      selectedBrand,
      setSelectedBrand,
      brands,
      setBrands,
      isLoading,
    }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (context === undefined) {
    throw new Error('useBrand must be used within a BrandProvider');
  }
  return context;
}

// HOC for requiring brand selection
export function useRequireBrand() {
  const { selectedBrand, brands, isLoading } = useBrand();

  return {
    selectedBrand,
    brands,
    isLoading,
    hasSelected: !!selectedBrand,
  };
}