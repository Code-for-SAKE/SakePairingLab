import React, { useState, useEffect } from 'react';
import { Search, Plus, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sake } from '../types';

async function getSakeList(): Promise<Sake[]> {
  const sakeList = collection(db, 'sakes');
  const querySnapshot = await getDocs(sakeList);
  const sakes = querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Sake[];
  return sakes;
}

export default function ExplorePage() {
  const [query, setQuery] = useState('');
  const [sakes, setSakes] = useState<Sake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    getSakeList()
      .then((data) => {
        if (isMounted) {
          setSakes(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error fetching sake list:', err);
        if (isMounted) {
          setError('データの取得に失敗しました。');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = sakes.filter((sake) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      sake.brand?.toLowerCase().includes(q) ||
      sake.brewery?.toLowerCase().includes(q) ||
      sake.bottle?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-xl mx-auto pt-6 px-4">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">日本酒を探す</h1>
      
      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm"
          placeholder="銘柄、酒蔵で検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900">検索結果</h2>
        <Link to="/sake/new" className="text-sm font-medium text-indigo-600 flex items-center hover:text-indigo-700">
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
        <div className="text-center py-12 text-rose-500 text-sm">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sake) => (
            <Link 
              key={sake.id} 
              to={`/sake/${sake.id}`}
              className="block bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:border-indigo-300 transition-colors"
            >
              <p className="text-xs text-slate-500 mb-1">{sake.brewery}</p>
              <p className="font-bold text-slate-900 text-lg mb-1">{sake.brand}</p>
              <p className="text-sm text-slate-600">{sake.bottle}</p>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              見つかりませんでした。新しく登録しましょう！
            </div>
          )}
        </div>
      )}
    </div>
  );
}

