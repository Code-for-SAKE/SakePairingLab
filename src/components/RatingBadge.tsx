import { Frown, Smile, Sparkles } from 'lucide-react';

interface RatingBadgeProps {
  rating: number;
  className?: string;
}

export default function RatingBadge({ rating, className = '' }: RatingBadgeProps) {
  if (rating >= 4) {
    return (
      <div
        className={`inline-flex items-center text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg text-xs font-semibold ${className}`}
      >
        <Sparkles className="w-4 h-4 mr-1 text-rose-500 shrink-0" />
        <span>ピッタリ</span>
      </div>
    );
  }
  if (rating >= 2) {
    return (
      <div
        className={`inline-flex items-center text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg text-xs font-semibold ${className}`}
      >
        <Smile className="w-4 h-4 mr-1 text-indigo-500 shrink-0" />
        <span>良い</span>
      </div>
    );
  }
  return (
    <div
      className={`inline-flex items-center text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-semibold ${className}`}
    >
      <Frown className="w-4 h-4 mr-1 text-slate-500 shrink-0" />
      <span>悪い</span>
    </div>
  );
}
