import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type AdminStatItem = {
  label: string;
  value: number | string;
  detail: string;
  icon: LucideIcon;
};

type AdminStatsGridProps = {
  stats: AdminStatItem[];
};

export default function AdminStatsGrid({ stats }: AdminStatsGridProps) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map(item => {
        const Icon = item.icon;
        return (
          <section key={item.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">{item.label}</div>
                <div className="mt-2 text-3xl font-black text-gray-950">{item.value}</div>
                <div className="mt-1 text-xs font-bold text-gray-400">{item.detail}</div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
