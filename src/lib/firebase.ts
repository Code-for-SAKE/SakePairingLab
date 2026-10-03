import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, Query } from 'firebase/firestore';
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

export async function getRandomDocuments<T>(
  conditionQuery: Query,
  targetCount = 100,
  limitCount = 10,
) {
  const resultDocs = new Map<string, any>(); // 重複排除とデータ保持用 (ID -> Data)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  let emptyAttempts = 0; // 新しいデータが取れなかった連続回数
  const MAX_EMPTY_ATTEMPTS = 3; // 諦める上限回数

  // --- ステップ1: ランダムな頭2文字で繰り返し取得 ---
  while (resultDocs.size < targetCount && emptyAttempts < MAX_EMPTY_ATTEMPTS) {
    // ランダムな頭2文字を生成 (例: "Af", "3b")
    const randomPrefix =
      chars.charAt(Math.floor(Math.random() * chars.length)) +
      chars.charAt(Math.floor(Math.random() * chars.length));

    try {
      // その文字列以降から最大件数をサンプリング
      const q = query(
        conditionQuery,
        orderBy('__name__'),
        startAt(randomPrefix),
        limit(limitCount),
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
    } catch (err) {
      console.warn('Random prefix sampling not applicable or failed for query:', err);
      break;
    }
  }

  // --- ステップ2: レコード数が満たなかった場合の補填 ---
  // (条件付きクエリやデータ数が少ない場合は、conditionQueryから直接取得して不足分を補う)
  if (resultDocs.size < targetCount) {
    try {
      const needed = targetCount - resultDocs.size;
      const fallbackQ = query(conditionQuery, limit(needed));
      const fallbackSnapshot = await getDocs(fallbackQ);

      fallbackSnapshot.forEach((doc) => {
        if (!resultDocs.has(doc.id)) {
          resultDocs.set(doc.id, doc.data());
        }
      });
    } catch (err) {
      console.error('Error fetching fallback documents for query:', err);
    }
  }

  // Mapから配列に変換して返す
  return Array.from(resultDocs.entries()).map(([id, data]) => ({ id, ...data }) as T);
}
