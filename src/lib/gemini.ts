import { GoogleGenAI, Modality } from '@google/genai';
import { RecommendQuest } from '../types';

/**
 * Retrieves the Gemini API key.
 * Priority:
 * 1. Environment variable (server side)
 * 2. Vite env variable (client side build)
 * 3. Browser's secure storage (localStorage) set by the user.
 * If not found, prompts the user to input their API key and stores it securely.
 */
function getApiKey(): string {
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
export function hasUserApiKey() {
  // Browser storage (localStorage). Use a namespaced key.
  const storageKey = 'gemini_api_key';
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return true;
  } catch {
    return false;
    // localStorage may be unavailable (e.g., SSR). Ignore.
  }
  return false;
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
    throw new Error(
      'GEMINI_API_KEYが設定されていません。マイページから有効なAPIキーを設定してください。',
    );
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

  const pastCommentsText =
    pastComments.length > 0
      ? pastComments.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : '（過去の投稿履歴なし）';

  const selectedWordsText = selectedWords.length > 0 ? selectedWords.join('、') : '（未選択）';

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
export async function generateQueryEmbedding(text: string, dimension: number): Promise<number[]> {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.embedContent({
    model: 'models/gemini-embedding-001',
    contents: text,
    config: {
      outputDimensionality: dimension, // 👈 Firestoreの上限は2048まで
    },
  });

  const values = (response as any).embedding?.values || response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error('ベクトルデータ（Embedding）の生成に失敗しました。');
  }

  return values;
}

/**
 * Generates prompt text from embedding
 */
export async function generateFlavorImagePrompt(
  name: string,
  embedding: number[],
): Promise<string> {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // 3. 【ステップ1】1024次元ベクトルを画像用英語プロンプトに逆翻訳
  const textPrompt = `You are a data visualizer. Below is a 1024-dimensional embedding vector representing the flavor profile of the Japanese sake "${name}":
      [${embedding.join(', ')}]
      Based on this semantic vector data, interpret its characteristics and generate a detailed English image prompt for an abstract digital art that visualizes this sake's taste and aroma.
      Output ONLY the final image prompt text in English.`;

  const promptResponse = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: textPrompt,
  });

  const generatedVisualPrompt =
    'An abstract, elegant digital painting visualizing a premium sensory experience of Japanese sake. NO TEXT. Prompt: ' +
    promptResponse.text;
  if (!generatedVisualPrompt) {
    throw new Error('画像用プロンプトの生成に失敗しました。');
  }

  console.log('Generated Visual Prompt:', generatedVisualPrompt);

  return generatedVisualPrompt;
}

/**
 * Generates text from embedding
 */
export async function generateFlavorImage(
  prompt: string,
): Promise<{ base64Data: string; mimeType: string }> {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // 4. 【ステップ2】画像生成モデルを呼び出し、味わいアートを生成
  const imageResponse = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-image',
    contents: prompt,
    config: {
      // 出力モダリティにIMAGEを指定
      responseModalities: [Modality.IMAGE],
      imageConfig: {
        aspectRatio: '1:1',
      },
    },
  });

  // 5. レスポンスからインラインの画像データ（Base64）を抽出
  const imagePart = imageResponse.candidates?.[0]?.content?.parts?.find((part: any) =>
    part.inlineData?.mimeType?.startsWith('image/'),
  );

  if (!imagePart || !imagePart.inlineData) {
    throw new Error('画像の出力に失敗しました。');
  }

  const base64Data = imagePart.inlineData.data ?? ''; // Base64文字列
  const mimeType = imagePart.inlineData.mimeType ?? 'image/png'; // "image/png" など
  return { base64Data, mimeType };
}

/**
 * 日本酒のベクトルデータおよび全体平均・分散との差を分析し、AI解説文章を生成します。
 */
export async function generateVectorAnalysisComment({
  name,
  text,
  vector,
  statsSummary,
}: {
  name: string;
  text?: string;
  vector: number[];
  statsSummary: {
    topPositiveDimensions: { dimIndex: number; value: number; mean: number; ratio: number }[];
    topNegativeDimensions: { dimIndex: number; value: number; mean: number; ratio: number }[];
    averageSimilarityToMean: number;
  };
}): Promise<string> {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const posText = statsSummary.topPositiveDimensions
    .map(
      (d) =>
        `- 次元 #${d.dimIndex}: 値=${d.value.toFixed(3)}, 平均=${d.mean.toFixed(3)}, 偏差倍率=+${d.ratio.toFixed(2)}`,
    )
    .join('\n');

  const negText = statsSummary.topNegativeDimensions
    .map(
      (d) =>
        `- 次元 #${d.dimIndex}: 値=${d.value.toFixed(3)}, 平均=${d.mean.toFixed(3)}, 偏差倍率=${d.ratio.toFixed(2)}`,
    )
    .join('\n');

  const prompt = `
あなたは先進的なデータサイエンスと日本酒ペアリングの専門ソムリエです。
対象の銘柄「${name}」の多次元ベクトル表現と、データベース内の日本酒全体の「平均ベクトル」「分散・四分位数」からの偏差統計データを分析し、この日本酒の特徴・風味・相性の良い料理の傾向について分かりやすく解説してください。

【銘柄名】
${name} ${text ? `(元メモ・説明: ${text})` : ''}

【全体平均・分散との比較偏差データ】
■ 他の日本酒より特に大きく突出・活性化している特徴（上位正偏差次元）:
${posText}

■ 他の日本酒と比べて顕著に低い・抑制されている特徴（上位負偏差次元）:
${negText}

■ 全体平均ベクトルに対する類似度スコア: ${statsSummary.averageSimilarityToMean.toFixed(3)}

【出力形式ルール】
1. この日本酒が全体の中でどのような独自のフレーバープロファイルや特徴を持っているかをデータ偏差に基づいて分かりやすく解釈・説明してください。
2. 相性の良い料理やペアリング（例：酸味・旨味・香りのバランスに応じたおすすめのおつまみ等）のアドバイスを含めてください。
3. 200文字〜350文字程度で、Markdown形式の見易い段落・箇条書きで構成してください。
4. 前置き（「承知しました」等）は含めず、レポート本文のみを出力してください。
`.trim();

  const response = await ai.models.generateContent({
    model: 'models/gemini-3.6-flash',
    contents: prompt,
  });

  return (response.text || '').trim();
}

/**
 * ユーザーの志向ベクトル (userPreferenceVector: 世間基準との高次元差分平均) を Gemini で直接分析し、
 * ユーザー独自の感覚・好みの傾向レポートを生成します。
 */
export async function generateUserTasteAnalysis({
  userName,
  reviewCount,
  userPreferenceVector,
  sampleReviews,
}: {
  userName: string;
  reviewCount: number;
  userPreferenceVector: number[];
  sampleReviews: string[];
}): Promise<string> {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // 1. userPreferenceVector から偏りが大きい次元 (正上位・負上位) を抽出
  let vectorStatsText = '';
  if (userPreferenceVector && userPreferenceVector.length > 0) {
    const indexed = userPreferenceVector.map((val, idx) => ({ dimIndex: idx, value: val }));
    const sortedPos = [...indexed].sort((a, b) => b.value - a.value).slice(0, 5);
    const sortedNeg = [...indexed].sort((a, b) => a.value - b.value).slice(0, 5);

    const posStr = sortedPos
      .map((d) => `- 次元 #${d.dimIndex}: 偏差=+${d.value.toFixed(4)}`)
      .join('\n');
    const negStr = sortedNeg
      .map((d) => `- 次元 #${d.dimIndex}: 偏差=${d.value.toFixed(4)}`)
      .join('\n');

    vectorStatsText = `
■ ユーザー志向ベクトル (全レビュー差分平均ベクトル: ${userPreferenceVector.length}次元) の主要偏差:
【正の偏りが強い主要次元 (好み・意識が強い要素)】:
${posStr}

【負の偏りが強い主要次元 (控えめ・意識が低い要素)】:
${negStr}
`.trim();
  } else {
    vectorStatsText = '（志向ベクトル未算出）';
  }

  const reviewText = sampleReviews.length > 0 ? sampleReviews.join('\n') : '（過去コメントなし）';

  const prompt = `
あなたは味覚心理学と高次元データサイエンスに精通した日本酒ソムリエAI分析官です。
ユーザー「${userName}」が投稿した ${reviewCount} 件のレビューから導出された「ユーザー志向ベクトル (高次元空間における世間一般評価との差分平均ベクトル)」をダイレクトに分析しました。

【分析されたユーザー志向ベクトルデータ】
${vectorStatsText}

【ユーザーの直近レビューコメント】
${reviewText}

【出力ルール】
1. 「世間一般の標準的な日本酒評価に対して、このユーザーが高次元ベクトル的にどのような特徴や味わいを強く感じ取り、どのようなテイストを好む傾向があるか」を解釈して説明してください。
2. 「どのような特徴の日本酒やペアリング（おつまみ・温度帯など）がこのユーザーに最もマッチするか」のアドバイスを含めてください。
3. 250文字〜350文字程度で、Markdown形式（見出し・箇条書きなど）で読みやすくまとめてください。
4. 前置き（「承知しました」等）は除き、分析レポート本文のみを出力してください。
`.trim();

  const response = await ai.models.generateContent({
    model: 'models/gemini-3.6-flash',
    contents: prompt,
  });

  return (response.text || '').trim();
}

const TEMPERATURE_OPTIONS = [
  '指定なし',
  '雪冷え (5℃)',
  '花冷え (10℃)',
  '涼冷え (15℃)',
  '常温 (20℃)',
  'ぬる燗 (40℃)',
  '上燗 (45℃)',
  '熱燗 (50℃)',
  '飛び切り燗 (55℃〜)',
];

const VESSEL_PRESETS = ['ワイングラス', '平盃', 'お猪口', '薄張りグラス', '陶器', '木枡'];

/**
 * Generates recommend from embedding
 */
export async function generateRecommendQuest(
  embedding: number[],
  condition: RecommendQuest,
): Promise<RecommendQuest> {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  // 3. 【ステップ1】1024次元ベクトルを画像用英語プロンプトに逆翻訳
  const textPrompt = `あなたは日本酒ソムリエであり、データサイエンティストでもあります。
  以下は日本酒と飲み方（温度、酒器、合わせるおつまみ）を表すの1024次元の埋め込みベクトルです:
      [${embedding.join(', ')}]
  この意味的ベクトルデータに基づき、その特徴を解釈し、日本酒の味わい、香りの特徴と、温度、酒器、合わせるおつまみをフォーマットに従って生成してください。
  ただし以下は決まっています。
  ${condition.sakeCharacter ? '日本酒の特徴:' + condition.sakeCharacter : ''}
  ${condition.targetTemperature ? '温度:' + condition.targetTemperature : ''}
  ${condition.targetVessel ? '酒器:' + condition.targetVessel : ''}
  ${condition.targetPairing ? '合わせるおつまみ:' + condition.targetPairing : ''}
  `;

  const response = await ai.models.generateContent({
    model: 'models/gemini-3.1-flash-lite',
    contents: textPrompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object', // または "object" (エンドポイントやSDKにより大文字・小文字の仕様に注意)
        properties: {
          title: { type: 'STRING' },
          sakeCharacter: { type: 'STRING' },
          targetTemperature: { type: 'STRING', enum: TEMPERATURE_OPTIONS },
          targetVessel: { type: 'STRING', enum: VESSEL_PRESETS },
          targetPairing: { type: 'STRING' },
          recommendComment: { type: 'STRING' },
        },
        required: ['sakeCharacter', 'targetPairing', 'recommendComment'],
      },
    },
  });

  if (!response || !response.text) {
    throw new Error('生成に失敗しました。');
  }

  const data = JSON.parse(response.text);

  if (!data) {
    throw new Error('JSON解析に失敗しました。');
  }

  return data as RecommendQuest;
}
