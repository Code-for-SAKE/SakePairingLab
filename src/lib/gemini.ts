import { GoogleGenAI } from '@google/genai';

/**
 * Retrieves the Gemini API key.
 * Priority:
 * 1. Environment variable (server side)
 * 2. Vite env variable (client side build)
 * 3. Browser's secure storage (localStorage) set by the user.
 * If not found, prompts the user to input their API key and stores it securely.
 */
export async function getApiKey(): Promise<string> {
  // Server or build-time environment variables
  const envKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (envKey) return envKey;

  // Browser storage (localStorage). Use a namespaced key.
  const storageKey = 'gemini_api_key';
  let stored = '';
  try {
    stored = localStorage.getItem(storageKey) ?? '';
  } catch {
    // localStorage may be unavailable (e.g., SSR). Ignore.
  }
  if (stored) return stored;

  return '';
}

/**
 * Allows the user to update their stored Gemini API key.
 * This can be called from any UI component.
 */
export function setUserApiKey(key: string) {
  try {
    localStorage.setItem('gemini_api_key', key);
  } catch {
    // ignore errors
  }
}

/**
 * Wrapper to obtain API key before generating content.
 */
async function resolveApiKey(): Promise<string> {
  const key = await getApiKey();
  if (!key) {
    throw new Error('GEMINI_API_KEYが設定されていません。APIキーを入力してください。');
  }
  return key;
}

export async function generateTasteComment({
  type,
  selectedWords,
  pastComments,
}: {
  type: '香りの印象' | '味わいの印象';
  selectedWords: string[];
  pastComments: string[];
}): Promise<string> {
  const apiKey = await resolveApiKey();

  const ai = new GoogleGenAI({ apiKey });

  const pastCommentsText = pastComments.length > 0
    ? pastComments.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '（過去の投稿履歴なし）';

  const selectedWordsText = selectedWords.length > 0
    ? selectedWords.join('、')
    : '（未選択）';

  const prompt = `
あなたは日本酒のテイスティングレビュー作成を支援するAIアシスタントです。
ユーザーが選択した「${type}」の特徴ワードと、そのユーザーが過去に投稿した直近のレビューコメントを参考にして、自由入力欄にぴったりなコメント（50文字程度）を1つ生成してください。

【今回ユーザーが選択した特徴ワード】
${selectedWordsText}

【ユーザーの過去投稿コメント履歴（最新最大30件）】
${pastCommentsText}

【生成ルール】
1. 選択された特徴ワードのニュアンス（香りや味わい）をしっかり反映させてください。
2. ユーザーの過去コメントがある場合は、その文体・語調・好みのトーン（例：率直、感嘆、詳細、シンプルなど）に合わせてください。
3. 全体の文字数は「50文字程度」（目安40〜60文字）にまとめてください。
4. 解説や「」などのカギ括弧、前置きは一切含めず、入力欄にそのまま入るコメント本文のみを出力してください。
`.trim();

  const response = await ai.models.generateContent({
    model: 'models/gemini-3.6-flash',
    contents: prompt,
  });

  const text = (response.text || '').trim();
  // 外側の余分なカギ括弧や引用符があれば除去
  return text.replace(/^["「](.*)["」]$/, '$1').trim();
}

/**
 * Generates text embedding for search query using Gemini text-embedding-004.
 */
export async function generateQueryEmbedding(text: string): Promise<number[]> {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.embedContent({
    model: 'models/gemini-embedding-001',
    contents: text,
  });

  const values = (response as any).embedding?.values || response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error('ベクトルデータ（Embedding）の生成に失敗しました。');
  }

  return values;
}

