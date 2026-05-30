import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ReactNode;
  iconColor?: string;
}

export function StatCard({ title, value, change, changeType = 'neutral', icon, iconColor = 'text-blue-500' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {change && (
            <p className={cn(
              'mt-1 text-sm',
              changeType === 'positive' && 'text-green-400',
              changeType === 'negative' && 'text-red-400',
              changeType === 'neutral' && 'text-gray-400'
            )}>
              {change}
            </p>
          )}
        </div>
        <div className={cn('rounded-lg bg-gray-800/50 p-3', iconColor)}>
          {icon}
        </div>
      </div>
    </div>
  );
}