import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PenTool, ChevronLeft, Loader2, Heart } from 'lucide-react';
import RatingBadge from '../components/RatingBadge';
import LoadMoreTrigger from '../components/LoadMoreTrigger';
import { doc, getDoc, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sake, Review, UserProfile } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import FirestorePager from '../lib/firestorepager';

interface ReviewWithUser extends Review {
  user?: UserProfile;
}

const pager = new FirestorePager<Review>('reviews', orderBy('createdAt', 'desc'), 5);

export default function SakeDetail() {
  const { id } = useParams<{ id: string }>();
  const [sake, setSake] = useState<Sake | null>(null);
  const [reviews, setReviews] = useState<ReviewWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!id) {
      setLoading(false);
      setError('日本酒IDが指定されていません');
      return;
    }
    // この日本酒のレビューを取得するためのクエリを追加
    pager.addQuery(where('sakeId', '==', id));

    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const sakeDoc = await getDoc(doc(db, 'sakes', id));
        if (!sakeDoc.exists()) {
          if (isMounted) {
            setError('指定された日本酒が見つかりませんでした。');
            setLoading(false);
          }
          return;
        }

        const sakeData = { id: sakeDoc.id, ...sakeDoc.data() } as Sake;
        if (isMounted) {
          setSake(sakeData);
        }

        // Fetch reviews for this sake
        const fetchedReviews = await pager.loadFirst() as ReviewWithUser[] | null;
        if (fetchedReviews === null) {
          if (isMounted) {
            setReviews([]);
          }
          return;
        }
        // Fetch user profiles for these reviews
        const userCache = new Map<string, UserProfile>();
        for (const rev of fetchedReviews) {
          if (rev.userId && !userCache.has(rev.userId)) {
            try {
              const uSnap = await getDoc(doc(db, 'users', rev.userId));
              if (uSnap.exists()) {
                userCache.set(rev.userId, uSnap.data() as UserProfile);
              }
            } catch (e) {
              console.error('Error fetching user profile:', e);
            }
          }
          if (rev.userId && userCache.has(rev.userId)) {
            rev.user = userCache.get(rev.userId);
          }
        }

        // Sort reviews by createdAt descending
        fetchedReviews.sort((a, b) => {
          const timeA = typeof a.createdAt === 'number' ? a.createdAt : a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = typeof b.createdAt === 'number' ? b.createdAt : b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeB - timeA;
        });

        if (isMounted) {
          setReviews(fetchedReviews);
        }
      } catch (err) {
        console.error('Error fetching sake or reviews:', err);
        if (isMounted) {
          setError('データの取得に失敗しました。');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const review = await pager.loadNext() as ReviewWithUser[] | null;
    if (review) {
      setReviews(prev => [...prev, ...review]);
    }
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto pt-16 px-4 text-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600" />
        <p className="text-sm">日本酒データを読み込み中...</p>
      </div>
    );
  }

  if (error || !sake) {
    return (
      <div className="max-w-xl mx-auto pt-6 px-4">
        <Link to="/explore" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 mb-6">
          <ChevronLeft className="w-4 h-4 mr-1" />
          一覧に戻る
        </Link>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center text-rose-500">
          {error || '日本酒が見つかりませんでした。'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto pt-6 px-4 pb-20">
      <Link to="/explore" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 mb-6">
        <ChevronLeft className="w-4 h-4 mr-1" />
        戻る
      </Link>
      
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6 text-center">
        <p className="text-sm font-medium text-slate-500 mb-2">{sake.brewery}</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{sake.brand}</h1>
        <h2 className="text-lg text-slate-700 mb-4">{sake.bottle}</h2>
        <p className="text-slate-600 leading-relaxed text-sm">{sake.description}</p>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg text-slate-900">みんなのテイスティング</h3>
        <Link 
          to={`/sake/${id}/review`}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <PenTool className="w-4 h-4 mr-2" />
          記録する
        </Link>
      </div>

      {reviews.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center text-slate-500 py-12">
          まだレビューがありません。最初のレビューを書きましょう！
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm">
                    {review.user?.displayName?.[0] || '名'}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{review.user?.displayName || 'ユーザー'}</p>
                    <p className="text-xs text-slate-400">
                      {review.createdAt ? formatDistanceToNow(
                        typeof review.createdAt === 'number' ? review.createdAt : review.createdAt.toMillis ? review.createdAt.toMillis() : Date.now(),
                        { addSuffix: true, locale: ja }
                      ) : ''}
                    </p>
                  </div>
                </div>
                <RatingBadge rating={review.rating} />
              </div>

              {review.comment && (
                <p className="text-slate-700 text-sm mb-3">{review.comment}</p>
              )}

              <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs mb-3">
                {review.temperature && (
                  <div>
                    <span className="text-slate-400 block mb-0.5">温度</span>
                    <span className="font-medium text-slate-700">{review.temperature}</span>
                  </div>
                )}
                {review.vessel && (
                  <div>
                    <span className="text-slate-400 block mb-0.5">酒器</span>
                    <span className="font-medium text-slate-700">{review.vessel}</span>
                  </div>
                )}
                {review.pairing && (
                  <div className="col-span-2">
                    <span className="text-slate-400 block mb-0.5">ペアリング</span>
                    <span className="font-medium text-slate-700">{review.pairing}</span>
                  </div>
                )}
              </div>

              {((review.aroma?.broads && review.aroma.broads.length > 0) || (review.taste?.broads && review.taste.broads.length > 0) || review.aroma?.custom || review.taste?.custom) && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {review.aroma?.broads?.map((a, i) => (
                    <span key={`aroma-${i}`} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                      香: {a}
                    </span>
                  ))}
                  {review.aroma?.custom && (
                    <span className="text-xs bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-full font-medium border border-indigo-200">
                      香(メモ): {review.aroma.custom}
                    </span>
                  )}
                  {review.taste?.broads?.map((t, i) => (
                    <span key={`taste-${i}`} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                      味: {t}
                    </span>
                  ))}
                  {review.taste?.custom && (
                    <span className="text-xs bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                      味(メモ): {review.taste.custom}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center text-slate-400 text-xs mt-2">
                <span className="flex items-center space-x-1">
                  <Heart className="w-3.5 h-3.5 text-slate-400" />
                  <span>{review.likesCount || 0}</span>
                </span>
              </div>
            </div>
          ))}
          <LoadMoreTrigger
            onLoadMore={handleLoadMore}
            hasMore={pager.isLastPage === false}
            loading={loadingMore}
          />
        </div>
      )}
    </div>
  );
}
