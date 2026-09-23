import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Frown,
  Smile,
  Sparkles,
  Lock,
  Loader2,
} from 'lucide-react';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Review } from '../types';
import { generateTasteComment, hasUserApiKey } from '../lib/gemini';
import clsx from 'clsx';

const AROMA_TREE = {
  フルーティ: ['リンゴ', '洋梨', 'メロン', 'バナナ', '白桃', 'マスカット', 'ライチ'],
  フローラル: ['白木蓮', '菩提樹', 'バラ', 'アカシア'],
  'ハーブ・スパイス': ['ミント', '杉', 'ヒノキ', 'シナモン', 'クローブ'],
  '穀物・乳製品': ['炊きたてのご飯', 'つきたての餅', 'ヨーグルト', 'バター', 'チーズ'],
  熟成: ['ハチミツ', 'カラメル', 'ドライフルーツ', 'ナッツ', '醤油'],
};

const TASTE_TREE = {
  'スッキリ・軽快': ['キレが良い', 'みずみずしい', '淡麗', 'シャープ'],
  'ふくよか・旨味': ['米の旨味', 'まろやか', 'ジューシー', 'ふっくら'],
  甘味: ['優しい甘み', '和三盆', '濃醇な甘み'],
  酸味: ['爽やかな酸', '乳酸', 'シャープな酸'],
  '苦味・渋味': ['心地よい苦味', '複雑味', '余韻が長い'],
};

export default function NewReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const questData = location.state as {
    questId?: string;
    targetTemperature?: string;
    targetPairing?: string;
    targetVessel?: string;
  } | null;
  const hasApiKey = hasUserApiKey();

  const [step, setStep] = useState(1); // 1: Aroma, 2: Taste, 3: Pairing & Post

  const [aromaBroads, setAromaBroads] = useState<string[]>([]);
  const [aromaSpecific, setAromaSpecific] = useState<string[]>([]);
  const [aromaCustom, setAromaCustom] = useState('');
  const [generatingAroma, setGeneratingAroma] = useState(false);

  const [tasteBroads, setTasteBroads] = useState<string[]>([]);
  const [tasteSpecific, setTasteSpecific] = useState<string[]>([]);
  const [tasteCustom, setTasteCustom] = useState('');
  const [generatingTaste, setGeneratingTaste] = useState(false);

  const [temperature, setTemperature] = useState('常温 (20℃)');
  const [vessel, setVessel] = useState('お猪口');
  const [pairing, setPairing] = useState('');
  const [comment, setComment] = useState('');

  // ユーザーの最新最大30件の投稿コメントを取得する（orderBy + limit を使用）
  const fetchUserRecentComments = async (): Promise<string[]> => {
    if (!user) return [];
    try {
      // 複合インデックス (userId ASC, createdAt DESC) を使ってサーバー側で最新30件に絞り込み
      const q = query(
        collection(db, 'reviews'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(30),
      );
      const snap = await getDocs(q);
      const pastComments: string[] = [];
      snap.docs.forEach((doc) => {
        const data = doc.data() as Review;
        if (data.comment && data.comment.trim()) {
          pastComments.push(data.comment.trim());
        }
      });
      return pastComments;
    } catch (err: any) {
      console.warn(
        'Firestore query with orderBy failed (composite index might be building), falling back to client sort:',
        err,
      );
      // インデックス未作成・構築中の場合の安全なフォールバック
      try {
        const fallbackQuery = query(collection(db, 'reviews'), where('userId', '==', user.uid));
        const snap = await getDocs(fallbackQuery);
        const userReviews = snap.docs.map((doc) => doc.data() as Review);
        userReviews.sort((a, b) => {
          const timeA = a.createdAt?.toMillis
            ? a.createdAt.toMillis()
            : a.createdAt
              ? new Date(a.createdAt).getTime()
              : 0;
          const timeB = b.createdAt?.toMillis
            ? b.createdAt.toMillis()
            : b.createdAt
              ? new Date(b.createdAt).getTime()
              : 0;
          return timeB - timeA;
        });

        const comments: string[] = [];
        for (const r of userReviews) {
          if (r.comment && r.comment.trim()) {
            comments.push(r.comment.trim());
          }
          if (comments.length >= 30) break;
        }
        return comments;
      } catch (fallbackErr) {
        console.error('Failed to fetch user past comments:', fallbackErr);
        return [];
      }
    }
  };

  const handleGenerateAromaAI = async () => {
    debugger;
    const selectedWords = [...aromaBroads, ...aromaSpecific];
    if (selectedWords.length === 0) {
      alert('上の選択肢から香りのキーワードを1つ以上選択してください。');
      return;
    }
    setGeneratingAroma(true);
    try {
      const pastComments = await fetchUserRecentComments();
      const generated = await generateTasteComment({
        type: '香りの印象',
        selectedWords,
        pastComments,
      });
      setAromaCustom(generated);
    } catch (err: any) {
      console.error(err);
      alert(`コメント生成に失敗しました: ${err.message || 'エラーが発生しました'}`);
    } finally {
      setGeneratingAroma(false);
    }
  };

  const handleGenerateTasteAI = async () => {
    const selectedWords = [...tasteBroads, ...tasteSpecific];
    if (selectedWords.length === 0) {
      alert('上の選択肢から味わいのキーワードを1つ以上選択してください。');
      return;
    }
    setGeneratingTaste(true);
    try {
      const pastComments = await fetchUserRecentComments();
      const generated = await generateTasteComment({
        type: '味わいの印象',
        selectedWords,
        pastComments,
      });
      setTasteCustom(generated);
    } catch (err: any) {
      console.error(err);
      alert(`コメント生成に失敗しました: ${err.message || 'エラーが発生しました'}`);
    } finally {
      setGeneratingTaste(false);
    }
  };

  useEffect(() => {
    if (questData) {
      if (questData.targetTemperature) setTemperature(questData.targetTemperature);
      if (questData.targetVessel) setVessel(questData.targetVessel);
      if (questData.targetPairing) setPairing(questData.targetPairing);
    }
  }, [questData]);

  const handleSubmit = async (rating: number) => {
    if (!user) {
      alert('ログインが必要です。');
      return;
    }
    if (!id) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        sakeId: id,
        userId: user.uid,
        rating,
        aroma: {
          broads: aromaBroads,
          specific: aromaSpecific,
          ...(aromaCustom.trim() ? { custom: aromaCustom.trim() } : {}),
        },
        taste: {
          broads: tasteBroads,
          specific: tasteSpecific,
          ...(tasteCustom.trim() ? { custom: tasteCustom.trim() } : {}),
        },
        temperature,
        vessel,
        pairing,
        comment,
        createdAt: serverTimestamp(),
        likesCount: 0,
        ...(questData?.questId ? { questId: questData.questId } : {}),
      });
      navigate('/');
    } catch (e: any) {
      console.error('Firestore Add Error:', e);
      alert(`エラーが発生しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleSpecific = (val: string, current: string[], setter: any) => {
    if (current.includes(val)) {
      setter(current.filter((c) => c !== val));
    } else {
      setter([...current, val]);
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
        <div className="flex-1 text-center font-bold text-slate-900">
          {questData?.questId ? 'クエスト挑戦' : 'テイスティング記録'}
        </div>
        <div className="w-9" />
      </div>

      {/* Progress */}
      <div className="flex space-x-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={clsx(
              'h-1 flex-1 rounded-full',
              s <= step ? 'bg-indigo-600' : 'bg-slate-200',
            )}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
          <h2 className="text-xl font-bold text-slate-900">香りの印象は？</h2>
          <div className="grid grid-cols-2 gap-3">
            {Object.keys(AROMA_TREE).map((broad) => (
              <button
                key={broad}
                onClick={() => toggleSpecific(broad, aromaBroads, setAromaBroads)}
                className={clsx(
                  'p-4 rounded-xl text-left border-2 transition-all font-medium flex items-center justify-between',
                  aromaBroads.includes(broad)
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200',
                )}
              >
                {broad}
                {aromaBroads.includes(broad) && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>

          {aromaBroads.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-3">
                さらに具体的に（複数選択可）
              </p>
              <div className="flex flex-wrap gap-2">
                {aromaBroads
                  .flatMap((broad) => (AROMA_TREE as any)[broad])
                  .map((specific: string) => {
                    const isSelected = aromaSpecific.includes(specific);
                    return (
                      <button
                        key={specific}
                        onClick={() => toggleSpecific(specific, aromaSpecific, setAromaSpecific)}
                        className={clsx(
                          'px-4 py-2 rounded-full text-sm font-medium border transition-colors flex items-center',
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 mr-1" />}
                        {specific}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                自由入力（その他感じた香りやニュアンス）
              </label>
              <button
                type="button"
                onClick={handleGenerateAromaAI}
                disabled={
                  !hasApiKey ||
                  generatingAroma ||
                  (aromaBroads.length === 0 && aromaSpecific.length === 0)
                }
                className={clsx(
                  'flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-all border shadow-xs',
                  generatingAroma
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : !hasApiKey || (aromaBroads.length === 0 && aromaSpecific.length === 0)
                      ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 active:scale-95 cursor-pointer',
                )}
                title={
                  hasApiKey
                    ? '選択したワードと過去の投稿から50文字程度のコメントを作成します'
                    : 'マイページからAPIキーを設定すると利用できます。'
                }
              >
                {generatingAroma ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 text-indigo-600" />
                    <span>生成中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>AIサポート</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              rows={3}
              value={aromaCustom}
              onChange={(e) => setAromaCustom(e.target.value)}
              placeholder="例：青リンゴの皮、マスカット、わずかなスモーキー感 など"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400 text-sm"
              maxLength={100}
            />
            <p className="text-xs text-slate-400 mt-1.5 flex items-center">
              💡 選択ワードと過去の投稿コメント（最新30件）を元にAIが約50文字で作成します
            </p>
          </div>

          <div className="pt-6">
            <button
              disabled={aromaBroads.length === 0 && !aromaCustom.trim()}
              onClick={() => setStep(2)}
              className="w-full bg-slate-900 text-white py-4 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
            >
              次へ <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
          <h2 className="text-xl font-bold text-slate-900">味わいの印象は？</h2>
          <div className="grid grid-cols-2 gap-3">
            {Object.keys(TASTE_TREE).map((broad) => (
              <button
                key={broad}
                onClick={() => toggleSpecific(broad, tasteBroads, setTasteBroads)}
                className={clsx(
                  'p-4 rounded-xl text-left border-2 transition-all font-medium flex items-center justify-between',
                  tasteBroads.includes(broad)
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200',
                )}
              >
                {broad}
                {tasteBroads.includes(broad) && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>

          {tasteBroads.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <p className="text-sm font-medium text-slate-500 mb-3">
                さらに具体的に（複数選択可）
              </p>
              <div className="flex flex-wrap gap-2">
                {tasteBroads
                  .flatMap((broad) => (TASTE_TREE as any)[broad])
                  .map((specific: string) => {
                    const isSelected = tasteSpecific.includes(specific);
                    return (
                      <button
                        key={specific}
                        onClick={() => toggleSpecific(specific, tasteSpecific, setTasteSpecific)}
                        className={clsx(
                          'px-4 py-2 rounded-full text-sm font-medium border transition-colors flex items-center',
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 mr-1" />}
                        {specific}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                自由入力（その他感じた味わいやニュアンス）
              </label>
              <button
                type="button"
                onClick={handleGenerateTasteAI}
                disabled={
                  !hasApiKey ||
                  generatingTaste ||
                  (tasteBroads.length === 0 && tasteSpecific.length === 0)
                }
                className={clsx(
                  'flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-all border shadow-xs',
                  generatingTaste
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : !hasApiKey || (tasteBroads.length === 0 && tasteSpecific.length === 0)
                      ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 active:scale-95 cursor-pointer',
                )}
                title={
                  hasApiKey
                    ? '選択したワードと過去の投稿から50文字程度のコメントを作成します'
                    : 'マイページからAPIキーを設定すると利用できます。'
                }
              >
                {generatingTaste ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 text-emerald-600" />
                    <span>生成中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>AIサポート</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              rows={3}
              value={tasteCustom}
              onChange={(e) => setTasteCustom(e.target.value)}
              placeholder="例：レモンのような引き締まった酸、後味のやわらかな甘み など"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 placeholder:text-slate-400 text-sm"
              maxLength={100}
            />
            <p className="text-xs text-slate-400 mt-1.5 flex items-center">
              💡 選択ワードと過去の投稿コメント（最新30件）を元にAIが約50文字で作成します
            </p>
          </div>

          <div className="pt-6 flex space-x-3">
            <button
              onClick={() => setStep(1)}
              className="px-6 bg-slate-100 text-slate-700 py-4 rounded-xl font-medium"
            >
              戻る
            </button>
            <button
              disabled={tasteBroads.length === 0 && !tasteCustom.trim()}
              onClick={() => setStep(3)}
              className="flex-1 bg-slate-900 text-white py-4 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
            >
              次へ <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
          <h2 className="text-xl font-bold text-slate-900">最高の飲み方を記録</h2>

          <div>
            <label className="flex items-center text-sm font-medium text-slate-700 mb-2">
              温度帯{' '}
              {questData?.targetTemperature && <Lock className="w-3 h-3 ml-1 text-slate-400" />}
            </label>
            <select
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              disabled={!!questData?.targetTemperature}
              className={clsx(
                'w-full border rounded-xl px-4 py-3 outline-none',
                questData?.targetTemperature
                  ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-white border-slate-200 focus:ring-2 focus:ring-indigo-500 text-slate-900',
              )}
            >
              <option>雪冷え (5℃)</option>
              <option>花冷え (10℃)</option>
              <option>涼冷え (15℃)</option>
              <option>常温 (20℃)</option>
              <option>日向燗 (30℃)</option>
              <option>人肌燗 (35℃)</option>
              <option>ぬる燗 (40℃)</option>
              <option>上燗 (45℃)</option>
              <option>熱燗 (50℃)</option>
              <option>飛び切り燗 (55℃〜)</option>
            </select>
          </div>

          <div>
            <label className="flex items-center text-sm font-medium text-slate-700 mb-2">
              酒器 {questData?.targetVessel && <Lock className="w-3 h-3 ml-1 text-slate-400" />}
            </label>
            <input
              type="text"
              value={vessel}
              onChange={(e) => setVessel(e.target.value)}
              readOnly={!!questData?.targetVessel}
              placeholder="例：ワイングラス、平盃、お猪口"
              className={clsx(
                'w-full border rounded-xl px-4 py-3 outline-none',
                questData?.targetVessel
                  ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-white border-slate-200 focus:ring-2 focus:ring-indigo-500 text-slate-900',
              )}
            />
          </div>

          <div>
            <label className="flex items-center text-sm font-medium text-slate-700 mb-2">
              ペアリングしたおつまみ・料理{' '}
              {questData?.targetPairing && <Lock className="w-3 h-3 ml-1 text-slate-400" />}
            </label>
            <input
              type="text"
              value={pairing}
              onChange={(e) => setPairing(e.target.value)}
              readOnly={!!questData?.targetPairing}
              placeholder="例：白身魚のカルパッチョ、塩辛"
              className={clsx(
                'w-full border rounded-xl px-4 py-3 outline-none',
                questData?.targetPairing
                  ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-white border-slate-200 focus:ring-2 focus:ring-indigo-500 text-slate-900',
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">コメント・感想</label>
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="味わいの変化や感動を共有しましょう！"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900"
            />
          </div>

          <div className="pt-6">
            <p className="text-sm font-medium text-slate-700 mb-3 text-center">
              この組み合わせはどうでしたか？
            </p>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => handleSubmit(1)}
                disabled={loading}
                className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-medium flex flex-col justify-center items-center hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                <Frown className="w-6 h-6 mb-1" />
                <span className="text-xs">悪い</span>
              </button>
              <button
                onClick={() => handleSubmit(3)}
                disabled={loading}
                className="flex-1 bg-indigo-50 text-indigo-600 py-4 rounded-xl font-medium flex flex-col justify-center items-center hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >
                <Smile className="w-6 h-6 mb-1" />
                <span className="text-xs">良い</span>
              </button>
              <button
                onClick={() => handleSubmit(5)}
                disabled={loading}
                className="flex-1 bg-rose-50 text-rose-600 py-4 rounded-xl font-medium flex flex-col justify-center items-center hover:bg-rose-100 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-6 h-6 mb-1" />
                <span className="text-xs">ピッタリ</span>
              </button>
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full bg-white border border-slate-200 text-slate-700 py-4 rounded-xl font-medium hover:bg-slate-50 transition-colors"
            >
              戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
