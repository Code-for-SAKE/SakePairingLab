import React, { useEffect, useState } from 'react';
import { orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Review, UserProfile, Sake } from '../types';
import { Heart, MessageCircle, Plus } from 'lucide-react';
import RatingBadge from '../components/RatingBadge';
import LoadMoreTrigger from '../components/LoadMoreTrigger';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import FirestorePager from '../lib/firestorepager';

interface FullReview extends Review {
  user?: UserProfile;
  sake?: Sake;
}

const pager = new FirestorePager<Review>('reviews', orderBy('createdAt', 'desc'), 2);

export default function HomePage() {
  const [reviews, setReviews] = useState<FullReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userCache = useState<Map<string, UserProfile>>(() => new Map())[0];
  const sakeCache = useState<Map<string, Sake>>(() => new Map())[0];


  const enrichReviews = async (rawReviews: FullReview[]) => {
    for (const review of rawReviews) {
      if (review.userId && !userCache.has(review.userId)) {
        try {
          const uDoc = await getDoc(doc(db, 'users', review.userId));
          if (uDoc.exists()) {
            userCache.set(review.userId, { id: uDoc.id, ...uDoc.data() } as UserProfile);
          }
        } catch (err) {
          console.error('Error fetching user:', err);
        }
      }
      if (review.userId && userCache.has(review.userId)) {
        review.user = userCache.get(review.userId);
      }

      if (review.sakeId && !sakeCache.has(review.sakeId)) {
        try {
          const sDoc = await getDoc(doc(db, 'sakes', review.sakeId));
          if (sDoc.exists()) {
            sakeCache.set(review.sakeId, { id: sDoc.id, ...sDoc.data() } as Sake);
          }
        } catch (err) {
          console.error('Error fetching sake:', err);
        }
      }
      if (review.sakeId && sakeCache.has(review.sakeId)) {
        review.sake = sakeCache.get(review.sakeId);
      }
    }
  };

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

        const rawReviews: FullReview[] = reviews as FullReview[];
        await enrichReviews(rawReviews);

        if (isMounted) {
          setReviews(rawReviews);
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

      const rawReviews: FullReview[] = reviews as FullReview[];
      await enrichReviews(rawReviews);

      setReviews(prev => [...prev, ...rawReviews]);
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
          <p className="text-slate-400 text-sm mb-6">日本酒を登録・検索して最初の一杯を記録してみましょう！</p>
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
            const createdTime = typeof review.createdAt === 'number' 
              ? review.createdAt 
              : review.createdAt?.toMillis 
                ? review.createdAt.toMillis() 
                : Date.now();

            return (
              <div key={review.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold overflow-hidden">
                      {review.user?.photoURL ? (
                        <img src={review.user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        review.user?.displayName?.[0] || '名'
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{review.user?.displayName || 'ユーザー'}</p>
                      <p className="text-xs text-slate-500">
                        {review.user?.title || 'テイスター'} • {formatDistanceToNow(createdTime, { addSuffix: true, locale: ja })}
                      </p>
                    </div>
                  </div>
                  <RatingBadge rating={review.rating} />
                </div>

                <div className="mb-4">
                  <Link 
                    to={`/sake/${review.sakeId}`}
                    className="text-sm font-bold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1"
                  >
                    {review.sake ? `${review.sake.brand} ${review.sake.bottle}` : '日本酒詳細を見る'}
                  </Link>
                  {review.comment && (
                    <p className="text-slate-700 text-sm leading-relaxed">{review.comment}</p>
                  )}
                </div>

                <div className="bg-slate-50 rounded-xl p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
                  {review.temperature && (
                    <div>
                      <span className="text-slate-500 text-xs block mb-1">温度</span>
                      <span className="font-medium text-slate-800">{review.temperature}</span>
                    </div>
                  )}
                  {review.vessel && (
                    <div>
                      <span className="text-slate-500 text-xs block mb-1">酒器</span>
                      <span className="font-medium text-slate-800">{review.vessel}</span>
                    </div>
                  )}
                  {review.pairing && (
                    <div className="col-span-2">
                      <span className="text-slate-500 text-xs block mb-1">ペアリング</span>
                      <span className="font-medium text-slate-800">{review.pairing}</span>
                    </div>
                  )}
                </div>

                {((review.aroma?.broads && review.aroma.broads.length > 0) || (review.taste?.broads && review.taste.broads.length > 0) || review.aroma?.custom || review.taste?.custom) && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {review.aroma?.broads?.map((a, i) => (
                      <span key={`aroma-${i}`} className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium">
                        香: {a}
                      </span>
                    ))}
                    {review.aroma?.custom && (
                      <span className="text-xs bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded-full font-medium border border-indigo-200">
                        香(メモ): {review.aroma.custom}
                      </span>
                    )}
                    {review.taste?.broads?.map((t, i) => (
                      <span key={`taste-${i}`} className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                        味: {t}
                      </span>
                    ))}
                    {review.taste?.custom && (
                      <span className="text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full font-medium border border-emerald-200">
                        味(メモ): {review.taste.custom}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center space-x-6 text-slate-500">
                  <button className="flex items-center space-x-1.5 hover:text-rose-500 transition-colors">
                    <Heart className="w-5 h-5" />
                    <span className="text-sm">{review.likesCount || 0}</span>
                  </button>
                  <button className="flex items-center space-x-1.5 hover:text-indigo-500 transition-colors">
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm">0</span>
                  </button>
                </div>
              </div>
            );
          })}
          <LoadMoreTrigger
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            loading={loadingMore}
          />
        </div>
      )}
    </div>
  );
}
