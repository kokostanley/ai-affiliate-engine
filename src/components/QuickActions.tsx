'use client';

import Link from 'next/link';
import { Plus, Wand2, Link2 } from 'lucide-react';

export function QuickActions() {
  const actions = [
    { label: 'Add Product', href: '/products?action=add', icon: Plus, color: 'text-blue-400 bg-blue-400/10 hover:bg-blue-400/20' },
    { label: 'Generate Content', href: '/content?action=generate', icon: Wand2, color: 'text-orange-400 bg-orange-400/10 hover:bg-orange-400/20' },
    { label: 'Create Link', href: '/links?action=create', icon: Link2, color: 'text-green-400 bg-green-400/10 hover:bg-green-400/20' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {actions.map((action, i) => (
        <Link
          key={i}
          href={action.href}
          className={`flex items-center gap-3 rounded-xl border border-gray-800 bg-[#0f172a] p-4 transition-all hover:border-gray-700 ${action.color}`}
        >
          <action.icon className="h-5 w-5" />
          <span className="text-sm font-medium text-white">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}