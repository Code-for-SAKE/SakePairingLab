import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Target, Award, Zap, Loader2, Plus, Search, X, FlaskRound } from 'lucide-react';
import { orderBy } from 'firebase/firestore';
import { app } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Quest, Sake } from '../types';
import LoadMoreTrigger from '../components/LoadMoreTrigger';
import FirestorePager from '../lib/firestorepager';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function QuestPage() {
  const pager = useMemo(() => new FirestorePager<Quest>('quests', orderBy('createdAt', 'desc'), 5), []);
  const sakePager = useMemo(() => new FirestorePager<Sake>('sakes', orderBy('createdAt', 'desc'), 5), []);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 日本酒自由クエストに挑戦する際のアクティブモーダル用
  const [activeQuestForSelect, setActiveQuestForSelect] = useState<Quest | null>(null);
  const [sakes, setSakes] = useState<Sake[]>([]);
  const [loadingSakes, setLoadingSakes] = useState(false);
  const [sakeSearchQuery, setSakeSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchQuests = async () => {
      try {
        setLoading(true);
        const list = await pager.loadFirst() || [];

        if (isMounted) {
          setQuests(list);
        }
      } catch (err) {
        console.error('Error fetching quests from Firestore:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchQuests();

    return () => {
      isMounted = false;
    };
  }, []);


  // Perform AI Vector Search when query changes (with debounce)
  useEffect(() => {
    const trimmed = sakeSearchQuery.trim();
    if (!trimmed) {
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {

      try {
        // Try Cloud Function vector search first
        const functions = getFunctions(app);
        const searchByVector = httpsCallable<
          { queryText: string; limit?: number },
          { success: boolean; results: Sake[] }
        >(functions, 'searchSakesByVector');

        const res = await searchByVector({ queryText: trimmed, limit: 5 });
        if (isMounted && res.data.results) {
          setSakes(res.data.results);
          return;
        }
      } catch (cfErr) {
        console.warn('Cloud Functions vector search unavailable, attempting client fallback...', cfErr);
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [sakeSearchQuery]);

  const handleStartChallenge = async (quest: Quest) => {
    if (quest.sakeId) {
      // 特定日本酒が固定されている場合
      navigate(`/sake/${quest.sakeId}/review`, {
        state: {
          questId: quest.id,
          targetTemperature: quest.targetTemperature,
          targetPairing: quest.targetPairing,
          targetVessel: quest.targetVessel,
        }
      });
    } else {
      // 日本酒が固定されていない場合、モーダルを開いて日本酒をロード
      setActiveQuestForSelect(quest);
      setSakeSearchQuery('');
      if (sakes.length === 0) {
        setLoadingSakes(true);
        try {
          const list = await sakePager.loadFirst();
          setSakes(list || []);
        } catch (err) {
          console.error('Error fetching sakes:', err);
        } finally {
          setLoadingSakes(false);
        }
      }
    }
  };

  const handleSelectSakeAndChallenge = (sake: Sake) => {
    if (!activeQuestForSelect) return;
    const quest = activeQuestForSelect;
    setActiveQuestForSelect(null);
    navigate(`/sake/${sake.id}/review`, {
      state: {
        questId: quest.id,
        targetTemperature: quest.targetTemperature,
        targetPairing: quest.targetPairing,
        targetVessel: quest.targetVessel,
      }
    });
  };

  const filteredSakes = sakes.filter(s => 
    s.brand.toLowerCase().includes(sakeSearchQuery.toLowerCase()) ||
    s.brewery.toLowerCase().includes(sakeSearchQuery.toLowerCase()) ||
    s.bottle.toLowerCase().includes(sakeSearchQuery.toLowerCase())
  );

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const list = await pager.loadNext();
    if (list) {
      setQuests(prev => [...prev, ...list]);
    }
    setLoadingMore(false);
  };

  return (
    <div className="max-w-xl mx-auto pt-6 px-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">クエスト</h1>
          <p className="text-sm text-slate-500 mt-1">未開拓のペアリングを探求しよう</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center">
            <Award className="w-3.5 h-3.5 mr-1" />
            {profile?.title || '見習い'}
          </div>
        </div>
      </div>

      <div className="mb-6 flex justify-end">
        <Link
          to="/quests/new"
          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          クエストを作成
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
          <p className="text-sm">クエストを読み込み中...</p>
        </div>
      ) : quests.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <Target className="w-6 h-6 text-indigo-600" />
          </div>
          <p className="text-slate-900 font-bold mb-1">登録されているクエストがまだありません</p>
          <p className="text-slate-500 text-sm mb-6">最初のペアリングクエストを作成して、みんなで美味しい飲み方を探求しましょう！</p>
          <Link
            to="/quests/new"
            className="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            最初のクエストを作成する
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {quests.map((quest) => (
            <div key={quest.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
              
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-slate-900 pr-2">{quest.title}</h3>
                <div className="flex items-center text-amber-600 font-bold text-xs bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg shrink-0">
                  <Zap className="w-3.5 h-3.5 mr-1 fill-amber-500 text-amber-500" />
                  {quest.rewardPoints} pt
                </div>
              </div>
              
              <p className="text-sm font-medium text-indigo-600 mb-2">
                対象: {quest.sakeBrand ? `${quest.sakeBrand} ${quest.sakeBottle}` : '指定なし (どの日本酒でもOK)'}
              </p>
              
              {quest.description && (
                <p className="text-slate-600 text-sm mb-4 leading-relaxed">{quest.description}</p>
              )}
              
              <div className="flex flex-wrap gap-2 mb-4">
                {quest.targetPairing && (
                  <span className="text-xs bg-rose-50 text-rose-700 border border-rose-100 px-2.5 py-1 rounded-md font-medium">指定おつまみ: {quest.targetPairing}</span>
                )}
                {quest.targetTemperature && (
                  <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-medium">指定温度: {quest.targetTemperature}</span>
                )}
                {quest.targetVessel && (
                  <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-medium">指定酒器: {quest.targetVessel}</span>
                )}
              </div>

              <button
                onClick={() => handleStartChallenge(quest)}
                className="w-full bg-indigo-50 text-indigo-700 font-bold py-2.5 rounded-xl text-sm hover:bg-indigo-100 transition-colors flex items-center justify-center"
              >
                <Target className="w-4 h-4 mr-2" />
                クエストに挑戦する
              </button>
            </div>
          ))}
          <LoadMoreTrigger
            onLoadMore={handleLoadMore}
            hasMore={pager.isLastPage === false}
            loading={loadingMore}
          />
        </div>
      )}

      {/* 日本酒未固定クエスト用の日本酒選択モーダル */}
      {activeQuestForSelect && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-6 max-h-[85vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center">
                <FlaskRound className="w-5 h-5 text-indigo-600 mr-2" />
                挑戦する日本酒を選択
              </h3>
              <button
                onClick={() => setActiveQuestForSelect(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              クエスト: <span className="font-bold text-slate-800">「{activeQuestForSelect.title}」</span><br />
              どの日本酒で挑戦するか選択してください。
            </p>

            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={sakeSearchQuery}
                onChange={(e) => setSakeSearchQuery(e.target.value)}
                placeholder="銘柄・酒蔵名で検索..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-2">
              {loadingSakes ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2 text-indigo-600" />
                  <span className="text-sm">日本酒を検索中...</span>
                </div>
              ) : filteredSakes.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  {sakeSearchQuery ? '該当する日本酒がありません' : '日本酒が登録されていません'}
                  <div className="mt-3">
                    <Link
                      to="/sake/new"
                      className="text-xs text-indigo-600 font-bold hover:underline"
                    >
                      + 新しい日本酒を登録する
                    </Link>
                  </div>
                </div>
              ) : (
                sakes.map((sake) => (
                  <button
                    key={sake.id}
                    onClick={() => handleSelectSakeAndChallenge(sake)}
                    className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{sake.brand} <span className="text-xs font-normal text-slate-500">{sake.bottle}</span></p>
                      <p className="text-xs text-slate-400">{sake.brewery}</p>
                    </div>
                    <span className="text-xs bg-indigo-600 text-white font-medium px-3 py-1 rounded-lg">この酒で挑戦</span>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => setActiveQuestForSelect(null)}
              className="w-full bg-slate-100 text-slate-700 py-3 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors mt-2"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
