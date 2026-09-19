import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadMoreTriggerProps {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  className?: string;
}

export default function LoadMoreTrigger({
  onLoadMore,
  hasMore,
  loading,
  className = '',
}: LoadMoreTriggerProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(loading);
  const hasMoreRef = useRef(hasMore);
  const onLoadMoreRef = useRef(onLoadMore);

  loadingRef.current = loading;
  hasMoreRef.current = hasMore;
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreRef.current && !loadingRef.current) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: '150px' }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  if (!hasMore) {
    return null;
  }

  return (
    <div ref={sentinelRef} className={`pt-4 pb-6 text-center ${className}`}>
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="w-full sm:w-auto px-6 py-3 bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-xl shadow-xs hover:bg-slate-50 hover:border-slate-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center space-x-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>読み込み中...</span>
          </>
        ) : (
          <span>さらに読み込む</span>
        )}
      </button>
    </div>
  );
}

