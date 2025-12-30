"use client";

export default function PostSkeleton() {
  return (
    <div className="rounded-[2rem] md:rounded-[2.5rem] bg-secondary/80 p-5 md:p-8 shadow-xl border border-white/5 animate-pulse mb-6">
      <div className="flex items-start gap-3 md:gap-5">
        {/* Profile Pic Skeleton */}
        <div className="h-10 w-10 md:h-14 md:w-14 shrink-0 rounded-full bg-white/10 border-2 border-white/5" />
        
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            {/* Name Skeleton */}
            <div className="flex flex-col gap-2">
              <div className="h-4 w-32 bg-white/10 rounded-lg" />
              <div className="h-2 w-20 bg-white/5 rounded-lg" />
            </div>
          </div>
          
          {/* Content Lines */}
          <div className="space-y-3">
            <div className="h-3 w-full bg-white/10 rounded-lg" />
            <div className="h-3 w-5/6 bg-white/10 rounded-lg" />
          </div>

          {/* Image Placeholder Skeleton */}
          <div className="mt-4 h-48 md:h-64 w-full bg-white/5 rounded-2xl border border-white/5" />
        </div>
      </div>

      {/* Buttons Skeleton */}
      <div className="mt-6 md:mt-8 flex items-center gap-6 border-t border-white/5 pt-6">
        <div className="h-8 w-16 bg-white/5 rounded-xl" />
        <div className="h-8 w-24 bg-white/5 rounded-xl" />
      </div>
    </div>
  );
}