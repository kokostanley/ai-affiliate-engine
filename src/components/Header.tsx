'use client';

import { useState } from 'react';
import { Bell, Search, User } from 'lucide-react';

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-800 bg-[#0a0f1a] px-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {description && <p className="text-sm text-gray-400">{description}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <Search className="h-5 w-5" />
        </button>

        {/* Notifications */}
        <button className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-orange-500" />
        </button>

        {/* Profile */}
        <button className="flex items-center gap-2 rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
          <User className="h-5 w-5" />
          <span className="text-sm">Admin</span>
        </button>
      </div>
    </header>
  );
}