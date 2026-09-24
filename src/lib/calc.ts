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

  // ステップ 1: 距離の2乗行列 A の作成
  // A_ij = -0.5 * d_ij^2
  const A = new Matrix(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = distanceMatrix.get(i, j);
      A.set(i, j, -0.5 * Math.pow(d, 2));
    }
  }

  // ステップ 2: 中心化行列 H の作成
  // H = I - (1/n) * J  （Jはすべて1の行列）
  const I = Matrix.eye(n);
  const J = Matrix.ones(n, n);
  const H = I.sub(J.div(n));

  // 内積行列（Gram行列） B の計算: B = H * A * H
  const B = H.mmul(A).mmul(H);

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
