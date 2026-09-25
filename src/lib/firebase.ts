import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import config from '@/firebase-applet-config.json';
import { collection, query, orderBy, startAt, limit, getDocs } from 'firebase/firestore';

export const app = initializeApp(config);
export const db = getFirestore(app, (config as any).firestoreDatabaseId);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export async function getRandomDocuments<T>(collectionName: string, targetCount = 100) {
  const resultDocs = new Map(); // 重複排除とデータ保持用 (ID -> Data)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  let emptyAttempts = 0; // 新しいデータが取れなかった連続回数
  const MAX_EMPTY_ATTEMPTS = 3; // 諦める上限回数

  // --- ステップ1: ランダムな頭2文字で繰り返し取得 ---
  while (resultDocs.size < targetCount && emptyAttempts < MAX_EMPTY_ATTEMPTS) {
    // ランダムな頭2文字を生成 (例: "Af", "3b")
    const randomPrefix =
      chars.charAt(Math.floor(Math.random() * chars.length)) +
      chars.charAt(Math.floor(Math.random() * chars.length));

    // その文字列以降から最大5件をサンプリング
    const q = query(
      collection(db, collectionName),
      orderBy('__name__'),
      startAt(randomPrefix),
      limit(5),
    );

    const snapshot = await getDocs(q);
    let addedInThisLoop = 0;

    snapshot.forEach((doc) => {
      if (!resultDocs.has(doc.id)) {
        resultDocs.set(doc.id, doc.data());
        addedInThisLoop++;
      }
    });

    // 新しいデータが1件も増えなかったら、空振りカウンターを増やす
    if (addedInThisLoop === 0) {
      emptyAttempts++;
    } else {
      emptyAttempts = 0; // データが取れたらカウンターをリセット
    }
  }

  // --- ステップ2: レコード数が100件に満たなかった場合のフォールバック ---
  if (resultDocs.size < targetCount) {
    console.log(`データが足りないため(現在${resultDocs.size}件)、先頭から補填します。`);

    // コレクションの先頭から必要な分（最大100件）を普通に取得
    const fallbackQ = query(
      collection(db, 'your_collection'),
      orderBy('__name__'),
      limit(targetCount),
    );

    const fallbackSnapshot = await getDocs(fallbackQ);
    fallbackSnapshot.forEach((doc) => {
      if (resultDocs.size < targetCount) {
        resultDocs.set(doc.id, doc.data());
      }
    });
  }

  // Mapから配列に変換して返す
  return Array.from(resultDocs.entries()).map(([id, data]) => ({ id, ...data }) as T);
}
