import {
  onDocumentWritten,
  FirestoreEvent,
  Change,
  DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { NetworkLink, NetworkNode, NetworkResponse, Review, Sake } from './type';
import { kmeans } from 'ml-kmeans';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const QUEST_TEMPERATURE_OPTIONS = [
  '雪冷え (5℃)',
  '花冷え (10℃)',
  '涼冷え (15℃)',
  '常温 (20℃)',
  'ぬる燗 (40℃)',
  '上燗 (45℃)',
  '熱燗 (50℃)',
  '飛び切り燗 (55℃〜)',
];

const QUEST_PAIRING_OPTIONS = [
  '白身魚の刺身',
  '和牛ステーキ',
  'ハードチーズ',
  'うなぎの蒲焼き',
  '焼き鳥（タレ）',
  '塩辛',
];

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

function buildSakeText(sake: Sake): string {
  if (!sake) return '';

  const brand = sake.brand || '';
  const brewery = sake.brewery || '';
  const bottle = sake.bottle || '';
  const description = sake.description || '';
  return `銘柄: ${brand}, 酒蔵: ${brewery}, 種別: ${bottle}, 特徴: ${description}`.trim();
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

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((item): item is number => typeof item === 'number');
  return (value as { toArray?: () => number[] } | undefined)?.toArray?.() || [];
}

function cosineDistance(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }

  if (leftNorm === 0 || rightNorm === 0) return 1;
  return 1 - dot / Math.sqrt(leftNorm * rightNorm);
}

type QuestRecommendationCandidate = {
  sakeId: string;
  sakeBrand: string;
  sakeBottle: string;
  targetTemperature: string;
  targetPairing: string;
  contextEmbedding: number[];
  distanceFromReviews: number;
};

/** Finds quest conditions in sparse areas of the review context space. */
export const recommendQuestConditions = onCall(
  { secrets: [geminiApiKey], cors: true, timeoutSeconds: 120 },
  async (request: CallableRequest) => {
    const { sakeId, targetTemperature, targetPairing, targetVessel } = request.data || {};
    const sakesSnapshot = await db.collection('sakes').limit(80).get();
    const sakes = sakesSnapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Sake }))
      .filter(({ data }) => toNumberArray(data.embedding).length >= 1024);

    if (sakes.length === 0) {
      throw new HttpsError('failed-precondition', '埋め込み済みの日本酒がありません。');
    }

    const selectedSake = sakeId ? sakes.find((sake) => sake.id === sakeId) : undefined;
    const candidateSakes = selectedSake ? [selectedSake] : sakes.slice(0, 8);
    const temperatures = targetTemperature
      ? [targetTemperature]
      : QUEST_TEMPERATURE_OPTIONS.slice(0, 4);
    const pairings = targetPairing ? [targetPairing] : QUEST_PAIRING_OPTIONS.slice(0, 4);
    const vessel =
      typeof targetVessel === 'string' && targetVessel.trim() ? targetVessel : '指定なし';
    const ai = new GoogleGenAI({ apiKey: resolveApiKey() });
    const candidates: QuestRecommendationCandidate[] = [];

    for (const sake of candidateSakes) {
      const sakeData = sake.data;
      const sakeText = buildSakeText(sakeData);
      const sakeEmbedding = toNumberArray(sakeData.embedding).slice(0, 1024);

      for (const temperature of temperatures) {
        for (const pairing of pairings) {
          const contextText = `${sakeText} 温度:${temperature} 酒器:${vessel} おつまみ:${pairing}`;
          const environmentEmbedding = await generateEmbedding(ai, contextText, 1024);
          const contextEmbedding = sakeEmbedding.map(
            (value, index) => 0.5 * value + 0.5 * environmentEmbedding[index],
          );
          // reviews.embedding is 2048-dimensional. Zeroing the result half
          // makes the nearest-neighbor query respond to the context half.
          const paddedEmbedding = [...contextEmbedding, ...new Array(1024).fill(0)];
          const nearestReviewQuery = db.collection('reviews').findNearest({
            vectorField: 'embedding',
            queryVector: FieldValue.vector(paddedEmbedding),
            limit: 1,
            distanceMeasure: 'COSINE',
            distanceResultField: 'distance',
          });
          const nearestReviewSnapshot = await nearestReviewQuery.get();
          const nearestReviewDistance = nearestReviewSnapshot.empty
            ? 1
            : ((nearestReviewSnapshot.docs[0].data() as { distance?: number }).distance ?? 1);

          candidates.push({
            sakeId: sake.id,
            sakeBrand: sakeData.brand || '',
            sakeBottle: sakeData.bottle || '',
            targetTemperature: temperature,
            targetPairing: pairing,
            contextEmbedding,
            distanceFromReviews: nearestReviewDistance,
          });
        }
      }
    }

    const selected: QuestRecommendationCandidate[] = [];
    while (candidates.length > 0 && selected.length < 3) {
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;

      candidates.forEach((candidate, index) => {
        const distanceFromSelected = selected.length
          ? Math.min(
              ...selected.map((item) =>
                cosineDistance(candidate.contextEmbedding, item.contextEmbedding),
              ),
            )
          : 1;
        const score = candidate.distanceFromReviews * 0.8 + distanceFromSelected * 0.2;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      selected.push(candidates.splice(bestIndex, 1)[0]);
    }

    return {
      recommendations: selected.map((candidate) => ({
        sakeId: candidate.sakeId,
        sakeBrand: candidate.sakeBrand,
        sakeBottle: candidate.sakeBottle,
        targetTemperature: candidate.targetTemperature,
        targetPairing: candidate.targetPairing,
        title: `【${candidate.sakeBrand}】${candidate.targetPairing}との未知のペアリングを探せ`,
        description: '過去のレビューと異なる条件を、空間充填アプローチで選出しました。',
        rewardPoints: 125,
      })),
    };
  },
);

/**
 * Triggered automatically when a Sake document is created or updated.
 * Generates embedding using Gemini models/gemini-embedding-001 and updates document with FieldValue.vector and updatedAt.
 */
export const onSakeWrite = onDocumentWritten(
  {
    document: 'sakes/{sakeId}',
    secrets: [geminiApiKey],
  },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { sakeId: string }>) => {
    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists) {
      return;
    }

    const beforeData = event.data?.before?.data();
    const afterData = afterSnap.data() as Sake | undefined;

    if (!afterData) return;

    // Prevent infinite loop if update was only embedding/updatedAt
    if (beforeData) {
      const contentChanged =
        beforeData.brand !== afterData?.brand ||
        beforeData.brewery !== afterData?.brewery ||
        beforeData.bottle !== afterData?.bottle ||
        beforeData.description !== afterData?.description;

      if (!contentChanged && afterData?.embedding) {
        return;
      }
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not set');
      return;
    }

    const sakeText = buildSakeText(afterData);
    if (!sakeText) return;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const vectorValues = await generateEmbedding(ai, sakeText, 1024);

      await afterSnap.ref.update({
        embedding: FieldValue.vector(vectorValues),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`Successfully generated embedding for sake ${event.params.sakeId}`);
    } catch (err) {
      console.error(`Error generating embedding for sake ${event.params.sakeId}:`, err);
    }
  },
);

// レビュー追加時に動くFunctionsのイメージ
export const onReviewCreated = onDocumentWritten(
  {
    document: 'reviews/{reviewId}',
    secrets: [geminiApiKey],
  },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { reviewId: string }>) => {
    const reviewSnap = event.data?.after;
    if (!reviewSnap || !reviewSnap.exists) {
      return;
    }

    const reviewData = reviewSnap.data() as Review | undefined;
    if (!reviewData) return;

    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists) {
      return;
    }

    const beforeData = event.data?.before?.data();

    // Prevent infinite loop if update was only embedding/updatedAt
    if (beforeData) {
      const contentChanged =
        beforeData.aroma !== reviewData?.aroma ||
        beforeData.comment !== reviewData?.comment ||
        beforeData.pairing !== reviewData?.pairing ||
        beforeData.rating !== reviewData?.rating ||
        beforeData.taste !== reviewData?.taste ||
        beforeData.temperature !== reviewData?.temperature ||
        beforeData.userId !== reviewData?.userId ||
        beforeData.vessel !== reviewData?.vessel;

      if (!contentChanged && reviewData?.embedding) {
        return;
      }
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

    // 2. 前半 1024次元 (context) のテキストを作成
    // お酒のスペック ＋ 温度 ＋ 酒器 ＋ おつまみ
    const contextText = `${sakeText} 温度:${reviewData.temperature} 酒器:${reviewData.vessel} おつまみ:${reviewData.pairing}`;
    const environmentVector1024 = await generateEmbedding(ai, contextText, 1024);

    // 【ここが変化！】お酒のベクトルと環境のベクトルをブレンド（例: 7:3 や 5:5）して前半のcontextとする
    const alpha = 0.5; // お酒本来の個性を高めに維持するブレンド比率
    const contextVector1024 = sakeEmbedding.map((val, idx) => {
      return alpha * val + (1 - alpha) * environmentVector1024[idx];
    });

    // 3. 後半 1024次元 (result) のテキストを作成
    // 味わい ＋ 香り ＋ 相性
    const resultText = `香り:${reviewData.aroma} 味わい:${reviewData.taste} 相性:${reviewData.rating}`;
    const resultVector1024 = await generateEmbedding(ai, resultText, 1024);

    // 4. 2つを結合して2048次元にする
    const embedding = [...contextVector1024, ...resultVector1024];

    // 5. reviewsドキュメントに保存
    await reviewSnap.ref.update({
      embedding: FieldValue.vector(embedding),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 6. sakesコレクションのembeddingを更新する
    // 既存のsakeEmbeddingと、レビューの後半1024次元をブレンドして更新する
    const reviewCount = sakeData.reviewCount || 0;
    const updatedSakeEmbedding = sakeEmbedding.map((val, idx) => {
      return (reviewCount * val + resultVector1024[idx]) / (reviewCount + 1);
    });

    await sakeSnap.ref.update({
      embedding: FieldValue.vector(updatedSakeEmbedding),
      updatedAt: FieldValue.serverTimestamp(),
      reviewCount: FieldValue.increment(1),
    });
    console.log(`Successfully generated embedding for review ${event.params.reviewId}`);
  },
);

/**
 * 自然言語日本酒検索
 */
export const searchSakesByVector = onCall(async (request: CallableRequest) => {
  const { queryVector, limit: searchLimit } = request.data || {};
  if (!queryVector) {
    throw new HttpsError('invalid-argument', 'queryVector が指定されていません。');
  }

  try {
    const targetLimit =
      typeof searchLimit === 'number' && searchLimit > 0 && searchLimit < 100 ? searchLimit : 20;

    const vectorQuery = db.collection('sakes').findNearest({
      vectorField: 'embedding',
      queryVector: FieldValue.vector(queryVector),
      limit: targetLimit,
      distanceMeasure: 'COSINE',
    });

    const snap = await vectorQuery.get();
    const results = snap.docs.map((docSnap: any) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    return { success: true, results };
  } catch (err: any) {
    console.error('Error during vector search in Cloud Functions:', err);
    throw new HttpsError('internal', err.message || 'ベクトル検索の実行中にエラーが発生しました。');
  }
});

/**
 * 自然言語日本酒検索
 */
export const searchSakesByText = onCall(
  {
    secrets: [geminiApiKey],
    cors: true,
  },
  async (request: CallableRequest) => {
    const { queryText, limit: searchLimit } = request.data || {};
    if (!queryText || typeof queryText != 'string') {
      throw new HttpsError('invalid-argument', 'queryText が指定されていません。');
    }

    try {
      const ai = new GoogleGenAI({ apiKey: resolveApiKey() });
      const queryVector = await generateEmbedding(ai, queryText, 1024);

      const targetLimit =
        typeof searchLimit === 'number' && searchLimit > 0 && searchLimit < 100 ? searchLimit : 20;

      const vectorQuery = db.collection('sakes').findNearest({
        vectorField: 'embedding',
        queryVector: FieldValue.vector(queryVector),
        limit: targetLimit,
        distanceMeasure: 'COSINE',
      });

      const snap = await vectorQuery.get();
      const results = snap.docs.map((docSnap: any) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      return { success: true, results };
    } catch (err: any) {
      console.error('Error during text search in Cloud Functions:', err);
      throw new HttpsError(
        'internal',
        err.message || 'ベクトル検索の実行中にエラーが発生しました。',
      );
    }
  },
);

async function rebuildSakeEmbedding(docSnap: DocumentSnapshot): Promise<boolean> {
  const data = docSnap.data() as Sake | undefined;
  if (!data) return false;
  console.log(
    `Processing sake ${docSnap.id} for embedding rebuild... initial embedding length: ${Array.isArray(data.embedding) ? data.embedding.length : 0}`,
  );
  // 1. このお酒に対するレビューをすべて取得
  const reviewsSnapshot = await db.collection('reviews').where('sakeId', '==', docSnap.id).get();

  try {
    const sakeEmbedding: number[] = Array.isArray(data.embedding)
      ? data.embedding
      : (data.embedding as any)?.toArray?.() || [];

    let finalEmbedding = [...sakeEmbedding.slice(0, 1024)]; // 既存の埋め込みをコピー

    if (!reviewsSnapshot.empty) {
      const resultEmbeddings: number[][] = [];

      reviewsSnapshot.forEach((reviewDoc) => {
        const reviewData = reviewDoc.data();
        if (reviewData.embedding) {
          // 後半の1024次元（result成分）を切り出す
          const resultPart = reviewData.embedding.toArray().slice(1024, 2048);
          resultEmbeddings.push(resultPart);
        }
      });

      if (resultEmbeddings.length > 0) {
        // 2. レビューのresultベクトルたちの平均（重心）を計算
        const averageReviewVector = getMeanVector(resultEmbeddings);

        // 3. スペックベクトルとレビュー平均ベクトルをブレンド (例: 50%ずつ)
        // データ数に応じてブレンド比率を動的に変えるとさらに高精度になります
        const alpha = 0.5;
        finalEmbedding = finalEmbedding.map((val, idx) => {
          return alpha * val + (1 - alpha) * averageReviewVector[idx];
        });
      }
    }
    console.log(
      `Updating embedding for sake ${docSnap.id} with final embedding length: ${finalEmbedding.length}`,
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
 */
export const rebuildAllSakeEmbeddings = onCall(async (request: CallableRequest) => {
  const isAdmin = await checkIsAdmin(request.auth);
  if (!isAdmin) {
    throw new HttpsError('permission-denied', '管理者権限が必要です。');
  }

  const sakesSnap = await db.collection('sakes').get();

  let count = 0;
  for (const docSnap of sakesSnap.docs) {
    const success = await rebuildSakeEmbedding(docSnap);
    if (success) {
      count++;
    }
  }

  return { success: true, count, total: sakesSnap.size };
});

/**
 * Callable Function (Admin Only): Rebuild embedding and updatedAt timestamp for a single sake by ID.
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

  const docRef = db.collection('sakes').doc(sakeId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new HttpsError('not-found', '指定された日本酒が見つかりません。');
  }

  const success = await rebuildSakeEmbedding(docSnap);
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
          queryVector: FieldValue.vector(contextEmbeddings1024[index]),
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
