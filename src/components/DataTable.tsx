import { cn } from '@/lib/utils';

interface DataTableProps {
  columns: string[];
  data: any[];
  actions?: (row: any) => React.ReactNode;
  emptyMessage?: string;
}

export function DataTable({ columns, data, actions, emptyMessage = 'No data available' }: DataTableProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-12 text-center">
        <p className="text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0f172a]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                >
                  {col}
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-800/50">
                {Object.values(row).map((cell: any, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-4 text-sm text-gray-300">
                    {typeof cell === 'object' ? cell.value || cell : cell}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-4 text-right">
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}