import React, { useEffect, useRef, useState } from 'react';
import { generateFlavorImage, generateFlavorImagePrompt } from '../lib/gemini';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { Copy, Edit, Upload } from 'lucide-react';

const UPLOAD_SIZE = 1024; // アップロード画像サイズ (px)

interface SakeFlavorImageProps {
  sakeId: string;
  sakeName: string;
  bottle: string; // 頭文字表示に使用
  embedding: number[] | undefined;
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

/** bottle 文字列から頭文字を最大2文字取得 */
function getInitials(bottle: string): string {
  const chars = [...bottle.trim()];
  return chars.slice(0, 2).join('');
}

export const SakeFlavorImage: React.FC<SakeFlavorImageProps> = ({
  sakeId,
  sakeName,
  bottle,
  embedding,
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
    <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
      {isInitialLoading ? (
        /* 初期読み込みスケルトン */
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '12px',
            background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
            backgroundSize: '200% 100%',
            animation: 'skeleton-shimmer 1.4s infinite',
          }}
        />
      ) : imageUrl ? (
        <img
          src={imageUrl}
          alt={`${sakeName}の味わいビジュアル`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '12px',
            display: 'block',
          }}
        />
      ) : (
        /* 画像なし：bottleの頭文字 */
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: 'clamp(40px, 15vw, 96px)',
              fontWeight: 'bold',
              color: 'rgba(255,255,255,0.9)',
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            {getInitials(bottle)}
          </span>
        </div>
      )}

      {/* 右下の編集ボタン */}
      {!isInitialLoading && (
        <button
          onClick={openModal}
          title="画像を編集"
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            fontSize: '16px',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
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
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          animation: 'fadeIn 0.15s ease',
        }}
      />
      {/* モーダル本体 */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1001,
          background: '#fff',
          borderRadius: '16px',
          padding: '24px',
          width: 'min(92vw, 420px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          animation: 'slideUp 0.2s ease',
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#1a1a2e' }}>
            🎨 味わいアートを設定
          </h3>
          <button
            onClick={closeModal}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: '20px',
              color: '#888',
              lineHeight: 1,
              padding: '2px 6px',
            }}
          >
            ×
          </button>
        </div>

        {/* AI生成失敗時：プロンプト表示 */}
        {failedPrompt ? (
          <div>
            <div
              style={{
                background: '#FFF8E1',
                border: '1px solid #FFD54F',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <p
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  color: '#E65100',
                }}
              >
                ⚠️ AI画像生成に失敗しました
              </p>
              <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#555' }}>
                以下のプロンプトを使って他の画像生成AIで画像を作成してアップロードしてください。
              </p>
              <div
                style={{
                  background: '#FFF',
                  border: '1px solid #E0E0E0',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '12px',
                  color: '#333',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {failedPrompt}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(failedPrompt)}
                style={{
                  marginTop: '8px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  background: '#F5F5F5',
                  border: '1px solid #DDD',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#555',
                }}
              >
                <Copy />
                コピー
              </button>
            </div>
            {/* 手動アップロードは引き続き可能 */}
            <p
              style={{ fontSize: '13px', color: '#555', margin: '0 0 10px 0', fontWeight: 'bold' }}
            >
              生成した画像をアップロード
            </p>
          </div>
        ) : (
          /* 通常：AI生成ボタン */
          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 10px 0' }}>
              【{bottle}】のEmbeddingからAIが味わいアートを自動生成します。
            </p>
            <button
              onClick={generateAndSaveImage}
              disabled={busy || !embedding}
              style={{
                width: '100%',
                padding: '12px',
                background: busy || !embedding ? '#BDC3C7' : '#E67E22',
                color: '#FFF',
                border: 'none',
                borderRadius: '8px',
                cursor: busy || !embedding ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                marginBottom: '4px',
              }}
            >
              {isLoading ? '⏳ AI生成中...' : '🤖 AIで味わいアートを生成'}
            </button>
            {!embedding && (
              <p style={{ fontSize: '11px', color: '#999', margin: '4px 0 0 0' }}>
                ※ Embeddingが未算出のため生成できません
              </p>
            )}
          </div>
        )}

        {/* 区切り */}
        {!failedPrompt && (
          <div style={{ display: 'flex', alignItems: 'center', margin: '14px 0', gap: '8px' }}>
            <div style={{ flex: 1, height: '1px', background: '#E0E0E0' }} />
            <span style={{ fontSize: '12px', color: '#999' }}>または</span>
            <div style={{ flex: 1, height: '1px', background: '#E0E0E0' }} />
          </div>
        )}

        {/* 手動アップロード */}
        <div>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 8px 0' }}>
            手動アップロード（{UPLOAD_SIZE}×{UPLOAD_SIZE}px にリサイズして保存）
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleManualUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            style={{
              width: '100%',
              padding: '12px',
              background: busy ? '#BDC3C7' : '#3498DB',
              color: '#FFF',
              border: 'none',
              borderRadius: '8px',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
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
          <div
            style={{
              marginTop: '12px',
              padding: '10px',
              background: '#FCE4D6',
              color: '#C0392B',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          >
            ❌ {errorMessage}
          </div>
        )}
      </div>

      {/* アニメーション定義 */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translate(-50%, -44%); opacity: 0 } to { transform: translate(-50%, -50%); opacity: 1 } }
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
