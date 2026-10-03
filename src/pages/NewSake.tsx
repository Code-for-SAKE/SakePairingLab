import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function NewSake() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [brewery, setBrewery] = useState('');
  const [brand, setBrand] = useState('');
  const [bottle, setBottle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');
    try {
      const normalizedBrewery = brewery.trim();
      const normalizedBrand = brand.trim();
      const normalizedBottle = bottle.trim();
      if (!normalizedBrewery || !normalizedBrand || !normalizedBottle) {
        setError('酒蔵・銘柄・ボトル詳細を入力してください。');
        return;
      }

      const existingSakes = await getDocs(
        query(
          collection(db, 'sakes'),
          where('brewery', '==', normalizedBrewery),
          where('brand', '==', normalizedBrand),
          where('bottle', '==', normalizedBottle),
        ),
      );

      const existingSake = existingSakes.docs[0];
      if (existingSake) {
        setError('この日本酒はすでに登録されています。');
        return;
      }

      const docRef = await addDoc(collection(db, 'sakes'), {
        brewery: normalizedBrewery,
        brand: normalizedBrand,
        bottle: normalizedBottle,
        description,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      navigate(`/sake/${docRef.id}`);
    } catch (error) {
      console.error('Error adding document: ', error);
      setError('登録に失敗しました。時間をおいてもう一度お試しください。');
    } finally {
      setLoading(false);
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
        <div className="flex-1 text-center font-bold text-slate-900">新しい日本酒を登録</div>
        <div className="w-9" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">{error}</p>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">酒蔵</label>
          <input
            type="text"
            required
            value={brewery}
            onChange={(e) => setBrewery(e.target.value)}
            placeholder="例：旭酒造"
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">銘柄</label>
          <input
            type="text"
            required
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="例：獺祭"
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">ボトル・詳細</label>
          <input
            type="text"
            required
            value={bottle}
            onChange={(e) => setBottle(e.target.value)}
            placeholder="例：磨き二割三分"
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            説明・特徴（任意）
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="どんな特徴があるお酒ですか？"
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !brewery.trim() || !brand.trim() || !bottle.trim()}
          className="w-full bg-indigo-600 text-white py-4 rounded-xl font-medium disabled:opacity-50 flex justify-center items-center shadow-md hover:bg-indigo-700 transition-colors"
        >
          {loading ? '登録中...' : '登録する'}
        </button>
      </form>
    </div>
  );
}
