import React from 'react';

export const SkeletonPulse = ({ className = '', style = {} }) => (
  <div 
    className={`animate-pulse bg-slate-200 dark:bg-slate-800/60 rounded ${className}`} 
    style={style}
  />
);

export const CardSkeleton = () => (
  <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) shadow-sm flex flex-col justify-between h-[108px] transition-colors duration-200">
    <SkeletonPulse className="w-1/2 h-3" />
    <div className="flex items-center gap-3 mt-4">
      <SkeletonPulse className="w-1/3 h-7" />
      <span className="text-slate-300 dark:text-slate-700 text-lg font-light">|</span>
      <SkeletonPulse className="w-1/4 h-3.5" />
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 5, cols = 5 }) => (
  <div className="space-y-4 animate-fade-in">
    <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
      <SkeletonPulse className="w-full sm:max-w-xs h-8" />
      <div className="flex gap-2 w-full sm:w-auto justify-end">
        <SkeletonPulse className="w-24 h-8" />
        <SkeletonPulse className="w-24 h-8" />
      </div>
    </div>
    <div className="rounded-xl border border-(--line) overflow-hidden bg-(--surface)">
      <div className="bg-(--surface-mid) p-4 flex gap-4 border-b border-(--line)">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonPulse key={i} className="flex-1 h-3.5" />
        ))}
      </div>
      <div className="divide-y divide-(--line-soft)">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="p-4 flex gap-4 bg-(--surface)">
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonPulse key={c} className="flex-1 h-3" />
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const DashboardSkeleton = () => (
  <div className="space-y-6 animate-fade-in">
    {/* Title skeleton */}
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-(--line) pb-5">
      <div className="space-y-2">
        <SkeletonPulse className="w-64 h-6" />
        <SkeletonPulse className="w-96 h-3" />
      </div>
      <SkeletonPulse className="w-40 h-8" />
    </div>
    
    {/* KPI cards skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>

    {/* Chart section skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 rounded-2xl p-5 border border-(--line) bg-(--surface) h-[360px] flex flex-col justify-between">
        <SkeletonPulse className="w-1/3 h-4" />
        <div className="flex-1 flex items-end gap-4 justify-between mt-8 mb-4 px-4">
          {[40, 60, 45, 80, 50, 90, 70].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <SkeletonPulse className="w-full bg-slate-200/50 dark:bg-slate-800/40" style={{ height: `${h * 2}px` }} />
              <SkeletonPulse className="w-2/3 h-2" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) h-[360px] flex flex-col justify-between">
        <SkeletonPulse className="w-1/2 h-4" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-40 h-40 rounded-full border-8 border-slate-100 dark:border-slate-800/50 flex items-center justify-center animate-pulse" />
        </div>
        <SkeletonPulse className="w-3/4 h-3 mx-auto" />
      </div>
    </div>
  </div>
);
