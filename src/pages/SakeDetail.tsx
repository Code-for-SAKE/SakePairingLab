import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { PenTool, ChevronLeft, Loader2, Heart } from 'lucide-react';
import LoadMoreTrigger from '../components/LoadMoreTrigger';
import { doc, getDoc, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sake, Review } from '../types';
import FirestorePager from '../lib/firestorepager';
import { enrichReviews } from '../lib/review';
import { ReviewCard } from '../components/ReviewCard';
import { SakeFlavorImage } from '../components/SakeFlavorImage';

export default function SakeDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [sake, setSake] = useState<Sake | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pager = useMemo(
    () => new FirestorePager<Review>('reviews', orderBy('createdAt', 'desc'), 5),
    [id],
  );

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
        const fetchedReviews = await pager.loadFirst();
        const enrichedReviews = await enrichReviews(fetchedReviews, { withUser: true });
        if (isMounted) {
          setReviews(enrichedReviews);
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
    const review = await pager.loadNext();
    const enrichedReviews = await enrichReviews(review, { withUser: true });
    setReviews((prev) => [...prev, ...enrichedReviews]);
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
        <Link
          to="/explore"
          className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 mb-6"
        >
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
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 mb-6"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        戻る
      </button>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6 text-center">
        <div className="w-40 m-auto mb-2">
          <SakeFlavorImage
            sakeId={sake.id}
            sakeName={`${sake.brand} ${sake.bottle}(${sake.brewery})`}
            embedding={sake.embedding?.toArray()}
            editable={true}
          />
        </div>
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
            <ReviewCard key={review.id} review={review} />
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
