import { useEffect, useMemo, useState } from 'react';
import { orderBy } from 'firebase/firestore';
import { Review } from '../types';
import { Plus } from 'lucide-react';
import LoadMoreTrigger from '../components/LoadMoreTrigger';
import { Link } from 'react-router-dom';
import FirestorePager from '../lib/firestorepager';
import { enrichReviews } from '../lib/review';
import { ReviewCard } from '../components/ReviewCard';

export default function HomePage() {
  const pager = useMemo(
    () => new FirestorePager<Review>('reviews', orderBy('createdAt', 'desc'), 5),
    [],
  );
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchInitialReviews = async () => {
      try {
        setLoading(true);
        setError(null);

        const reviews = await pager.loadFirst();
        setHasMore(!pager.isLastPage);
        if (reviews === null) {
          if (isMounted) {
            setReviews([]);
          }
          return;
        }

        const enrichedReviews = await enrichReviews(reviews, { withUser: true, withSake: true });

        if (isMounted) {
          setReviews(enrichedReviews);
        }
      } catch (e: any) {
        console.error('Error fetching reviews:', e);
        if (isMounted) {
          setError('レビューの取得に失敗しました。');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInitialReviews();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const reviews = await pager.loadNext();
      setHasMore(!pager.isLastPage);

      if (!reviews) return;
      const enrichedReviews = await enrichReviews(reviews, { withUser: true, withSake: true });

      setReviews((prev) => [...prev, ...enrichedReviews]);
    } catch (e) {
      console.error('Error loading more reviews:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto pt-6 px-4">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">タイムライン</h1>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-48 bg-slate-200 rounded-2xl"></div>
          <div className="h-48 bg-slate-200 rounded-2xl"></div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center text-rose-500 text-sm">
          {error}
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
          <p className="text-slate-600 font-medium mb-2">まだテイスティング記録がありません</p>
          <p className="text-slate-400 text-sm mb-6">
            日本酒を登録・検索して最初の一杯を記録してみましょう！
          </p>
          <Link
            to="/explore"
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            日本酒を探して記録する
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {reviews.map((review) => {
            return <ReviewCard key={review.id} review={review} />;
          })}
          <LoadMoreTrigger onLoadMore={handleLoadMore} hasMore={hasMore} loading={loadingMore} />
        </div>
      )}
    </div>
  );
}
