import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Loader2, Sparkles, RefreshCw, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { NetworkResponse, Sake } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { SakeFlavorImage } from '../components/SakeFlavorImage';
import { generateQueryEmbedding, hasUserApiKey } from '../lib/gemini';

export default function ExplorePage() {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);

  // Vector Search States
  const [vectorResults, setVectorResults] = useState<Sake[] | null>(null);
  const [isSearchingVector, setIsSearchingVector] = useState(false);
  const [vectorSearchError, setVectorSearchError] = useState<string | null>(null);

  // Admin Rebuild State
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);

  const search = async function (query: string, isMounted: boolean) {
    setIsSearchingVector(true);
    setVectorSearchError(null);
    if (hasUserApiKey()) {
      console.log('search vector', query);

      try {
        // Try Cloud Function vector search first
        const functions = getFunctions(app);
        const searchByVector = httpsCallable<
          { queryVector: number[]; limit?: number },
          { success: boolean; results: Sake[] }
        >(functions, 'searchSakesByVector');

        const vector = await generateQueryEmbedding(query, 1024);
        const res = await searchByVector({ queryVector: vector, limit: 5 });
        if (isMounted && res.data.results) {
          setVectorResults(res.data.results);
          setIsSearchingVector(false);
          return;
        }
      } catch (cfErr: any) {
        alert(`ベクトル検索に失敗しました: ${cfErr.message || 'エラーが発生しました'}`);
        console.warn(
          'Cloud Functions vector search unavailable, attempting client fallback...',
          cfErr,
        );
        setVectorSearchError(cfErr.message);
      }
      setIsSearchingVector(false);
    } else {
      console.log('search normal', query);
      try {
        // Try Cloud Function vector search first
        const functions = getFunctions(app);
        const searchSakesByText = httpsCallable<
          { queryText: string; limit?: number },
          { success: boolean; results: Sake[] }
        >(functions, 'searchSakesByText');

        const res = await searchSakesByText({ queryText: query, limit: 5 });
        if (isMounted && res.data.results) {
          setVectorResults(res.data.results);
          setIsSearchingVector(false);
          return;
        }
      } catch (cfErr: any) {
        alert(`自然言語検索に失敗しました:${cfErr.message || 'エラーが発生しました'}`);
        console.warn('Cloud Functions text search unavailable...', cfErr);
        setVectorSearchError(cfErr.message);
      }
      setIsSearchingVector(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(false);
    setError(null);

    return () => {
      isMounted = false;
    };
  }, []);

  // Perform AI Vector Search when query changes (with debounce)
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setVectorResults(null);
      setVectorSearchError(null);
      setIsSearchingVector(false);
      return;
    }
    let isMounted = true;

    const timer = setTimeout(async () => {}, 2000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setVectorResults(null);
      setVectorSearchError(null);
      setIsSearchingVector(false);
      return;
    }
    let isMounted = true;

    await search(trimmed, isMounted);

    return () => {
      isMounted = false;
    };
  };

  const handleKeyDown = (event: { key: string }) => {
    if (event.key === 'Enter' && !isComposing) {
      handleSearch();
    }
  };

  const handleRebuildAllEmbeddings = async () => {
    if (!window.confirm('全ての日本酒のEmbedding（ベクトル）を再生成しますか？')) {
      return;
    }
    setIsRebuilding(true);
    setRebuildMessage(null);
    try {
      const functions = getFunctions(app);
      const rebuildAll = httpsCallable<
        { reindexAll?: boolean },
        { success: boolean; count: number; total: number }
      >(functions, 'rebuildAllSakeEmbeddings');
      const res = await rebuildAll({});
      setRebuildMessage(
        `✅ ${res.data.count}件 / 全${res.data.total}件 のEmbeddingを正常に生成・更新しました。`,
      );
    } catch (err: any) {
      console.error('Error rebuilding embeddings:', err);
      setRebuildMessage(
        `❌ エラー: ${err.message || '再生成に失敗しました。管理者権限をご確認ください。'}`,
      );
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleRebuildAllClusters = async () => {
    if (!window.confirm('全ての日本酒のクラスタを再生成しますか？')) {
      return;
    }
    setIsRebuilding(true);
    setRebuildMessage(null);
    try {
      const functions = getFunctions(app);
      const rebuildAll = httpsCallable<{ reindexAll?: boolean }, NetworkResponse>(
        functions,
        'rebuildSakeNetworkData',
      );
      const res = await rebuildAll({});
      console.log('Rebuild clusters response:', res.data);
      setRebuildMessage(
        `✅ ノード数:${res.data.nodes.length}件 リンク数:${res.data.links.length}件 のクラスタを正常に生成・更新しました。`,
      );
    } catch (err: any) {
      console.error('Error rebuilding embeddings:', err);
      setRebuildMessage(
        `❌ エラー: ${err.message || '再生成に失敗しました。管理者権限をご確認ください。'}`,
      );
    } finally {
      setIsRebuilding(false);
    }
  };

  const displayList = vectorResults ?? [];
  const isUsingVectorSearch = Boolean(query.trim() && vectorResults && vectorResults.length > 0);

  return (
    <div className="max-w-xl mx-auto pt-6 px-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">日本酒を探す</h1>
        {profile?.role === 'admin' && (
          <button
            onClick={handleRebuildAllEmbeddings}
            disabled={isRebuilding}
            className="inline-flex items-center text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer"
            title="管理者用: 全Embedding再生成"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1 ${isRebuilding ? 'animate-spin text-indigo-600' : ''}`}
            />
            {isRebuilding ? '再生成中...' : 'ベクトル一括更新'}
          </button>
        )}
        {profile?.role === 'admin' && (
          <button
            onClick={handleRebuildAllClusters}
            disabled={isRebuilding}
            className="inline-flex items-center text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer"
            title="管理者用: 全クラスタ再生成"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1 ${isRebuilding ? 'animate-spin text-indigo-600' : ''}`}
            />
            {isRebuilding ? '再生成中...' : 'クラスタ一括更新'}
          </button>
        )}
        <Link to="./sake">
          <Compass className="w-6 h-6" />
          <span className="text-xs mt-1 font-medium">近さマップ</span>
        </Link>
      </div>

      {rebuildMessage && (
        <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-900 font-medium">
          {rebuildMessage}
        </div>
      )}

      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          {isSearchingVector ? (
            <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-24 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm"
          placeholder="銘柄・特徴・味の好みでAI検索... (例: 肉に合うフルーティな酒)"
          value={query}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && !isSearchingVector && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <button
              onClick={handleSearch}
              className="text-xs bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded-md flex items-center cursor-pointer"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              AI Vector
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-bold text-slate-900">検索結果</h2>
          {isUsingVectorSearch && (
            <span className="text-xs bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center">
              <Sparkles className="w-3 h-3 mr-1 text-emerald-600" />
              AI意味検索ヒット
            </span>
          )}
        </div>
        <Link
          to="/sake/new"
          className="text-sm font-medium text-indigo-600 flex items-center hover:text-indigo-700"
        >
          <Plus className="w-4 h-4 mr-1" />
          新しい日本酒を登録
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
          <p className="text-sm">日本酒データを読み込み中...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12 text-rose-500 text-sm">{error}</div>
      ) : (
        <div className="space-y-3">
          {displayList.map((sake) => (
            <Link
              key={sake.id}
              to={`/sake/${sake.id}`}
              className="block bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-start">
                <div className="w-20 mr-5">
                  <SakeFlavorImage
                    sakeId={sake.id}
                    sakeName={`${sake.brand} ${sake.bottle}(${sake.brewery})`}
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{sake.brewery}</p>
                  <p className="font-bold text-slate-900 text-lg mb-1">{sake.brand}</p>
                  <p className="text-sm text-slate-600">{sake.bottle}</p>
                </div>
                {isUsingVectorSearch && (
                  <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md shrink-0 ml-2">
                    AIマッチ
                  </span>
                )}
              </div>
            </Link>
          ))}
          {displayList.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              検索ワードを入力して検索してみましょう。
              <br />
              それでも見つからなかったら、新しく登録しましょう！
            </div>
          )}
        </div>
      )}
    </div>
  );
}
