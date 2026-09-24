import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Award,
  Settings,
  TrendingUp,
  Loader2,
  PenTool,
  LogOut,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { where, orderBy } from 'firebase/firestore';
import { Review } from '../types';
import { Link } from 'react-router-dom';
import FirestorePager from '../lib/firestorepager';
import { enrichReviews } from '../lib/review';
import { ReviewCard } from '../components/ReviewCard';
import LoadMoreTrigger from '../components/LoadMoreTrigger';
import { generateUserTasteAnalysis } from '../lib/gemini';

const TASTE_CATEGORIES = ['フルーティ', 'スッキリ・軽快', '熟成', 'ふくよか・旨味', '酸味', '甘味'];

export default function MyPage() {
  const { user, profile, signInWithGoogle, logout } = useAuth();
  const pager = useMemo(
    () => new FirestorePager<Review>('reviews', orderBy('createdAt', 'desc'), 5),
    [user?.uid],
  );
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // AI文章分析用のState
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState('');
  const [analysisError, setAnalysisError] = useState('');

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
        const enrichedReviews = await enrichReviews(myReviews, { withSake: true });
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
    const review = await pager.loadNext();
    const enrichedReviews = await enrichReviews(review, { withSake: true });
    setReviews((prev) => [...prev, ...enrichedReviews]);
    setLoadingMore(false);
  };

  // --- 💡 日本酒ごとにレビューをグループ化し、世間平均評価との差分ベクトルを計算 ---
  const tasteBiasAnalysis = useMemo(() => {
    if (reviews.length === 0)
      return { chartData: [], topDeviations: [], summary: '', userPreferenceVector: [] };

    // 1. 日本酒ごとにユーザーのレビューをグループ化
    const sakeReviewMap = new Map<
      string,
      {
        sakeId: string;
        sake?: any;
        reviews: Review[];
        userVector?: number[];
        baseVector?: number[];
        diffVector?: number[];
      }
    >();
    reviews.forEach((r) => {
      const key = r.sakeId || r.sake?.brand || 'unknown';
      let group = sakeReviewMap.get(key);
      if (!group) {
        group = { sakeId: key, sake: r.sake, reviews: [] };
        sakeReviewMap.set(key, group);
      }
      group.reviews.push(r);
    });

    // ベクトル変換ヘルパー
    const extractVector = (embedding: any): number[] | null => {
      if (!embedding) return null;
      if (Array.isArray(embedding)) return embedding;
      if (typeof embedding.toArray === 'function') return embedding.toArray();
      if (Array.isArray(embedding.values)) return embedding.values;
      return null;
    };

    // 2. 日本酒ごとのレビュー r.embedding の平均を計算して userReviewsForSake.userVector に格納
    sakeReviewMap.forEach((userReviewsForSake) => {
      const validEmbeddings: number[][] = [];
      userReviewsForSake.reviews.forEach((r) => {
        const vec = extractVector(r.embedding);
        if (vec && vec.length > 0) {
          validEmbeddings.push(vec);
        }
      });

      if (validEmbeddings.length > 0) {
        const dim = validEmbeddings[0].length;
        const sumVec = new Array(dim).fill(0);
        validEmbeddings.forEach((v) => {
          for (let i = 0; i < dim; i++) {
            sumVec[i] += v[i];
          }
        });
        // r.embedding の平均を userVector に格納
        userReviewsForSake.userVector = sumVec.map((val) => val / validEmbeddings.length);
      }

      // 日本酒自体のベースベクトルを抽出
      if (userReviewsForSake.sake?.embedding) {
        userReviewsForSake.baseVector =
          extractVector(userReviewsForSake.sake.embedding) ?? undefined;
      }

      // userVector と baseVector の差分ベクトル diffVector を計算
      if (
        userReviewsForSake.userVector &&
        userReviewsForSake.baseVector &&
        userReviewsForSake.userVector.length === userReviewsForSake.baseVector.length
      ) {
        userReviewsForSake.diffVector = userReviewsForSake.userVector.map(
          (val, idx) => val - userReviewsForSake.baseVector![idx],
        );
      }
    });

    // 💡 【ユーザー志向ベクトルの作成】sakeReviewMap の全 diffVector を平均化
    const validDiffVectors: number[][] = [];
    sakeReviewMap.forEach((userReviewsForSake) => {
      if (userReviewsForSake.diffVector && userReviewsForSake.diffVector.length > 0) {
        validDiffVectors.push(userReviewsForSake.diffVector);
      }
    });

    let userPreferenceVector: number[] = [];
    if (validDiffVectors.length > 0) {
      const dim = validDiffVectors[0].length;
      const sumDiff = new Array(dim).fill(0);
      validDiffVectors.forEach((diff) => {
        for (let i = 0; i < dim; i++) {
          sumDiff[i] += diff[i];
        }
      });
      userPreferenceVector = sumDiff.map((val) => val / validDiffVectors.length);
    }

    // 3. 日本酒ごとのユーザーの評価平均ベクトルをもとにカテゴリー偏りを計算
    const sakeDeviations: { [cat: string]: number[] } = {};
    TASTE_CATEGORIES.forEach((cat) => (sakeDeviations[cat] = []));

    sakeReviewMap.forEach((userReviewsForSake) => {
      const userCounts: { [cat: string]: number } = {};
      TASTE_CATEGORIES.forEach((cat) => (userCounts[cat] = 0));

      userReviewsForSake.reviews.forEach((r) => {
        const words = [...(r.aroma?.broads || []), ...(r.taste?.broads || [])];
        words.forEach((b) => {
          if (b === 'スッキリ') userCounts['スッキリ・軽快'] += 1;
          else if (b === 'ふくよか') userCounts['ふくよか・旨味'] += 1;
          else if (userCounts[b] !== undefined) userCounts[b] += 1;
        });
      });

      // レビュー件数で正規化
      const totalWords = Object.values(userCounts).reduce((a, b) => a + b, 0) || 1;
      const userProfileForSake: { [cat: string]: number } = {};
      TASTE_CATEGORIES.forEach((cat) => {
        userProfileForSake[cat] = userCounts[cat] / totalWords;
      });

      // 世間一般の基準 (均等ベースライン 1/6 ≈ 0.167)
      const baseStandard = 1 / TASTE_CATEGORIES.length;

      // 差分ベクトル ΔV_sake = UserProfile - BaseStandard
      TASTE_CATEGORIES.forEach((cat) => {
        const delta = userProfileForSake[cat] - baseStandard;
        sakeDeviations[cat].push(delta);
      });
    });

    // 3. 全評価銘柄での平均差分ベクトル（ユーザー固有の感覚・好みの偏り）を求める
    const meanDeviations: { [cat: string]: number } = {};
    const sakeCount = sakeReviewMap.size;

    TASTE_CATEGORIES.forEach((cat) => {
      const deltas = sakeDeviations[cat];
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1);
      meanDeviations[cat] = avgDelta;
    });

    // 4. RadarChart 用データセットの構築（世間一般基準=50、ユーザー=50 + 偏り）
    const chartData = TASTE_CATEGORIES.map((cat) => {
      const delta = meanDeviations[cat] || 0;
      // 差分を 0 ~ 100 スケールにマッピング (+0.3の偏りで80, -0.3の偏りで20)
      const userScore = Math.max(10, Math.min(90, Math.round(50 + delta * 120)));
      return {
        subject: cat,
        世間一般: 50,
        あなたの感度: userScore,
        rawDelta: delta,
      };
    });

    // 5. 偏差が大きい項目の抽出
    const sortedDevs = TASTE_CATEGORIES.map((cat) => ({
      category: cat,
      deviationScore: (meanDeviations[cat] || 0) * 100,
      description:
        meanDeviations[cat] > 0.05
          ? '一般評価より強く感じ取りやすい・好む'
          : meanDeviations[cat] < -0.05
            ? '一般評価より控えめに感じやすい'
            : '一般平均と同等の感受性',
    })).sort((a, b) => Math.abs(b.deviationScore) - Math.abs(a.deviationScore));

    const topDevs = sortedDevs.slice(0, 3);
    const summary = topDevs
      .map(
        (d) =>
          `${d.category}: 世間平均に対し ${d.deviationScore > 0 ? '+' : ''}${d.deviationScore.toFixed(1)}pt の偏差`,
      )
      .join(' / ');

    return { chartData, topDeviations: topDevs, summary, userPreferenceVector };
  }, [reviews]);

  // --- AI文章解説の実行 ---
  const handleAnalyzeTasteWithGemini = async () => {
    if (reviews.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisError('');

    try {
      const sampleComments = reviews
        .filter((r) => r.comment && r.comment.trim().length > 0)
        .slice(0, 5)
        .map((r) => `・${r.sake?.brand || '日本酒'}: ${r.comment}`);

      const comment = await generateUserTasteAnalysis({
        userName: profile?.displayName || 'ユーザー',
        reviewCount: reviews.length,
        userPreferenceVector: tasteBiasAnalysis.userPreferenceVector,
        sampleReviews: sampleComments,
      });

      setAiAnalysisResult(comment);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || 'Geminiによる味覚分析に失敗しました。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto pt-16 px-4 text-center">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 mb-2">ログインしていません</h2>
          <p className="text-slate-500 text-sm mb-6">
            ログインするとテイスティング記録や好みの分析を確認できます。
          </p>
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
            <span className="text-2xl font-bold text-indigo-700">
              {profile?.displayName?.[0] || '名'}
            </span>
          )}
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">
          {profile?.displayName || 'ユーザー'}
        </h2>
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

      {/* --- 世間基準からのベクトル差分に基づく味覚感度・好みの傾向チャート --- */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-900 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-indigo-500" />
            あなたの味覚・感度の偏り（世間基準との差分）
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          投稿した日本酒ごとの感想と、世間一般の平均評価ベクトルとの差分を集計・平均化し、あなたが感じ取りやすい特徴や好みの偏りを炙り出しています。
        </p>

        {loading ? (
          <div className="py-12 flex justify-center text-indigo-600">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-sm mb-4">
              まだレビューがありません。
              <br />
              記録を投稿すると、あなた固有の感じ方や好みの偏りがここにグラフ化されます。
            </p>
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
                <RadarChart cx="50%" cy="50%" outerRadius="68%" data={tasteBiasAnalysis.chartData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: '#475569', fontSize: 11, fontWeight: 'bold' }}
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />

                  {/* 世間一般基準 (50) */}
                  <Radar
                    name="世間一般基準"
                    dataKey="世間一般"
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    fill="#cbd5e1"
                    fillOpacity={0.2}
                  />
                  {/* あなたの感度・好みの偏差 */}
                  <Radar
                    name="あなたの感度・偏り"
                    dataKey="あなたの感度"
                    stroke="#6366f1"
                    fill="#818cf8"
                    fillOpacity={0.5}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <p className="text-xs text-slate-500 text-center mt-1 leading-relaxed">
              {reviews.length}件のレビューの差分平均ベクトルから算出（中心の破線=世間平均基準）
            </p>

            {/* --- Gemini AI による文章解説機能 --- */}
            <div className="mt-5 pt-4 border-t border-slate-100">
              {!aiAnalysisResult && !isAnalyzing && (
                <button
                  onClick={handleAnalyzeTasteWithGemini}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  <Sparkles className="w-4 h-4 text-purple-200" />
                  <span>✨ Geminiで「あなたの味覚・好みの癖」を文章解説</span>
                </button>
              )}

              {isAnalyzing && (
                <div className="flex items-center justify-center space-x-2 py-4 text-xs text-indigo-600 font-medium animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                  <span>差分ベクトルとコメントからあなたの味覚傾向をAI分析中...</span>
                </div>
              )}

              {analysisError && (
                <div className="text-xs text-rose-500 bg-rose-50 p-3 rounded-xl border border-rose-100 mt-2">
                  {analysisError}
                </div>
              )}

              {aiAnalysisResult && (
                <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl shadow-inner border border-purple-900/50 space-y-2 text-xs leading-relaxed">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="font-bold text-purple-300 flex items-center space-x-1 text-sm">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <span>🤖 AI味覚・好み分析レポート</span>
                    </span>
                    <button
                      onClick={handleAnalyzeTasteWithGemini}
                      className="text-[11px] text-slate-400 hover:text-white flex items-center space-x-1 underline"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>再生成</span>
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap text-slate-300 leading-relaxed pt-1">
                    {aiAnalysisResult}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-slate-900 flex items-center text-sm">
          <PenTool className="w-4 h-4 mr-1.5 text-indigo-500" />
          あなたのレビュー履歴
        </h3>
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
