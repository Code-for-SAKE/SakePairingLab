import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Search,
  Check,
  Zap,
  Loader2,
  FlaskRound,
  Utensils,
  Thermometer,
  GlassWater,
  Sparkles,
  X,
} from 'lucide-react';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { app, db, getRandomDocuments } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Review, Sake } from '../types';
import { generateQueryEmbedding, generateRecommendQuest } from '../lib/gemini';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { findVoidVectorsPure } from '../lib/calc';

const TEMPERATURE_OPTIONS = [
  '指定なし',
  '雪冷え (5℃)',
  '花冷え (10℃)',
  '涼冷え (15℃)',
  '常温 (20℃)',
  'ぬる燗 (40℃)',
  '上燗 (45℃)',
  '熱燗 (50℃)',
  '飛び切り燗 (55℃〜)',
];

const VESSEL_PRESETS = ['ワイングラス', '平盃', 'お猪口', '薄張りグラス', '陶器', '木枡'];
const PAIRING_PRESETS = [
  '白身魚の刺身',
  '和牛ステーキ',
  'ハードチーズ',
  'うなぎの蒲焼き',
  '焼き鳥（タレ）',
  '塩辛',
];

export default function NewQuest() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sakes, setSakes] = useState<Sake[]>([]);
  const [loadingSakes, setLoadingSakes] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSake, setSelectedSake] = useState<Sake | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetTemperature, setTargetTemperature] = useState('指定なし');
  const [targetVessel, setTargetVessel] = useState('');
  const [targetPairing, setTargetPairing] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recommending, setRecommending] = useState(false);

  useEffect(() => {
    const fetchSakes = async () => {
      try {
        setLoadingSakes(true);
        const snap = await getDocs(collection(db, 'sakes'));
        const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Sake);
        setSakes(list);
      } catch (err) {
        console.error('Error fetching sakes:', err);
      } finally {
        setLoadingSakes(false);
      }
    };
    fetchSakes();
  }, []);

  const handleSelectSake = (sake: Sake) => {
    setSelectedSake(sake);
    if (!title || title.startsWith('【')) {
      setTitle(`【${sake.brand}】未知のペアリングを探せ`);
    }
  };

  const handleClearSake = () => {
    setSelectedSake(null);
  };

  const handlePairingChange = (val: string) => {
    setTargetPairing(val);
    if (val.trim() && (!title || title.startsWith('【'))) {
      if (!selectedSake) {
        setTitle(`【${val.trim()}】に合う最高の日本酒を探せ`);
      }
    }
  };

  const handleTemperatureChange = (val: string) => {
    setTargetTemperature(val);
    if (
      val !== '指定なし' &&
      (!title || title.startsWith('【')) &&
      !selectedSake &&
      !targetPairing.trim()
    ) {
      setTitle(`【${val}】で開花するペアリングを探せ`);
    }
  };

  const filteredSakes = sakes.filter(
    (s) =>
      s.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.brewery.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.bottle.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ポイントの自動計算（ユーザー指定不可）
  const calculatePoints = () => {
    let pts = 50;
    if (selectedSake) pts += 25;
    if (targetTemperature && targetTemperature !== '指定なし') pts += 25;
    if (targetVessel.trim()) pts += 25;
    if (targetPairing.trim()) pts += 25;
    return pts;
  };

  const rewardPoints = calculatePoints();

  const handleRecommend = async () => {
    setRecommending(true);
    try {
      const reviews = await getRandomDocuments<Review>('reviews', 5, 2);
      const reviewEmbeddings: number[][] = [];
      reviews.map((review) => {
        if (review.embedding) {
          // 前半1024次元が、日本酒、温度、酒器、おつまみの情報
          reviewEmbeddings.push(review.embedding?.toArray().slice(0, 1024));
        }
      });
      if (reviewEmbeddings.length < 0) {
        throw new Error('ランダムレビューが見つかりませんでした。');
      }
      const start = performance.now();
      // 3箇所の空洞を、100回ループで計算
      const voids = findVoidVectorsPure(reviewEmbeddings, 1, 100, 0.02);
      const end = performance.now();

      console.log(`空洞計算時間: ${(end - start).toFixed(2)} ms`);

      // Try Cloud Function vector search first
      const functions = getFunctions(app);
      const searchByVector = httpsCallable<
        { queryVector: number[]; limit?: number },
        { success: boolean; results: Sake[] }
      >(functions, 'searchSakesByVector');

      if (voids.length == 0) {
        throw new Error('おすすめ空洞範囲が見つかりませんでした。');
      }
      // 空洞にあたるレビュー条件を出力
      const recommend = await generateRecommendQuest(voids[0], {
        sakeCharacter: selectedSake?.brand
          ? `銘柄: ${selectedSake?.brand} `
          : '' + selectedSake?.bottle
            ? `ボトリング: ${selectedSake?.bottle} `
            : '',
        targetTemperature: targetTemperature === '指定なし' ? undefined : targetTemperature,
        targetPairing: targetPairing.trim() || undefined,
        targetVessel: targetVessel.trim() || undefined,
      });
      console.log(recommend);
      if (!recommend) {
        throw new Error('おすすめ候補が見つかりませんでした。');
      }
      debugger;
      //日本酒のおすすめを設定
      if (!selectedSake && recommend.sakeCharacter) {
        const vector = await generateQueryEmbedding(recommend.sakeCharacter, 1024);
        const res = await searchByVector({ queryVector: vector, limit: 1 });
        console.log(res.data);
        const sakes = res.data.results;
        setSelectedSake(sakes.length == 0 ? null : sakes[0]);
      }
      if (targetTemperature === '指定なし' && recommend.targetTemperature)
        setTargetTemperature(recommend.targetTemperature);
      if (!targetPairing && recommend.targetPairing) setTargetPairing(recommend.targetPairing);
      if (!targetVessel && recommend.targetVessel) setTargetVessel(recommend.targetVessel);

      setTitle(recommend.title ?? '');
      setDescription(recommend.recommendComment ?? '');
    } catch (err: any) {
      console.error('Error recommending quest conditions:', err);
      alert(err.message || 'おすすめの取得に失敗しました。');
    } finally {
      setRecommending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('ログインが必要です。');
      return;
    }
    if (!title.trim()) {
      alert('クエストタイトルを入力してください。');
      return;
    }

    setSubmitting(true);
    try {
      const questData: Record<string, any> = {
        title: title.trim(),
        status: 'open',
        rewardPoints,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      };

      if (selectedSake) {
        questData.sakeId = selectedSake.id;
        questData.sakeBrand = selectedSake.brand;
        questData.sakeBottle = selectedSake.bottle;
      }
      if (description.trim()) {
        questData.description = description.trim();
      }
      if (targetTemperature && targetTemperature !== '指定なし') {
        questData.targetTemperature = targetTemperature;
      }
      if (targetVessel.trim()) {
        questData.targetVessel = targetVessel.trim();
      }
      if (targetPairing.trim()) {
        questData.targetPairing = targetPairing.trim();
      }

      await addDoc(collection(db, 'quests'), questData);
      navigate('/quests');
    } catch (err: any) {
      console.error('Error creating quest:', err);
      alert(`クエストの作成に失敗しました: ${err.message || 'エラーが発生しました'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto pt-6 px-4 pb-20">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center font-bold text-slate-900 text-lg">新規クエスト作成</h1>
        <div className="w-9" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 固定条件設定 (すべて任意) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-5">
          <div>
            <h2 className="font-bold text-slate-900 text-base">固定する条件を設定（任意）</h2>
            <p className="text-xs text-slate-500 mt-1">
              日本酒・おつまみ・温度・酒器など、指定したい要素を自由に固定できます。固定した条件が多いほど獲得ポイントが上がります！
            </p>
            <button
              type="button"
              onClick={handleRecommend}
              disabled={recommending}
              className="mt-3 w-full bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {recommending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {recommending ? 'レビューを分析中...' : '未開拓のペアリングをおすすめ'}
            </button>
          </div>

          {/* 1. おつまみ・ペアリング固定 */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center text-sm font-bold text-slate-800 mb-1.5">
              <Utensils className="w-4 h-4 text-rose-500 mr-1.5" />
              固定するおつまみ・料理 (任意)
            </label>
            <input
              type="text"
              value={targetPairing}
              onChange={(e) => handlePairingChange(e.target.value)}
              placeholder="例：白身魚の刺身、チーズ、うなぎの蒲焼き"
              maxLength={200}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {PAIRING_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePairingChange(preset)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors border ${
                    targetPairing === preset
                      ? 'bg-rose-600 text-white border-rose-600 font-medium'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* 2. 日本酒の固定 (任意) */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <label className="flex items-center text-sm font-bold text-slate-800">
              <FlaskRound className="w-4 h-4 text-indigo-600 mr-1.5" />
              固定する日本酒 (任意)
            </label>

            {selectedSake ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-600 font-semibold">{selectedSake.brewery}</p>
                  <p className="font-bold text-slate-900 text-base">
                    {selectedSake.brand}{' '}
                    <span className="text-sm font-normal text-slate-600">
                      {selectedSake.bottle}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearSake}
                  className="text-xs bg-white text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 font-medium flex items-center"
                >
                  <X className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  解除（指定なし）
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="特定銘柄を指定する場合はここで検索..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {searchQuery &&
                  (loadingSakes ? (
                    <div className="flex items-center justify-center py-4 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin mr-2 text-indigo-600" />
                      <span className="text-xs">日本酒データを読み込み中...</span>
                    </div>
                  ) : filteredSakes.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-xs">
                      該当する日本酒が見つかりません
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 rounded-xl p-2 bg-slate-50">
                      {filteredSakes.map((sake) => (
                        <button
                          key={sake.id}
                          type="button"
                          onClick={() => handleSelectSake(sake)}
                          className="w-full text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <p className="font-bold text-slate-900 text-xs">
                              {sake.brand}{' '}
                              <span className="font-normal text-slate-500">{sake.bottle}</span>
                            </p>
                            <p className="text-[10px] text-slate-400">{sake.brewery}</p>
                          </div>
                          <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded">
                            選択
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                {!selectedSake && !searchQuery && (
                  <p className="text-xs text-slate-400 pl-1">
                    ※日本酒を指定しない場合、挑戦者はどの日本酒でも自由にお試しできます。
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 3. 温度の固定 (任意) */}
          <div className="pt-4 border-t border-slate-100">
            <label className="flex items-center text-sm font-bold text-slate-800 mb-1.5">
              <Thermometer className="w-4 h-4 text-amber-500 mr-1.5" />
              固定する温度帯 (任意)
            </label>
            <select
              value={targetTemperature}
              onChange={(e) => handleTemperatureChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TEMPERATURE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* 4. 酒器の固定 (任意) */}
          <div className="pt-4 border-t border-slate-100">
            <label className="flex items-center text-sm font-bold text-slate-800 mb-1.5">
              <GlassWater className="w-4 h-4 text-teal-600 mr-1.5" />
              固定する酒器 (任意)
            </label>
            <input
              type="text"
              value={targetVessel}
              onChange={(e) => setTargetVessel(e.target.value)}
              placeholder="例：ワイングラス、平盃、木枡"
              maxLength={100}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {VESSEL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetVessel(preset)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors border ${
                    targetVessel === preset
                      ? 'bg-teal-600 text-white border-teal-600 font-medium'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* クエスト情報 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900 text-base">クエスト詳細</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              クエストタイトル <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：【塩辛】に最高に合う日本酒を探せ"
              maxLength={100}
              required
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              クエスト説明・コメント（任意）
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="挑戦者に伝えたいペアリングの背景や魅力を記述してください。"
              maxLength={500}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* 報酬ポイントの自動提示（ユーザー変更不可） */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mr-3">
              <Zap className="w-5 h-5 fill-amber-500" />
            </div>
            <div>
              <p className="text-xs text-amber-800 font-medium">獲得報酬ポイント (自動算出)</p>
              <p className="text-xs text-amber-600">固定条件数に応じて自動設定されます</p>
            </div>
          </div>
          <div className="text-xl font-extrabold text-amber-600 bg-white px-3 py-1.5 rounded-xl border border-amber-200 shadow-xs">
            {rewardPoints} <span className="text-xs font-bold text-amber-500">pt</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-sm"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span>作成中...</span>
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              <span>クエストを公開する</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
