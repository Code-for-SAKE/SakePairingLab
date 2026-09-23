import React, { useEffect, useRef, useState } from 'react';
import { generateFlavorImage, generateFlavorImagePrompt } from '../lib/gemini';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { Copy, Edit } from 'lucide-react';

const UPLOAD_SIZE = 1024; // アップロード画像サイズ (px)

interface SakeFlavorImageProps {
  sakeId: string;
  sakeName: string;
  embedding?: number[] | undefined;
  editable?: boolean;
}

/** 画像ファイルを Canvas で UPLOAD_SIZE×UPLOAD_SIZE にリサイズ（センタークロップ）→ PNG data URL */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = UPLOAD_SIZE;
      canvas.height = UPLOAD_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context の取得に失敗しました。'));
        return;
      }
      const scale = Math.max(UPLOAD_SIZE / img.width, UPLOAD_SIZE / img.height);
      const scaledW = img.width * scale;
      const scaledH = img.height * scale;
      ctx.drawImage(
        img,
        (UPLOAD_SIZE - scaledW) / 2,
        (UPLOAD_SIZE - scaledH) / 2,
        scaledW,
        scaledH,
      );
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('画像の読み込みに失敗しました。'));
    };
    img.src = objectUrl;
  });
}

/** 文字列から頭文字を最大2文字取得 */
function getInitials(name: string): string {
  const chars = [...name.trim()];
  return chars.slice(0, 2).join('');
}

export const SakeFlavorImage: React.FC<SakeFlavorImageProps> = ({
  sakeId,
  sakeName,
  embedding,
  editable = false,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // AI生成失敗時：プロンプトを保持して表示
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const storage = getStorage();
  const storageRef = ref(storage, `sake_flavor_arts/${sakeId}.png`);

  // マウント時：Storage に既存画像があるか確認
  useEffect(() => {
    if (!sakeId) {
      setIsInitialLoading(false);
      return;
    }
    getDownloadURL(storageRef)
      .then((url) => setImageUrl(url))
      .catch(() => {
        /* まだ画像なし — 正常 */
      })
      .finally(() => setIsInitialLoading(false));
  }, [sakeId]);

  const resetModalState = () => {
    setFailedPrompt(null);
    setErrorMessage(null);
  };

  const openModal = () => {
    resetModalState();
    setIsModalOpen(true);
  };
  const closeModal = () => {
    if (!isLoading && !isUploading) setIsModalOpen(false);
  };

  // ─── AI生成 ───────────────────────────────────────
  const generateAndSaveImage = async () => {
    setIsLoading(true);
    setFailedPrompt(null);
    setErrorMessage(null);

    let generatedPrompt: string | null = null;
    try {
      if (!embedding) {
        throw new Error('埋め込みベクトルが算出されていません。');
      }
      generatedPrompt = await generateFlavorImagePrompt(sakeName, embedding);
      const { base64Data, mimeType } = await generateFlavorImage(generatedPrompt);
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      await uploadString(storageRef, dataUrl, 'data_url', { contentType: mimeType });
      const downloadUrl = await getDownloadURL(storageRef);
      setImageUrl(downloadUrl);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Image Generation Error:', err);
      setErrorMessage(err.message || '画像の生成中にエラーが発生しました。');
      // プロンプト生成まで成功していればプロンプトを表示
      if (generatedPrompt) setFailedPrompt(generatedPrompt);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── 手動アップロード ──────────────────────────────
  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    setIsUploading(true);
    setFailedPrompt(null);
    setErrorMessage(null);

    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await uploadString(storageRef, dataUrl, 'data_url', { contentType: 'image/png' });
      const downloadUrl = await getDownloadURL(storageRef);
      setImageUrl(downloadUrl);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Manual Upload Error:', err);
      setErrorMessage(err.message || '手動アップロード中にエラーが発生しました。');
    } finally {
      setIsUploading(false);
    }
  };

  const busy = isLoading || isUploading;

  // ─── 画像エリア ────────────────────────────────────
  const imageArea = (
    <div className="relative w-full aspect-square">
      {isInitialLoading ? (
        /* 初期読み込みスケルトン */
        <div className="h-full w-full rounded-2xl bg-[linear-gradient(90deg,#f0f0f0_25%,#e0e0e0_50%,#f0f0f0_75%)] animate-[skeleton-shimmer_1.4s_infinite]" />
      ) : imageUrl ? (
        <img
          className="w-full h-full rounded-2xl object-cover block"
          src={imageUrl}
          alt={`${sakeName}の味わいビジュアル`}
        />
      ) : (
        /* 画像なし：bottleの頭文字 */
        <div className="flex h-full w-full @container items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#667eea_0%,#764ba2_100%)]">
          <span className="text-[40cqw] text-white select-none font-bold">
            {getInitials(sakeName)}
          </span>
        </div>
      )}

      {/* 右下の編集ボタン */}
      {editable && !isInitialLoading && (
        <button
          onClick={openModal}
          title="画像を編集"
          className="absolute bottom-2 right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-white/20 text-lg transition-transform duration-150 hover:scale-110"
        >
          <Edit />
        </button>
      )}
    </div>
  );

  // ─── モーダル内容 ──────────────────────────────────
  const modal = isModalOpen && (
    <>
      {/* オーバーレイ */}
      <div
        onClick={closeModal}
        className="fixed inset-0 z-1000 animate-[fadeIn_0.15s_ease] bg-black/50"
      />
      {/* モーダル本体 */}
      <div className="fixed left-1/2 top-1/2 z-1001 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        {/* ヘッダー */}
        <div className="mb-5 flex items-center justify-between">
          <h3 className="m-0 text-base font-bold text-black">味わいアートを設定</h3>
          <button
            onClick={closeModal}
            disabled={busy}
            className="cursor-pointer border-none bg-transparent px-1.5 py-0.5 text-xl leading-none text-gray-500 disabled:cursor-not-allowed"
          >
            ×
          </button>
        </div>

        {/* AI生成失敗時：プロンプト表示 */}
        {failedPrompt ? (
          <div>
            <div className="mb-4 rounded-lg border border-slate-100 p-3">
              <p className="mb-2 text-sm font-bold text-red-800">AI画像生成に失敗しました</p>
              <p className="mb-2.5 text-[13px] text-slate-500">
                以下のプロンプトを使って他の画像生成AIで画像を作成してアップロードしてください。
              </p>
              <div className="max-h-35 overflow-y-auto break-all whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-100 p-2.5 font-mono text-xs text-slate-600">
                {failedPrompt}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(failedPrompt)}
                className="mt-2 cursor-pointer rounded border border-slate-100 px-2.5 py-1 text-xs text-slate-500"
              >
                <Copy />
                コピー
              </button>
            </div>
            {/* 手動アップロードは引き続き可能 */}
            <p className="mb-2.5 text-sm font-bold text-slate-600">生成した画像をアップロード</p>
          </div>
        ) : (
          /* 通常：AI生成ボタン */
          <div className="mb-3">
            <p className="mb-2.5 text-sm text-slate-600">
              【{sakeName}】のEmbeddingからAIが味わいアートを自動生成します。
            </p>
            <button
              onClick={generateAndSaveImage}
              disabled={busy || !embedding}
              className={`mb-1 w-full rounded-lg border-none p-3 text-sm font-bold text-white ${busy || !embedding ? 'cursor-not-allowed bg-slate-400' : 'cursor-pointer bg-indigo-400 hover:bg-indigo-500'}`}
            >
              {isLoading ? 'AI生成中...' : 'AIで味わいアートを生成'}
            </button>
            {!embedding && (
              <p className="mt-1 text-xs text-slate-600">※ Embeddingが未算出のため生成できません</p>
            )}
          </div>
        )}

        {/* 区切り */}
        {!failedPrompt && (
          <div className="my-3.5 flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs text-slate-400">または</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
        )}

        {/* 手動アップロード */}
        <div>
          <p className="mb-2 text-xs text-slate-500">
            手動アップロード（{UPLOAD_SIZE}×{UPLOAD_SIZE}px にリサイズして保存）
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleManualUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className={`w-full rounded-lg border-none p-3 text-sm font-bold text-white ${busy ? 'cursor-not-allowed bg-slate-400' : 'cursor-pointer bg-indigo-400 hover:bg-indigo-500'}`}
          >
            {isUploading ? (
              'アップロード中...'
            ) : (
              <>
                <span>画像ファイルを選択してアップロード</span>
              </>
            )}
          </button>
        </div>

        {/* エラー（プロンプトなし失敗の場合） */}
        {errorMessage && !failedPrompt && (
          <div className="mt-3 rounded-md bg-slate-100 p-2.5 text-xs text-red-800">
            {errorMessage}
          </div>
        )}
      </div>

      {/* アニメーション定義 */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes skeleton-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>
    </>
  );

  return (
    <>
      {imageArea}
      {modal}
    </>
  );
};
