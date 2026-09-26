import { EigenvalueDecomposition, Matrix } from 'ml-matrix';

/**
 * 2つのベクトル間のコサイン類似度を計算する
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }

  if (normA === 0 || normB === 0) return 0; // ゼロベクトルの場合は0を返す防衛策
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 高次元データの配列から、コサイン距離行列 (1 - コサイン類似度) を生成する
 * @param data N行 x M列 の高次元データ（N個のベクトルデータ）
 * @returns N x N の距離行列
 */
export function createCosineDistanceMatrix(data: number[][]): number[][] {
  const N = data.length;

  // N x N の空の行列を準備
  const distanceMatrix: number[][] = Array.from({ length: N }, () => Array(N).fill(0));

  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      if (i === j) {
        distanceMatrix[i][j] = 0; // 自分自身との距離は 0
        continue;
      }

      // コサイン類似度を計算 (1.0 〜 -1.0)
      const similarity = cosineSimilarity(data[i], data[j]);

      // コサイン距離に変換 (0.0 〜 2.0)
      // 完全に同じ向き（類似度1）なら距離0、真逆（類似度-1）なら距離2
      const distance = 1 - similarity;

      // 対称行列なので両方に代入
      distanceMatrix[i][j] = distance;
      distanceMatrix[j][i] = distance;
    }
  }

  return distanceMatrix;
}

/**
 * 古典的MDS（多次元尺度構成法）を実行する関数
 * @param distanceMatrix データの非類似度（距離）を表す正方行列
 * @param dimensions 削減後の次元数（通常は 2 または 3）
 */
export function classicalMDS(distanceMatrix: Matrix, dimensions: number = 3): Matrix {
  const n = distanceMatrix.rows;

  // ステップ 1 & 2: ダブルセンタリング公式により内積行列（Gram行列）B を O(n^2) で直接計算
  // B_ij = -0.5 * (d_ij^2 - rowMean_i - rowMean_j + totalMean)
  // 行列積 H * A * H (O(n^3)) を排除し、余分な一時行列の生成も不要にします。
  const d2RowSums = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distanceMatrix.get(i, j);
      const d2 = d * d;
      d2RowSums[i] += d2;
      d2RowSums[j] += d2;
    }
  }

  const d2RowMeans = new Float64Array(n);
  let totalD2Sum = 0;
  for (let i = 0; i < n; i++) {
    d2RowMeans[i] = d2RowSums[i] / n;
    totalD2Sum += d2RowSums[i];
  }
  const d2TotalMean = totalD2Sum / (n * n);

  const B = new Matrix(n, n);
  for (let i = 0; i < n; i++) {
    const meanI = d2RowMeans[i];
    for (let j = i; j < n; j++) {
      const d = distanceMatrix.get(i, j);
      const d2 = d * d;
      const b_ij = -0.5 * (d2 - meanI - d2RowMeans[j] + d2TotalMean);
      B.set(i, j, b_ij);
      B.set(j, i, b_ij);
    }
  }

  // ステップ 3: 固有値分解 (B = V * L * V^T)
  const evd = new EigenvalueDecomposition(B);
  const eigenvalues = evd.realEigenvalues; // 固有値の配列
  const eigenvectors = evd.eigenvectorMatrix; // 固有ベクトルの行列

  // 固有値が大きい順に並ぶようにインデックスをソート
  const indices = eigenvalues.map((val, index) => ({ val, index })).sort((a, b) => b.val - a.val);

  // ステップ 4: 上位d個の正の固有値と対応する固有ベクトルから低次元座標を計算
  const X = Matrix.zeros(n, dimensions);

  for (let j = 0; j < dimensions; j++) {
    const { val: lmbda, index: origIdx } = indices[j];

    // 固有値が0以下の場合は計算をスキップ（誤差対策）
    if (lmbda <= 0) continue;

    const sqrtLambda = Math.sqrt(lmbda);

    for (let i = 0; i < n; i++) {
      // 固有ベクトル行列から対応する列を取り出し、√λ を掛ける
      const v_ij = eigenvectors.get(i, origIdx);
      X.set(i, j, v_ij * sqrtLambda);
    }
  }

  return X;
}

/**
 * 💡 ベクトルAからキーワードベクトルBの成分を綺麗に引き算し、直交ベクトルを返す関数
 */
export function getOrthogonalVector(vectorA: number[], vectorB: number[]): number[] {
  // 1. キーワードベクトルBの長さを測定して正規化
  const normB = Math.sqrt(vectorB.reduce((sum, val) => sum + val * val, 0));
  if (normB === 0) return [...vectorA];
  const unitB = vectorB.map((val) => val / normB);

  // 2. ベクトルAがBの方向に持っている「強さ（内積）」を計算
  const dotProduct = vectorA.reduce((sum, val, i) => sum + val * unitB[i], 0);

  // 3. Aから「Bの成分」を差し引くことで、Bと完全に直交する（交わらない）ベクトルを抽出
  return vectorA.map((val, i) => val - dotProduct * unitB[i]);
}

/**
 * 1024次元のベクトルをL2正規化する（長さを1にする）
 */
const normalize = (v: number[]): number[] => {
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) sumSq += v[i] * v[i];
  const norm = Math.sqrt(sumSq) + 1e-9;
  return v.map((x) => x / norm);
};

/**
 * 2つの1024次元ベクトルの内積（コサイン類似度）を計算する
 */
const dotProduct = (v1: number[], v2: number[]): number => {
  let dot = 0;
  for (let i = 0; i < v1.length; i++) dot += v1[i] * v2[i];
  return dot;
};

/**
 * ニューラルネット/外部ライブラリ不使用の空洞ベクトル探索
 * @param existing 既存ベクトルの2次元配列 [N][1024] （正規化済みを推奨）
 * @param numVoids 取得したい空洞ベクトルの数 (K)
 * @param steps ループ回数
 * @param lr 学習率（1ステップの移動量）
 */
export const findVoidVectorsPure = (
  existing: number[][],
  numVoids: number = 3,
  steps: number = 100,
  lr: number = 0.02,
): number[][] => {
  const N = existing.length;
  if (N === 0) return [];
  const DIM = existing[0].length; // 1024

  // 0. 既存ベクトルをあらかじめ正規化しておく
  const normExisting = existing.map((v) => normalize(v));

  // 1. 既存データの重心（平均）を計算
  const mean = new Array(DIM).fill(0);
  for (let j = 0; j < DIM; j++) {
    for (let i = 0; i < N; i++) {
      mean[j] += normExisting[i][j];
    }
    mean[j] /= N;
  }

  // 2. 空洞ベクトルの初期値をランダム生成（既存の重心付近から少しずらして配置）
  let voids: number[][] = Array.from({ length: numVoids }, () => {
    const v = new Array(DIM);
    for (let j = 0; j < DIM; j++) {
      // 平均値 + 小さなランダムノイズ
      v[j] = mean[j] + (Math.random() - 0.5) * 0.2;
    }
    return normalize(v);
  });

  // 3. 反発力シミュレーションのループ
  for (let step = 0; step < steps; step++) {
    // 次のステップの空洞ベクトルを格納する配列
    const nextVoids = voids.map((v) => [...v]);

    for (let k = 0; k < numVoids; k++) {
      const vK = voids[k];
      // 1024次元の「移動方向（勾配）」を格納する配列
      const gradient = new Array(DIM).fill(0);

      // --- 斥力1: 既存ベクトルから遠ざかる力を計算 ---
      for (let i = 0; i < N; i++) {
        const eI = normExisting[i];
        const cosSim = dotProduct(vK, eI); // -1 ~ 1
        const dist = 1.0 - cosSim; // コサイン距離 (0 ~ 2)

        // 距離の逆数の微分から導出される「反発力の強さ」
        // 距離が近い（distが小さい）ほど、爆発的に強い力がかかる
        const weight = 1.0 / (dist * dist + 1e-5);

        for (let j = 0; j < DIM; j++) {
          // eI[j] の方向とは「逆」に動かしたいので、引き算の方向に力を加える
          gradient[j] -= weight * (eI[j] - cosSim * vK[j]);
        }
      }

      // --- 斥力2: 他の空洞ベクトルから遠ざかる力を計算 ---
      for (let o = 0; o < numVoids; o++) {
        if (k === o) continue; // 自分自身は無視
        const vO = voids[o];
        const cosSim = dotProduct(vK, vO);
        const dist = 1.0 - cosSim;
        const weight = 0.5 / (dist * dist + 1e-5); // 他の空洞からの力は少し弱める(0.5)

        for (let j = 0; j < DIM; j++) {
          gradient[j] -= weight * (vO[j] - cosSim * vK[j]);
        }
      }

      // --- 4. 計算した反発力（勾配）の方向にベクトルを動かす ---
      for (let j = 0; j < DIM; j++) {
        // 斥力（マイナス勾配）の方向へ学習率(lr)を掛けて移動
        nextVoids[k][j] -= lr * gradient[j];
      }

      // 単位球面上に引き戻すために再正規化
      nextVoids[k] = normalize(nextVoids[k]);
    }

    // すべての空洞ベクトルの位置を更新
    voids = nextVoids;
  }

  return voids;
};
