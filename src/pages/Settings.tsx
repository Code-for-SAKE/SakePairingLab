import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { setUserApiKey, hasUserApiKey } from '../lib/gemini';

const DISPLAY_NAME_MAX_LENGTH = 50;

export default function Settings() {
  const { user, profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '');
  }, [profile?.displayName]);

  useEffect(() => {
    setHasApiKey(hasUserApiKey());
  }, []);

  const trimmedName = displayName.trim();
  const isNameChanged = trimmedName !== (profile?.displayName ?? '');
  const canSaveName =
    !savingName &&
    isNameChanged &&
    trimmedName.length > 0 &&
    trimmedName.length <= DISPLAY_NAME_MAX_LENGTH;

  const handleSaveDisplayName = async () => {
    if (!canSaveName) return;
    setSavingName(true);
    setNameError(null);
    try {
      await updateProfile({ displayName: trimmedName });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 3000);
    } catch (e) {
      console.error(e);
      setNameError('表示名の保存に失敗しました');
    } finally {
      setSavingName(false);
    }
  };

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
        <h3 className="font-bold text-slate-900 mb-1">表示名</h3>
        <p className="text-sm text-slate-500 mb-4 leading-relaxed">
          タイムラインやレビューに表示される名前です。Googleアカウントの名前とは別に設定できます。
        </p>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          placeholder="表示名を入力"
          className="block w-full pl-4 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm"
        />
        <p className="text-xs text-slate-400 mt-1.5 text-right">
          {displayName.length} / {DISPLAY_NAME_MAX_LENGTH}
        </p>
        <button
          onClick={handleSaveDisplayName}
          disabled={!canSaveName}
          className={clsx(
            'my-3 w-full flex items-center justify-center space-x-2 text-white bg-indigo-600 py-2 rounded-xl hover:bg-indigo-700 transition-colors',
            !canSaveName && !nameSaved && 'opacity-50 cursor-not-allowed',
          )}
        >
          {savingName ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span>{nameSaved ? '保存しました' : '保存'}</span>
        </button>
        {nameError && <p className="text-red-500 mt-2 text-sm">{nameError}</p>}
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
        <h3 className="font-bold text-slate-900 mb-4">Gemini APIキー設定</h3>
        <p className="text-sm text-slate-500 mb-4 leading-relaxed">
          投稿時のコメントを自動生成したり、日本酒アート画像を生成するために利用します。
          <br />
          <a
            className="text-indigo-400 hover:text-indigo-600 underline transition-colors"
            href="https://aistudio.google.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google AI Studio
          </a>
          から簡単に無料のGeminiAPIキーが作成できます。
          <br />
          ただし、アート画像をサイトから生成するには有料のAPIキーが必要です。
        </p>
        <input
          type="password"
          placeholder="APIキーを入力"
          value={inputKey}
          onChange={(e) => setInputKey(e.target.value)}
          className="block w-full pl-4 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm"
        />
        <button
          onClick={handleSaveKey}
          disabled={saving}
          className={clsx(
            'my-3 w-full flex items-center justify-center space-x-2 text-white bg-indigo-600 py-2 rounded-xl hover:bg-indigo-700 transition-colors',
            saving && 'opacity-50 cursor-not-allowed',
          )}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {saved ? '保存しました' : '保存'}
        </button>
        {error && <p className="text-red-500 mt-2">{error}</p>}

        <span className="text-sm text-slate-500 text-center mt-2 leading-relaxed">
          {hasApiKey ? 'APIキーが設定されています。' : 'APIキーを入力してください。'}
        </span>
        <button
          hidden={!hasApiKey}
          onClick={handleClearKey}
          disabled={saving}
          className={clsx(
            'my-3 w-full flex items-center justify-center space-x-2 text-white bg-gray-600 py-2 rounded-xl hover:bg-gray-700 transition-colors',
            saving && 'opacity-50 cursor-not-allowed',
          )}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : cleared ? (
            <Check className="w-4 h-4" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {cleared ? 'クリアしました' : 'クリア'}
        </button>
      </div>
    </div>
  );
}
