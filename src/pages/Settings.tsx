import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { setUserApiKey, getApiKey } from '../lib/gemini';

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inputKey, setInputKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    getApiKey().then(key => {
      if (isMounted) {
        setHasApiKey(key !== '');
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSaveKey = async () => {
    setSaving(true);
    setError(null);
    try {
      setUserApiKey(inputKey.trim());
      setSaved(true);
      setInputKey('');
      setHasApiKey(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
      setError('APIキーの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    setSaving(true);
    setError(null);
    try {
      setUserApiKey('');
      setCleared(true);
      setHasApiKey(false);
      setInputKey('');
      setTimeout(() => setCleared(false), 3000);
    } catch (e) {
      console.error(e);
      setError('APIキーのクリアに失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    navigate('/mypage');
    return null;
  }

  return (
    <div className="max-w-xl mx-auto pt-6 px-4 pb-20">
      <div className="flex items-center mb-8">
        <button
          onClick={() => navigate('/mypage')}
          className="p-2 text-slate-400 hover:text-slate-900 -ml-2"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-slate-900 ml-2">設定</h1>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
        <h3 className="font-bold text-slate-900 mb-4">Gemini APIキー設定</h3>
        <input
          type="password"
          placeholder="APIキーを入力"
          value={inputKey}
          onChange={e => setInputKey(e.target.value)}
          className="block w-full pl-4 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm"
        />
        <button
          onClick={handleSaveKey}
          disabled={saving}
          className={clsx(
            "my-3 w-full flex items-center justify-center space-x-2 text-white bg-indigo-600 py-2 rounded-xl hover:bg-indigo-700 transition-colors",
            saving && "opacity-50 cursor-not-allowed"
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {saved ? "保存しました" : "保存"}
        </button>
        {error && <p className="text-red-500 mt-2">{error}</p>}

        <span className="text-sm text-slate-500 text-center mt-2 leading-relaxed">{hasApiKey ? "APIキーが設定されています。" : "APIキーを入力してください。"}</span>
        <button
          hidden={!hasApiKey}
          onClick={handleClearKey}
          disabled={saving}
          className={clsx(
            "my-3 w-full flex items-center justify-center space-x-2 text-white bg-gray-600 py-2 rounded-xl hover:bg-gray-700 transition-colors",
            saving && "opacity-50 cursor-not-allowed"
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : cleared ? <Check className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {cleared ? "クリアしました" : "クリア"}
        </button>
      </div>
    </div>
  );
}

