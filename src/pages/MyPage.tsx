import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Award, Settings, TrendingUp, Loader2, PenTool, LogOut } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { where, orderBy } from 'firebase/firestore';
import { Review, UserProfile } from '../types';
import { Link } from 'react-router-dom';
import FirestorePager from '../lib/firestorepager';
import { enrichReviews } from '../lib/review';
import { ReviewCard }from '../components/ReviewCard';
import LoadMoreTrigger from '../components/LoadMoreTrigger';

const TASTE_CATEGORIES = [
  'フルーティ',
  'スッキリ・軽快',
  '熟成',
  'ふくよか・旨味',
  '酸味',
  '甘味',
];

interface ReviewWithUser extends Review {
  user?: UserProfile;
}

const pager = new FirestorePager<Review>('reviews', orderBy('createdAt', 'desc'), 5);

export default function MyPage() {
  const { user, profile, signInWithGoogle, logout } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);


  useEffect(() => {
    let isMounted = true;
    if (!user) {
      setReviews([]);
      return;
    }

    pager.addQuery(where('userId', '==', user.uid));

    const fetchMyReviews = async () => {
      setLoading(true);
      try {
        const myReviews = await pager.loadFirst();
        const enrichedReviews = await enrichReviews(myReviews);
        if (isMounted) {
          setReviews(enrichedReviews);
        }
      } catch (err) {
        console.error('Error fetching user reviews:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchMyReviews();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const review = await pager.loadNext() as ReviewWithUser[] | null;
    const enrichedReviews = await enrichReviews(review);
    setReviews(prev => [...prev, ...enrichedReviews]);
    setLoadingMore(false);
  };


  // Compute dynamic taste preferences from actual reviews
  const tasteCounts: { [key: string]: number } = {};
  TASTE_CATEGORIES.forEach(cat => (tasteCounts[cat] = 0));

  reviews.forEach(r => {
    // Check aroma
    r.aroma?.broads?.forEach(b => {
      if (b === 'スッキリ') tasteCounts['スッキリ・軽快'] = (tasteCounts['スッキリ・軽快'] || 0) + 1;
      else if (b === 'ふくよか') tasteCounts['ふくよか・旨味'] = (tasteCounts['ふくよか・旨味'] || 0) + 1;
      else if (tasteCounts[b] !== undefined) tasteCounts[b] += 1;
      else tasteCounts[b] = (tasteCounts[b] || 0) + 1;
    });
    // Check taste
    r.taste?.broads?.forEach(b => {
      if (b === 'スッキリ') tasteCounts['スッキリ・軽快'] = (tasteCounts['スッキリ・軽快'] || 0) + 1;
      else if (b === 'ふくよか') tasteCounts['ふくよか・旨味'] = (tasteCounts['ふくよか・旨味'] || 0) + 1;
      else if (tasteCounts[b] !== undefined) tasteCounts[b] += 1;
      else tasteCounts[b] = (tasteCounts[b] || 0) + 1;
    });
  });

  const maxCount = Math.max(...Object.values(tasteCounts), 1);
  const chartData = TASTE_CATEGORIES.map(cat => ({
    subject: cat,
    A: Math.round(((tasteCounts[cat] || 0) / maxCount) * 100),
    fullMark: 100,
  }));

  if (!user) {
    return (
      <div className="max-w-xl mx-auto pt-16 px-4 text-center">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 mb-2">ログインしていません</h2>
          <p className="text-slate-500 text-sm mb-6">ログインするとテイスティング記録や好みの分析を確認できます。</p>
          <button
            onClick={signInWithGoogle}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto pt-6 px-4 pb-20">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900">マイページ</h1>
        <div className="flex items-center space-x-4">
        <Link to="/settings" className="p-2 text-slate-400 hover:text-slate-900">
          <Settings className="w-6 h-6" />
        </Link>
              <button
        onClick={logout}
        className="p-3 flex items-center justify-center space-x-2 text-rose-500 bg-rose-50 py-4 rounded-xl font-medium hover:bg-rose-100 transition-colors"
      >
        <LogOut className="w-5 h-5" />
        <span>ログアウト</span>
      </button>
      </div>

      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6 text-center">
        <div className="w-20 h-20 bg-indigo-100 rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-indigo-700">{profile?.displayName?.[0] || '名'}</span>
          )}
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">{profile?.displayName || 'ユーザー'}</h2>
        <div className="flex items-center justify-center text-amber-600 font-medium text-sm mb-4">
          <Award className="w-4 h-4 mr-1" />
          {profile?.title || '見習いテイスター'}
        </div>

        <div className="flex justify-center space-x-8 text-sm">
          <div className="text-center">
            <p className="text-slate-500 mb-1">貢献度</p>
            <p className="font-bold text-slate-900 text-lg">{profile?.contributionScore || 0}</p>
          </div>
          <div className="text-center">
            <p className="text-slate-500 mb-1">レビュー</p>
            <p className="font-bold text-slate-900 text-lg">{reviews.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
        <h3 className="font-bold text-slate-900 mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2 text-indigo-500" />
          あなたの好みの傾向
        </h3>

        {loading ? (
          <div className="py-12 flex justify-center text-indigo-600">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm mb-4">まだレビューがありません。<br />記録を投稿するとあなたの好みの傾向がここにグラフで表示されます。</p>
            <Link
              to="/explore"
              className="inline-flex items-center text-xs text-indigo-600 font-medium hover:underline"
            >
              <PenTool className="w-3.5 h-3.5 mr-1" />
              日本酒を探してレビューする
            </Link>
          </div>
        ) : (
          <div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Taste" dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-slate-500 text-center mt-2 leading-relaxed">
              {reviews.length}件のレビューからあなたの味覚傾向を集計しています。
            </p>
          </div>
        )}
      </div>
      <div className="h-4">
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
    </div>
  );
}
