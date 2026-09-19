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

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const geminiApiKey = defineSecret('GEMINI_API_KEY');

function resolveApiKey(): string {
  try {
    return geminiApiKey.value();
  } catch {
    return process.env.GEMINI_API_KEY || '';
  }
}

async function generateEmbedding(ai: GoogleGenAI, text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: 'models/gemini-embedding-001',
    contents: text,
    config: {
      outputDimensionality: 2048, // 👈 Firestoreの上限に合わせる
    },
  });

  const values = (response as any).embedding?.values || response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error('Embedding values not returned by Gemini API');
  }

  return values;
}

function buildSakeText(sake: any): string {
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
    const afterData = afterSnap.data();

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
      const vectorValues = await generateEmbedding(ai, sakeText);

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

/**
 * Callable Function to perform Vector Similarity Search for Sakes.
 */
export const searchSakesByVector = onCall(
  {
    secrets: [geminiApiKey],
  },
  async (request: CallableRequest) => {
    const { queryText, limit: searchLimit } = request.data || {};
    if (!queryText || typeof queryText !== 'string') {
      throw new HttpsError('invalid-argument', 'queryText が指定されていません。');
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GEMINI_API_KEYが設定されていません。');
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const queryVector = await generateEmbedding(ai, queryText.trim());

      const targetLimit = typeof searchLimit === 'number' && searchLimit > 0 ? searchLimit : 20;
      console.log(
        `Performing vector search for query: "${queryText}" with limit: ${targetLimit} vector values length: ${queryVector.length}`,
      );
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
      throw new HttpsError(
        'internal',
        err.message || 'ベクトル検索の実行中にエラーが発生しました。',
      );
    }
  },
);

/**
 * Callable Function (Admin Only): Rebuild embeddings and updatedAt timestamps for all sakes.
 */
export const rebuildAllSakeEmbeddings = onCall(
  {
    secrets: [geminiApiKey],
  },
  async (request: CallableRequest) => {
    const isAdmin = await checkIsAdmin(request.auth);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', '管理者権限が必要です。');
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GEMINI_API_KEYが設定されていません。');
    }

    const ai = new GoogleGenAI({ apiKey });
    const sakesSnap = await db.collection('sakes').get();

    let count = 0;
    for (const docSnap of sakesSnap.docs) {
      const data = docSnap.data();
      const sakeText = buildSakeText(data);
      if (!sakeText) continue;

      try {
        const vectorValues = await generateEmbedding(ai, sakeText);
        await docSnap.ref.update({
          embedding: FieldValue.vector(vectorValues),
          updatedAt: FieldValue.serverTimestamp(),
        });
        count++;
      } catch (err) {
        console.error(`Failed embedding for sake ${docSnap.id}:`, err);
      }
    }

    return { success: true, count, total: sakesSnap.size };
  },
);

/**
 * Callable Function (Admin Only): Rebuild embedding and updatedAt timestamp for a single sake by ID.
 */
export const rebuildSakeEmbeddingById = onCall(
  {
    secrets: [geminiApiKey],
  },
  async (request: CallableRequest) => {
    const isAdmin = await checkIsAdmin(request.auth);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', '管理者権限が必要です。');
    }

    const { sakeId } = request.data || {};
    if (!sakeId) {
      throw new HttpsError('invalid-argument', 'sakeId が指定されていません。');
    }

    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'GEMINI_API_KEYが設定されていません。');
    }

    const docRef = db.collection('sakes').doc(sakeId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      throw new HttpsError('not-found', '指定された日本酒が見つかりません。');
    }

    const ai = new GoogleGenAI({ apiKey });
    const sakeText = buildSakeText(docSnap.data());
    const vectorValues = await generateEmbedding(ai, sakeText);

    await docRef.update({
      embedding: FieldValue.vector(vectorValues),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true, sakeId };
  },
);
