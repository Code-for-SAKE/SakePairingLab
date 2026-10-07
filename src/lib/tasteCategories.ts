import { generateQueryEmbedding } from './gemini';
import defaultCategoryVectors from '../data/categoryVectors.json';

export interface TasteCategoryDefinition {
  key: string;
  label: string;
  description: string;
}

// 柔軟に変更・追加可能な味覚・香りのカテゴリー定義
export const DEFAULT_TASTE_CATEGORIES: TasteCategoryDefinition[] = [
  {
    key: 'fruity',
    label: 'フルーティ',
    description: '華やかでフルーティな果実香、リンゴやマスカット、バナナのような香り',
  },
  {
    key: 'crisp',
    label: 'スッキリ・軽快',
    description: 'キレが良く爽快、スッキリとした辛口、軽快で淡麗な味わい',
  },
  {
    key: 'aged',
    label: '熟成・複雑味',
    description: '重厚で熟成感のある香り、ナッツやカラメル、紹興酒のような奥深い複雑味',
  },
  {
    key: 'rich',
    label: 'ふくよか・旨味',
    description: '米の旨味が豊かでふくよか、コクと深みのある芳醇な濃醇テイスト',
  },
  {
    key: 'acidity',
    label: '酸味',
    description: '柑橘系やリンゴ酸のような爽やかな酸味、キリッとした酸が際立つ味わい',
  },
  {
    key: 'sweetness',
    label: '甘味',
    description: '上品で優しい甘さ、米本来のまろやかな甘味と心地よい余韻',
  },
];

// メモリおよびLocalStorage用キャッシュ
const categoryVectorCache = new Map<string, number[]>();
const LOCAL_STORAGE_KEY_PREFIX = 'sake_taste_category_vec_v1_';

/**
 * ベクトルのコサイン類似度を計算する
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * カテゴリ定義のEmbedding（1024次元）を取得する
 * 優先順位: 1. メモリキャッシュ -> 2. categoryVectors.json
 */
export async function getCategoryEmbedding(cat: TasteCategoryDefinition): Promise<number[]> {
  const cacheKey = `${cat.key}_${cat.description}`;
  if (categoryVectorCache.has(cacheKey)) {
    return categoryVectorCache.get(cacheKey)!;
  }

  // 2. src/data/categoryVectors.json からの取得（管理者作成の事前定義ベクトル）
  const staticVectors = defaultCategoryVectors as Record<string, number[]>;
  if (
    staticVectors &&
    Array.isArray(staticVectors[cat.key]) &&
    staticVectors[cat.key].length === 1024
  ) {
    const staticVec = staticVectors[cat.key];
    categoryVectorCache.set(cacheKey, staticVec);
    return staticVec;
  }

  return []; // 空配列を返す（管理者が事前に生成していない場合）
}

/**
 * 管理者用: カテゴリ定義のEmbeddingを一括再生成し、JSONオブジェクトとして返却
 */
export async function regenerateCategoryVectors(
  categories: TasteCategoryDefinition[] = DEFAULT_TASTE_CATEGORIES,
): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  for (const cat of categories) {
    const vec = await generateQueryEmbedding(cat.description, 1024);
    result[cat.key] = vec;
  }
  return result;
}

/**
 * 管理者用: 生成されたカテゴリベクトルJSONをファイルとしてダウンロード
 */
export function downloadCategoryVectorsJson(data: Record<string, number[]>) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'categoryVectors.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 複数のカテゴリ定義すべてのEmbeddingを取得する
 */
export async function getCategoryEmbeddings(
  categories: TasteCategoryDefinition[] = DEFAULT_TASTE_CATEGORIES,
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  await Promise.all(
    categories.map(async (cat) => {
      try {
        const vec = await getCategoryEmbedding(cat);
        map.set(cat.key, vec);
      } catch (err) {
        console.error(`Error embedding category ${cat.label}:`, err);
      }
    }),
  );
  return map;
}

export interface TasteRadarChartItem {
  subject: string;
  世間一般: number;
  あなたの感度: number;
  rawSimilarity: number;
  categoryKey: string;
}

/**
 * ユーザーの差分ベクトル (biasVector) をカテゴリ群に射影してレーダーチャート用データを生成
 */
export function projectBiasVectorToCategories(
  biasVector: number[],
  categories: TasteCategoryDefinition[],
  categoryVectorMap: Map<string, number[]>,
): {
  chartData: TasteRadarChartItem[];
  topDeviations: { category: string; deviationScore: number; description: string }[];
  summary: string;
} {
  if (!biasVector || biasVector.length === 0) {
    return { chartData: [], topDeviations: [], summary: '' };
  }

  const chartData: TasteRadarChartItem[] = categories.map((cat) => {
    const catVec = categoryVectorMap.get(cat.key);
    const rawSim = catVec ? calculateCosineSimilarity(biasVector, catVec) : 0;

    // コサイン類似度（-0.3 ~ +0.3 程度が標準的）を 0 ~ 100 スケールにマッピング
    // 世間基準 = 50。差分が +0.15 でおよそ 75、-0.15 でおよそ 25
    const userScore = Math.max(10, Math.min(90, Math.round(50 + rawSim * 160)));

    return {
      subject: cat.label,
      世間一般: 50,
      あなたの感度: userScore,
      rawSimilarity: rawSim,
      categoryKey: cat.key,
    };
  });

  const sorted = [...chartData].sort(
    (a, b) => Math.abs(b.rawSimilarity) - Math.abs(a.rawSimilarity),
  );

  const topDeviations = sorted.slice(0, 3).map((item) => {
    const scoreDiff = item.rawSimilarity * 100;
    let description = '一般平均と同等の感受性';
    if (item.rawSimilarity > 0.03) {
      description = '世間一般より強く感じ取りやすい・好む';
    } else if (item.rawSimilarity < -0.03) {
      description = '世間一般より控えめに感じやすい';
    }

    return {
      category: item.subject,
      deviationScore: scoreDiff,
      description,
    };
  });

  const summary = topDeviations
    .map(
      (d) =>
        `${d.category}: ${d.deviationScore > 0 ? '+' : ''}${d.deviationScore.toFixed(1)}pt の偏差`,
    )
    .join(' / ');

  return { chartData, topDeviations, summary };
}
