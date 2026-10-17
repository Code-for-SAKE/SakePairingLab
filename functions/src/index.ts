import {
  onDocumentCreated,
  FirestoreEvent,
  DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import {
  NetworkLink,
  NetworkNode,
  NetworkResponse,
  Review,
  Sake,
  SakeSearchResult,
  TasteProfile,
} from './type';
import { kmeans } from 'ml-kmeans';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const geminiApiKey = defineSecret('GEMINI_API_KEY');

function resolveApiKey(): string {
  try {
    return geminiApiKey.value();
  } catch {
    return process.env.GEMINI_API_KEY || '';
  }
}

async function generateEmbedding(
  ai: GoogleGenAI,
  text: string,
  dimension: number,
): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: 'models/gemini-embedding-001',
    contents: text,
    config: {
      outputDimensionality: dimension, // 👈 Firestoreの上限は2048まで
    },
  });

  const values = (response as any).embedding?.values || response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error('Embedding values not returned by Gemini API');
  }

  return values;
}

function buildSakeBasicText(sake: Sake | Partial<Sake>): string {
  if (!sake) return '';

  const brand = sake.brand || '';
  const brewery = sake.brewery || '';
  const bottle = sake.bottle || '';
  const description = sake.description || '';
  return `銘柄: ${brand}, 酒蔵: ${brewery}, 種別: ${bottle}, 特徴: ${description}`.trim();
}

function buildSakeTasteText(sake: Sake | Partial<Sake>): string {
  if (!sake) return '';

  const brand = sake.brand || '';
  const description = sake.description || '';
  if (description) {
    return `味わい・香りの特徴: ${description}`.trim();
  }
  return `味わい・香り: ${brand}`.trim();
}

function buildSakeText(sake: Sake | Partial<Sake>): string {
  return buildSakeBasicText(sake);
}

function formatTasteProfile(profile?: TasteProfile | string): string {
  if (!profile) return '';
  if (typeof profile === 'string') return profile;
  const parts = [
    ...(profile.broads || []),
    ...(profile.specific || []),
    profile.custom || '',
  ].filter(Boolean);
  return parts.join(', ');
}

async function checkIsAdmin(auth: any): Promise<boolean> {
  if (!auth?.uid) return false;
  if (auth.token?.admin === true) return true;

  try {
    const userDoc = await db.collection('users').doc(auth.uid).get();
    if (userDoc.exists && userDoc.data()?.role === 'admin') {
      return true;
    }
  } catch (err) {
    console.error('Error checking admin status:', err);
  }

  return false;
}

function getMeanVector(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];

  const dim = embeddings[0].length;
  const meanVector = new Array(dim).fill(0);

  for (const vec of embeddings) {
    for (let i = 0; i < dim; i++) {
      meanVector[i] += vec[i];
    }
  }

  return meanVector.map((sum) => sum / embeddings.length);
}

/**
 * Triggered automatically when a Sake document is created.
 * Generates 2048d embedding (1024d basic info + 1024d taste info) using Gemini models/gemini-embedding-001
 * and updates document with FieldValue.vector and updatedAt.
 */
export const onSakeCreated = onDocumentCreated(
  {
    document: 'sakes/{sakeId}',
    secrets: [geminiApiKey],
  },
  async (event: FirestoreEvent<DocumentSnapshot | undefined, { sakeId: string }>) => {
    const snap = event.data;
    if (!snap || !snap.exists) {
      return;
    }

    const data = snap.data() as Sake | undefined;
    if (!data) return;

    // 二重実行防止: すでに embedding が設定されている場合はスキップ
    if (data.embedding) {
      return;
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not set');
      return;
    }

    const basicText = buildSakeBasicText(data);
    const tasteText = buildSakeTasteText(data);
    if (!basicText) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const basicVector1024 = await generateEmbedding(ai, basicText, 1024);
      const tasteVector1024 = await generateEmbedding(ai, tasteText, 1024);
      const embedding2048 = [...basicVector1024, ...tasteVector1024];

      await snap.ref.update({
        embedding: FieldValue.vector(embedding2048),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`Successfully generated 2048d embedding for sake ${event.params.sakeId}`);
    } catch (err) {
      console.error(`Error generating embedding for sake ${event.params.sakeId}:`, err);
    }
  },
);

// レビュー作成時のみ実行（新規作成時のみトリガーされるため無限ループを防止）
export const onReviewCreated = onDocumentCreated(
  {
    document: 'reviews/{reviewId}',
    secrets: [geminiApiKey],
  },
  async (event: FirestoreEvent<DocumentSnapshot | undefined, { reviewId: string }>) => {
    const reviewSnap = event.data;
    if (!reviewSnap || !reviewSnap.exists) {
      return;
    }

    const reviewData = reviewSnap.data() as Review | undefined;
    if (!reviewData) return;

    // 二重実行防止: すでに embedding が設定されている場合はスキップ
    if (reviewData.embedding) {
      return;
    }

    // 1. sakesコレクションから、お酒のembeddingを取得する
    const sakeSnap = await db.collection('sakes').doc(reviewData.sakeId).get();
    const sakeData = sakeSnap.data() as Sake | undefined;
    if (!sakeData) return;

    const ai = new GoogleGenAI({ apiKey: resolveApiKey() });

    const sakeText = buildSakeText(sakeData);
    console.log(`Sake text for embedding: ${sakeText}`);
    console.log(`Sake embedding: ${sakeData.embedding}`);

    const sakeEmbedding: number[] = Array.isArray(sakeData.embedding)
      ? sakeData.embedding
      : (sakeData.embedding as any)?.toArray?.() || [];

    // お酒の基本情報ベクトル（前半1024次元）と味わい・香りベクトル（後半1024次元）を分離
    let sakeBasicVector: number[];
    let sakeTasteVector: number[];

    if (sakeEmbedding.length >= 2048) {
      sakeBasicVector = sakeEmbedding.slice(0, 1024);
      sakeTasteVector = sakeEmbedding.slice(1024, 2048);
    } else if (sakeEmbedding.length >= 1024) {
      sakeBasicVector = sakeEmbedding.slice(0, 1024);
      sakeTasteVector = sakeEmbedding.slice(0, 1024);
    } else {
      sakeBasicVector = await generateEmbedding(ai, sakeText, 1024);
      sakeTasteVector = [...sakeBasicVector];
    }

    // 2. 前半 1024次元 (context) のテキストを作成
    // お酒のスペック ＋ 温度 ＋ 酒器 ＋ おつまみ
    const contextText = `${sakeText} 温度:${reviewData.temperature || ''} 酒器:${reviewData.vessel || ''} おつまみ:${reviewData.pairing || ''}`;
    const environmentVector1024 = await generateEmbedding(ai, contextText, 1024);

    // お酒の基本情報ベクトルと環境のベクトルをブレンド（5:5）して前半のcontextとする
    const alpha = 0.5;
    const contextVector1024 = sakeBasicVector.map((val, idx) => {
      return alpha * val + (1 - alpha) * environmentVector1024[idx];
    });

    // 3. 後半 1024次元 (result) のテキストを作成
    // 味わい ＋ 香り ＋ 相性 ＋ コメント
    const aromaText = formatTasteProfile(reviewData.aroma);
    const tasteText = formatTasteProfile(reviewData.taste);
    const resultText = `香り:${aromaText} 味わい:${tasteText} 相性:${reviewData.rating || ''} コメント:${reviewData.comment || ''}`;
    const resultVector1024 = await generateEmbedding(ai, resultText, 1024);

    // 4. 2つを結合して2048次元にする
    const embedding = [...contextVector1024, ...resultVector1024];

    // 5. reviewsドキュメントに保存（onDocumentCreated のため再発火しません）
    await reviewSnap.ref.update({
      embedding: FieldValue.vector(embedding),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 6. sakesコレクションのembeddingを更新する
    // 基本情報（前半1024次元）はそのまま維持し、味わい・香り（後半1024次元）のみをレビューのresultで加重更新する
    const reviewCount = sakeData.reviewCount || 0;
    const updatedTastePart = sakeTasteVector.map((val, idx) => {
      return (reviewCount * val + resultVector1024[idx]) / (reviewCount + 1);
    });
    const updatedSakeEmbedding = [...sakeBasicVector, ...updatedTastePart];

    await sakeSnap.ref.update({
      embedding: FieldValue.vector(updatedSakeEmbedding),
      updatedAt: FieldValue.serverTimestamp(),
      reviewCount: FieldValue.increment(1),
    });

    // 7. ユーザーのtasteProfile（世間平均との差分ベクトル）を逐次更新
    if (reviewData.userId && sakeTasteVector.length === 1024 && resultVector1024.length === 1024) {
      try {
        const diffVector = resultVector1024.map((val, idx) => val - sakeTasteVector[idx]);
        const userRef = db.collection('users').doc(reviewData.userId);
        const userSnap = await userRef.get();

        if (userSnap.exists) {
          const userData = userSnap.data();
          const userTasteProfile = userData?.tasteProfile || {};
          const count = userTasteProfile.reviewCount || 0;
          const currentBias = userTasteProfile.biasVector || [];

          let newBiasVector: number[];
          if (Array.isArray(currentBias) && currentBias.length === diffVector.length && count > 0) {
            newBiasVector = currentBias.map(
              (v: number, i: number) => (v * count + diffVector[i]) / (count + 1),
            );
          } else {
            newBiasVector = diffVector;
          }

          await userRef.update({
            tasteProfile: {
              biasVector: newBiasVector,
              reviewCount: count + 1,
              updatedAt: FieldValue.serverTimestamp(),
            },
          });
        }
      } catch (userProfileErr) {
        console.error('Error updating user taste profile:', userProfileErr);
      }
    }

    console.log(`Successfully generated embedding for review ${event.params.reviewId}`);
  },
);

/**
 * 共通ベクトル検索ロジック
 * 2048次元のお酒ベクトル（前半1024: 基本情報, 後半1024: 味わい・香り）に対して、
 * findNearest で前半ベクトル、後半ベクトルそれぞれを検索し、
 * distanceResultField で取得した距離を見ながら順に取得・マージする。
 */
async function executeVectorSearch(
  queryVector: number[],
  searchLimit?: number,
): Promise<{ success: boolean; results: SakeSearchResult[] }> {
  const targetLimit =
    typeof searchLimit === 'number' && searchLimit > 0 && searchLimit < 100 ? searchLimit : 20;

  if (queryVector.length >= 2048) {
    // 2048次元クエリの場合（例: 他のお酒のembeddingで似た酒を検索する場合）
    const vectorQuery = db.collection('sakes').findNearest({
      vectorField: 'embedding',
      queryVector: FieldValue.vector(queryVector),
      limit: targetLimit,
      distanceMeasure: 'COSINE',
      distanceResultField: 'distance',
    });
    const snap = await vectorQuery.get();
    const results: SakeSearchResult[] = snap.docs.map((docSnap) => {
      const data = docSnap.data() as Sake;
      const distance = (data as any)?.distance ?? 0;
      const similarity = Math.min(1, Math.max(0, 1 - distance));
      return {
        ...data,
        id: docSnap.id,
        similarity,
        matchType: 'both' as const,
      };
    });
    return { success: true, results };
  }

  // 1024次元クエリの場合:
  // 前半ベクトル検索用（基本情報マッチ）: 前半1024次元にクエリ、後半1024次元を0埋め
  const basicQueryVector = [...queryVector, ...new Array(1024).fill(0)];
  const basicVectorQuery = db.collection('sakes').findNearest({
    vectorField: 'embedding',
    queryVector: FieldValue.vector(basicQueryVector),
    limit: targetLimit,
    distanceMeasure: 'COSINE',
    distanceResultField: 'distance',
  });

  // 後半ベクトル検索用（味わい・香りマッチ）: 前半1024次元を0埋め、後半1024次元にクエリ
  const tasteQueryVector = [...new Array(1024).fill(0), ...queryVector];
  const tasteVectorQuery = db.collection('sakes').findNearest({
    vectorField: 'embedding',
    queryVector: FieldValue.vector(tasteQueryVector),
    limit: targetLimit,
    distanceMeasure: 'COSINE',
    distanceResultField: 'distance',
  });

  // 並行してfindNearestクエリを実行
  const [basicSnap, tasteSnap] = await Promise.all([
    basicVectorQuery.get(),
    tasteVectorQuery.get(),
  ]);

  const basicDocs = basicSnap.docs;
  const tasteDocs = tasteSnap.docs;

  const basicDistMap = new Map<string, number>();
  basicDocs.forEach((d) => basicDistMap.set(d.id, (d.data() as any)?.distance ?? 1));

  const tasteDistMap = new Map<string, number>();
  tasteDocs.forEach((d) => tasteDistMap.set(d.id, (d.data() as any)?.distance ?? 1));

  // 距離を見ながら前半ベクトル、後半ベクトルの検索結果を順に取得する
  let i = 0;
  let j = 0;
  const results: SakeSearchResult[] = [];
  const seenIds = new Set<string>();

  while (results.length < targetLimit && (i < basicDocs.length || j < tasteDocs.length)) {
    const bDoc = i < basicDocs.length ? basicDocs[i] : null;
    const tDoc = j < tasteDocs.length ? tasteDocs[j] : null;

    let chosenDoc: DocumentSnapshot;

    if (bDoc && tDoc) {
      const bDist = (bDoc.data() as any)?.distance ?? 1;
      const tDist = (tDoc.data() as any)?.distance ?? 1;
      if (bDist <= tDist) {
        chosenDoc = bDoc;
        i++;
      } else {
        chosenDoc = tDoc;
        j++;
      }
    } else if (bDoc) {
      chosenDoc = bDoc;
      i++;
    } else {
      chosenDoc = tDoc!;
      j++;
    }

    if (seenIds.has(chosenDoc.id)) {
      continue;
    }
    seenIds.add(chosenDoc.id);

    const data = chosenDoc.data() as Sake;
    const bDist = basicDistMap.get(chosenDoc.id);
    const tDist = tasteDistMap.get(chosenDoc.id);

    // 距離（distance）から一致率（similarity）を算出
    // COSINE distance d に対して類似度は 1 - d。ゼロ埋め2048dのコサイン類似度スケール補正
    const bSim =
      bDist !== undefined ? Math.min(1, Math.max(0, (1 - bDist) * Math.SQRT2)) : undefined;
    const tSim =
      tDist !== undefined ? Math.min(1, Math.max(0, (1 - tDist) * Math.SQRT2)) : undefined;

    let matchType: 'basic' | 'taste' | 'both';
    let similarity: number;

    if (bSim !== undefined && tSim !== undefined) {
      similarity = Math.max(bSim, tSim);
      if (Math.abs(bSim - tSim) < 0.05) {
        matchType = 'both';
      } else if (bSim > tSim) {
        matchType = 'basic';
      } else {
        matchType = 'taste';
      }
    } else if (bSim !== undefined) {
      similarity = bSim;
      matchType = 'basic';
    } else {
      similarity = tSim ?? 0;
      matchType = 'taste';
    }

    results.push({
      ...data,
      id: chosenDoc.id,
      similarity,
      basicSimilarity: bSim,
      tasteSimilarity: tSim,
      matchType,
    });
  }

  return { success: true, results };
}

/**
 * 自然言語日本酒検索 (ベクトル指定)
 */
export const searchSakesByVector = onCall(async (request: CallableRequest) => {
  const { queryVector, limit: searchLimit } = request.data || {};
  if (!queryVector || !Array.isArray(queryVector)) {
    throw new HttpsError('invalid-argument', 'queryVector が指定されていないか無効です。');
  }

  try {
    return await executeVectorSearch(queryVector, searchLimit);
  } catch (err: any) {
    console.error('Error during vector search in Cloud Functions:', err);
    throw new HttpsError('internal', err.message || 'ベクトル検索の実行中にエラーが発生しました。');
  }
});

/**
 * 自然言語日本酒検索 (テキスト指定)
 */
export const searchSakesByText = onCall(
  {
    secrets: [geminiApiKey],
    cors: true,
  },
  async (request: CallableRequest) => {
    const { queryText, limit: searchLimit } = request.data || {};
    if (!queryText || typeof queryText !== 'string') {
      throw new HttpsError('invalid-argument', 'queryText が指定されていません。');
    }

    try {
      const ai = new GoogleGenAI({ apiKey: resolveApiKey() });
      const queryVector = await generateEmbedding(ai, queryText, 1024);
      return await executeVectorSearch(queryVector, searchLimit);
    } catch (err: any) {
      console.error('Error during text search in Cloud Functions:', err);
      throw new HttpsError(
        'internal',
        err.message || '自然言語検索の実行中にエラーが発生しました。',
      );
    }
  },
);

/**
 * 日本酒のembeddingを再構築する
 * 原則すでにあるembeddingを利用。GoogleGenAIは使わない。
 * spec=true が指定された場合のみ、前半の基本情報・スペックのembeddingも作成し直す。
 */
async function rebuildSakeEmbedding(
  docSnap: DocumentSnapshot,
  rebuildSpec: boolean = false,
): Promise<boolean> {
  const data = docSnap.data() as Sake | undefined;
  if (!data) return false;
  console.log(
    `Processing sake ${docSnap.id} for embedding rebuild (rebuildSpec: ${rebuildSpec})...`,
  );

  const reviewsSnapshot = await db.collection('reviews').where('sakeId', '==', docSnap.id).get();

  try {
    const sakeEmbedding: number[] = Array.isArray(data.embedding)
      ? data.embedding
      : (data.embedding as any)?.toArray?.() || [];

    // 1. 前半 1024次元: 基本情報（銘柄、酒蔵、ボトル、特徴）
    let basicVector1024: number[];
    if (rebuildSpec) {
      // spec=true のときのみ GoogleGenAI で基本情報を再作成
      const apiKey = resolveApiKey();
      const ai = new GoogleGenAI({ apiKey });
      const basicText = buildSakeBasicText(data);
      basicVector1024 = await generateEmbedding(ai, basicText, 1024);
    } else {
      // 原則: すでにあるembeddingを利用（GoogleGenAIは使わない）
      if (sakeEmbedding.length >= 1024) {
        basicVector1024 = sakeEmbedding.slice(0, 1024);
      } else {
        // 既存embeddingが全くない場合のみフォールバックで作成
        const apiKey = resolveApiKey();
        const ai = new GoogleGenAI({ apiKey });
        const basicText = buildSakeBasicText(data);
        basicVector1024 = await generateEmbedding(ai, basicText, 1024);
      }
    }

    // 2. 後半 1024次元: レビュー群の後半1024次元（result成分）の重心。GoogleGenAIは使わない。
    let tasteVector1024: number[];
    const resultEmbeddings: number[][] = [];

    if (!reviewsSnapshot.empty) {
      reviewsSnapshot.forEach((reviewDoc) => {
        const reviewData = reviewDoc.data();
        if (reviewData.embedding) {
          const arr = Array.isArray(reviewData.embedding)
            ? reviewData.embedding
            : (reviewData.embedding as any)?.toArray?.() || [];
          if (arr.length >= 2048) {
            resultEmbeddings.push(arr.slice(1024, 2048));
          } else if (arr.length >= 1024) {
            resultEmbeddings.push(arr.slice(0, 1024));
          }
        }
      });
    }

    if (resultEmbeddings.length > 0) {
      tasteVector1024 = getMeanVector(resultEmbeddings);
    } else {
      // レビューがない場合: すでにあるembeddingの後半、もしくは前半ベクトルを流用（GoogleGenAIは使わない）
      if (sakeEmbedding.length >= 2048) {
        tasteVector1024 = sakeEmbedding.slice(1024, 2048);
      } else {
        tasteVector1024 = [...basicVector1024];
      }
    }

    // 3. 2048次元に結合してFirestoreに保存
    const finalEmbedding = [...basicVector1024, ...tasteVector1024];

    console.log(
      `Updating sake ${docSnap.id} with 2048d embedding (reviews: ${resultEmbeddings.length}, rebuildSpec: ${rebuildSpec})`,
    );
    await docSnap.ref.update({
      embedding: FieldValue.vector(finalEmbedding),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error(`Failed embedding for sake ${docSnap.id}:`, err);
    return false;
  }
}

/**
 * 管理者用: すべての日本酒の埋め込みと updatedAt タイムスタンプを再生成する。
 * queryString や request.data で spec=true が指定されたら、前半のembeddingも作成し直す。
 */
export const rebuildAllSakeEmbeddings = onCall(async (request: CallableRequest) => {
  const isAdmin = await checkIsAdmin(request.auth);
  if (!isAdmin) {
    throw new HttpsError('permission-denied', '管理者権限が必要です。');
  }

  const specParam =
    request.data?.spec === true ||
    request.data?.spec === 'true' ||
    (request as any).rawRequest?.query?.spec === 'true';

  const sakesSnap = await db.collection('sakes').get();

  let count = 0;
  for (const docSnap of sakesSnap.docs) {
    const success = await rebuildSakeEmbedding(docSnap, specParam);
    if (success) {
      count++;
    }
  }

  return { success: true, count, total: sakesSnap.size };
});

/**
 * Callable Function (Admin Only): Rebuild embedding and updatedAt timestamp for a single sake by ID.
 * queryString や request.data で spec=true が指定されたら、前半のembeddingも作成し直す。
 */
export const rebuildSakeEmbeddingById = onCall(async (request: CallableRequest) => {
  const isAdmin = await checkIsAdmin(request.auth);
  if (!isAdmin) {
    throw new HttpsError('permission-denied', '管理者権限が必要です。');
  }

  const { sakeId } = request.data || {};
  if (!sakeId) {
    throw new HttpsError('invalid-argument', 'sakeId が指定されていません。');
  }

  const specParam =
    request.data?.spec === true ||
    request.data?.spec === 'true' ||
    (request as any).rawRequest?.query?.spec === 'true';

  const docRef = db.collection('sakes').doc(sakeId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new HttpsError('not-found', '指定された日本酒が見つかりません。');
  }

  const success = await rebuildSakeEmbedding(docSnap, specParam);
  if (!success) {
    throw new HttpsError('internal', '日本酒の埋め込みの再生成に失敗しました。');
  }

  return { success: true, sakeId };
});

export const rebuildSakeNetworkData = onCall(
  {
    secrets: [geminiApiKey],
    cors: true,
    timeoutSeconds: 180,
  },
  async (request: CallableRequest) => {
    try {
      const BATCH_SIZE = 100;
      let lastDoc: DocumentSnapshot | null = null;
      let hasMore = true;

      const docs: { id: string; name: string; info: string }[] = [];
      const contextEmbeddings1024: number[][] = [];

      // 1. 100件ずつのバッチ処理でFirestoreから安全に全レビューを走査（メモリ上限対策）
      while (hasMore) {
        let query = db.collection('sakes').orderBy('createdAt', 'desc').limit(BATCH_SIZE);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        snapshot.forEach((doc) => {
          const data = doc.data() as Partial<Sake>;
          if (data.embedding) {
            docs.push({
              id: doc.id,
              name: `${data.brewery} - ${data.brand} - ${data.bottle}` || '不明な銘柄',
              info: `${data.description}`,
            });

            // クラスタリングに使用するembeddingだけを切り出してメモリに保持
            contextEmbeddings1024.push(data.embedding.toArray());
          }
        });

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.docs.length < BATCH_SIZE) {
          hasMore = false;
        }
      }

      // レビューデータが1件もない場合は空で返す
      if (docs.length === 0) {
        const emptyResponse: NetworkResponse = { nodes: [], links: [] };
        return emptyResponse;
      }

      // 2. ml-kmeans を使って「前半のcontext（状態）」だけでクラスタリングを実行
      // データ数に応じてグループ数を自動調整（最低3、最大8クラスタ）
      const K = Math.max(3, Math.min(8, Math.floor(docs.length / 10)));
      const ans = kmeans(contextEmbeddings1024, K, { initialization: 'kmeans++' });
      const clusterIds: number[] = ans.clusters;
      const centroids: number[][] = ans.centroids;

      const centroidPromises = centroids.map(async (centroid, index) => {
        await db
          .collection('clusterSakes')
          .doc(index.toString())
          .set({
            centroid: FieldValue.vector(centroid),
            createdAt: FieldValue.serverTimestamp(),
          });
      });

      // ノード（点）データの完成
      const nodes: NetworkNode[] = docs.map((doc, index) => ({
        id: doc.id,
        label: doc.name,
        cluster: clusterIds[index],
        info: doc.info,
      }));

      // 3. Firestoreのベクトル検索（Vector Search）を活用して、各レビューに近いデータを高速抽出（リンク作成）
      const links: NetworkLink[] = [];
      const linkSet = new Set<string>(); // 重複リンク（A->B と B->A）を排除する用

      const LIMIT_PER_NODE = 4; // 各レビューから伸ばす線の最大数（スパゲッティ化防止）
      const SIMILARITY_THRESHOLD = 0.2; // 類似度80%以上の「かなり近い体験」だけを結ぶ

      // 各ノードを起点に、最もベクトルが近いレビューをFirestoreにパラレルで問い合わせる
      const linkPromises = docs.map(async (doc, index) => {
        const vectorQuery = db.collection('sakes').findNearest({
          vectorField: 'embedding',
          queryVector: FieldValue.vector([
            ...contextEmbeddings1024[index],
            ...new Array(1024).fill(0),
          ]),
          limit: LIMIT_PER_NODE + 1, // 自分自身が含まれるため +1
          distanceMeasure: 'COSINE',
          distanceResultField: 'distance',
        });

        const querySnapshot = await vectorQuery.get();

        querySnapshot.forEach((neighborDoc) => {
          if (neighborDoc.id === doc.id) return; // 自分自身へのリンクはスキップ

          // コサイン類似度の距離スコアを取得
          const neighborData = neighborDoc.data();
          const distance = (neighborData as any).distance ?? 0;

          if (distance >= SIMILARITY_THRESHOLD) {
            const linkKey = [doc.id, neighborDoc.id].sort().join('-');

            if (!linkSet.has(linkKey)) {
              linkSet.add(linkKey);
              links.push({
                source: doc.id,
                target: neighborDoc.id,
                weight: distance,
              });
            }
          }
        });
      });

      // 並列実行の完了を待つ
      await Promise.all([...linkPromises, ...centroidPromises]);

      // 4. フロントエンドがそのまま解釈できるクリーンなオブジェクト構造で返却
      const responseData: NetworkResponse = { nodes, links };

      // 5. Firestoreに保存（フロントエンドが毎回再計算せずに読み取れるようにキャッシュ）
      await db.collection('sakeNetwork').doc('latest').set({
        nodes,
        links,
        nodeCount: nodes.length,
        linkCount: links.length,
        clusterCount: K,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(
        `Saved sake network to Firestore: ${nodes.length} nodes, ${links.length} links, ${K} clusters`,
      );

      return responseData;
    } catch (error) {
      console.error('Error creating sake network API:', error);
      throw new HttpsError('internal', 'Internal Server Error');
    }
  },
);

export const getNetworkDataVector = onCall(async (request: CallableRequest) => {
  const doc = await db.collection('sakeNetwork').doc('latest').get();

  if (!doc.exists) {
    throw new HttpsError(
      'not-found',
      'ネットワークデータがまだ生成されていません。管理者に「クラスタ一括更新」を依頼してください。',
    );
  }

  const data = doc.data()!;
  const response: NetworkResponse = {
    nodes: data.nodes || [],
    links: data.links || [],
  };

  return response;
});
