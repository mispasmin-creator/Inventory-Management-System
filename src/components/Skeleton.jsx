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
  <div className="space-y-6 animate-fade-in max-w-7xl mx-auto p-1.5">
    {/* 1. Header Section */}
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-(--line) pb-5">
      <div className="space-y-2">
        <SkeletonPulse className="w-64 h-6" />
        <SkeletonPulse className="w-96 h-3" />
      </div>
      <div className="flex gap-3">
        <SkeletonPulse className="w-32 h-8" />
        <SkeletonPulse className="w-12 h-8" />
      </div>
    </div>

    {/* 2. Central Tab Pill Selector */}
    <div className="flex justify-center my-4">
      <SkeletonPulse className="w-80 h-11 rounded-2xl" />
    </div>

    {/* 3. Branch Selector Cards */}
    <div className="space-y-2.5">
      <SkeletonPulse className="w-48 h-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-2xl p-5 border border-(--line) bg-(--surface) h-24 flex flex-col justify-between">
            <SkeletonPulse className="w-16 h-3" />
            <SkeletonPulse className="w-24 h-5" />
            <SkeletonPulse className="w-12 h-2" />
          </div>
        ))}
      </div>
    </div>

    {/* 4. KPI cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-2xl p-5 border border-(--line) bg-(--surface) h-32 flex flex-col justify-between">
          <div className="flex justify-between">
            <SkeletonPulse className="w-24 h-3" />
            <SkeletonPulse className="w-4 h-4 rounded" />
          </div>
          <SkeletonPulse className="w-32 h-7" />
          <SkeletonPulse className="w-16 h-2" />
        </div>
      ))}
    </div>

    {/* 5. Top 5 + Averages */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 rounded-2xl p-5 border border-(--line) bg-(--surface) h-[400px] flex flex-col justify-between">
        <div className="flex justify-between items-center pb-3 border-b border-(--line-soft)">
          <SkeletonPulse className="w-48 h-4" />
          <SkeletonPulse className="w-32 h-6" />
        </div>
        <div className="flex-1 space-y-4 py-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <SkeletonPulse className="w-32 h-3" />
                <SkeletonPulse className="w-12 h-3" />
              </div>
              <SkeletonPulse className="w-full h-2 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl p-5 border border-(--line) bg-(--surface) h-[400px] flex flex-col justify-between">
        <SkeletonPulse className="w-32 h-4 border-b border-(--line-soft) pb-3" />
        <div className="flex-1 space-y-5 py-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <SkeletonPulse className="w-24 h-3" />
              <SkeletonPulse className="w-full h-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);
