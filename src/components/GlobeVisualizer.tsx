// SakeGlobe.tsx
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { TextVector } from '../dummyTypes';
import Matrix from 'ml-matrix';
import {
  classicalMDS,
  cosineSimilarity,
  createCosineDistanceMatrix,
  getOrthogonalVector,
} from '../lib/calc';
import { generateQueryEmbedding, generateVectorAnalysisComment } from '../lib/gemini';
import chroma from 'chroma-js';

// カラーマップの設定
const jetMap = chroma.scale('RdBu');

// --- データ型定義 ---
interface SakeStarData {
  id: number;
  name: string;
  vector: number[];
  similarity: number;
  initialPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  initialColor: THREE.Color;
  targetColor: THREE.Color;
}

export interface DimensionStats {
  mean: number;
  q25: number;
  q75: number;
  iqr: number;
}

const GLOBE_RADIUS = 100;
const ANIMATION_SPEED = 0.05; // 星の移動スピード

// --- 1. MDSの結果（Matrix）を球面座標に変換する関数 ---
function convertMdsToSphere(mdsResult: Matrix, radius: number = GLOBE_RADIUS): THREE.Vector3[] {
  const rows = mdsResult.rows;
  const spherePositions: THREE.Vector3[] = [];

  for (let i = 0; i < rows; i++) {
    let x = mdsResult.get(i, 0);
    let y = mdsResult.get(i, 1);
    let z = mdsResult.get(i, 2);

    const currentDist = Math.sqrt(x * x + y * y + z * z);
    const vec = new THREE.Vector3(x, y, z);
    if (currentDist > 0) {
      vec.normalize().multiplyScalar(radius);
    }
    spherePositions.push(vec);
  }

  return spherePositions;
}

// --- 2. 単一銘柄の全次元ベクトルを、平均・分散(25%/75%)からの差に応じた「半径」で表現する3Dコンポーネント ---
const SakeVectorHeatmap: React.FC<{
  vector: number[];
  dimensionUnitVectors: THREE.Vector3[];
  dimensionStatsList: DimensionStats[];
}> = ({ vector, dimensionUnitVectors, dimensionStatsList }) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!instancedMeshRef.current || dimensionUnitVectors.length === 0) return;

    dimensionUnitVectors.forEach((unitVec, i) => {
      const val = vector[i] ?? 0;
      const stats = dimensionStatsList[i];

      let radius = GLOBE_RADIUS;
      let ratio = 0; // (val - mean) / iqr (四分位範囲単位での位置)

      if (stats && stats.iqr > 0) {
        // (val - mean) / iqr
        // 平均(mean)のとき ratio = 0  -> 半径 GLOBE_RADIUS
        // 25%点(q25)のとき ratio = -0.5 -> 半径 0.5 * GLOBE_RADIUS (半径1/2)
        // 75%点(q75)のとき ratio = +0.5 -> 半径 1.5 * GLOBE_RADIUS (半径3/2)
        ratio = (val - stats.mean) / stats.iqr;
        radius = GLOBE_RADIUS * (1 + ratio);
      }

      // 可視化のための表示領域クランプ (0.05 * R 〜 2.5 * R)
      const clampedRadius = Math.max(GLOBE_RADIUS * 0.05, Math.min(GLOBE_RADIUS * 2.5, radius));

      // 1. 半径に応じた3D位置の指定 (単位ベクトル × 計算された半径)
      tempObject.position.copy(unitVec).multiplyScalar(clampedRadius);

      // 2. 半径に応じてピクセルの大きさを少しスケーリング（突出している次元をより強調）
      const scale = Math.max(0.6, Math.min(2.5, (clampedRadius / GLOBE_RADIUS) * 1.2));
      tempObject.scale.set(scale, scale, scale);

      tempObject.updateMatrix();
      instancedMeshRef.current!.setMatrixAt(i, tempObject.matrix);

      // 3. 発色：
      if (ratio > -0.2 && ratio < 0.2) {
        tempColor.setColorName('gray');
      } else {
        tempColor.set(jetMap(-ratio).hex());
      }

      instancedMeshRef.current!.setColorAt(i, tempColor);
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (instancedMeshRef.current.instanceColor) {
      instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [vector, dimensionUnitVectors, dimensionStatsList, tempObject, tempColor]);

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[undefined, undefined, dimensionUnitVectors.length]}
    >
      <boxGeometry args={[1.6, 1.6, 1.6]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
};

// --- 3. 個々の「星（日本酒）」を表す内部コンポーネント ---
const SakeStar: React.FC<{
  data: SakeStarData;
  onClick: () => void;
  isSelected: boolean;
}> = ({ data, onClick, isSelected }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  const currentPosRef = useRef<THREE.Vector3>(data.initialPos.clone());
  const currentColorRef = useRef<THREE.Color>(data.initialColor.clone());

  useFrame(() => {
    if (!meshRef.current) return;
    const targetP = data.targetPos;
    const targetC = data.targetColor;

    const distanceP = currentPosRef.current.distanceTo(targetP);
    const distanceC = chroma.distance(
      currentColorRef.current.getHexString(),
      targetC.getHexString(),
    );

    if (distanceP < 0.01 && distanceC < 0.01) {
      meshRef.current.position.copy(targetP);
      (meshRef.current.material as THREE.MeshBasicMaterial).color.copy(targetC);
      return;
    }

    currentPosRef.current.lerp(targetP, ANIMATION_SPEED);
    currentPosRef.current.normalize().multiplyScalar(GLOBE_RADIUS);
    meshRef.current.position.copy(currentPosRef.current);

    currentColorRef.current.lerp(targetC, ANIMATION_SPEED);
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.color.copy(currentColorRef.current);
  });

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setIsHovered(true);
      }}
      onPointerOut={() => setIsHovered(false)}
    >
      <sphereGeometry args={[isSelected ? 2.5 : 1.5, 16, 16]} />
      <meshBasicMaterial />
      <Html
        distanceFactor={180}
        center
        style={{
          pointerEvents: 'auto',
          whiteSpace: 'nowrap',
          transition: 'all 0.1s ease',
          cursor: 'pointer',
        }}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          style={{
            transform: 'translate(10px, -10px)',
            backgroundColor: isSelected
              ? 'rgba(255, 215, 0, 0.95)'
              : isHovered
                ? 'rgba(255, 255, 255, 0.95)'
                : 'rgba(10, 10, 25, 0.65)',
            color: isSelected || isHovered ? '#05050c' : '#ffffff',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: isSelected || isHovered ? '12px' : '10px',
            fontWeight: isSelected || isHovered ? 'bold' : 'normal',
            border: isSelected
              ? '2px solid #ffd700'
              : isHovered
                ? '1px solid #4c4c9d'
                : '1px solid rgba(255,255,255,0.2)',
            boxShadow: isSelected || isHovered ? '0 0 10px rgba(140,140,255,0.5)' : 'none',
            fontFamily: 'monospace',
          }}
        >
          {data.name}
        </div>
      </Html>
    </mesh>
  );
};

interface GlobeVisualizerProps {
  vectors: TextVector[];
}

// --- 4. メインの地球儀コンポーネント ---
export const GlobeVisualizer: React.FC<GlobeVisualizerProps> = (props: GlobeVisualizerProps) => {
  const [sakeStars, setSakeStars] = useState<SakeStarData[]>([]);
  const [isGloval, setGloval] = useState<boolean>(true);
  const [selectedSakeId, setSelectedSakeId] = useState<number | null>(null);
  const [query, setQuery] = useState<string>('');

  // AI文章分析用のState
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string>('');
  const [analysisError, setAnalysisError] = useState<string>('');

  // 1. 各次元 (Vector の各要素) 同士の相関行列を作成し、球面上における基準の相関配置（方向）を計算
  const dimensionPositions = useMemo(() => {
    if (!props.vectors || props.vectors.length === 0) return [];
    const dimCount = props.vectors[0].vector.length;
    if (dimCount === 0) return [];

    const dimVectors: number[][] = [];
    for (let d = 0; d < dimCount; d++) {
      dimVectors.push(props.vectors.map((v) => v.vector[d] ?? 0));
    }

    if (props.vectors.length >= 2) {
      const dimDistanceMatrix = new Matrix(createCosineDistanceMatrix(dimVectors));
      const mdsResult = classicalMDS(dimDistanceMatrix, 3);
      return convertMdsToSphere(mdsResult, GLOBE_RADIUS);
    } else {
      const spherePositions: THREE.Vector3[] = [];
      const phi = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < dimCount; i++) {
        const y = 1 - (i / (dimCount - 1 || 1)) * 2;
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = phi * i;
        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;
        spherePositions.push(new THREE.Vector3(x, y, z).multiplyScalar(GLOBE_RADIUS));
      }
      return spherePositions;
    }
  }, [props.vectors]);

  // 次元の単位方向ベクトル (長さ1に正規化)
  const dimensionUnitVectors = useMemo((): THREE.Vector3[] => {
    return dimensionPositions.map((pos) => pos.clone().normalize());
  }, [dimensionPositions]);

  // 2. 日本酒全体における、各次元の平均値・25%点(q25)・75%点(q75)・IQRの計算
  const dimensionStatsList = useMemo((): DimensionStats[] => {
    if (!props.vectors || props.vectors.length === 0) return [];
    const dimCount = props.vectors[0].vector.length;
    const statsList: DimensionStats[] = [];

    for (let d = 0; d < dimCount; d++) {
      const values = props.vectors.map((v) => v.vector[d] ?? 0).sort((a, b) => a - b);
      const n = values.length;

      const sum = values.reduce((acc, val) => acc + val, 0);
      const mean = sum / n;

      let q25 = mean;
      let q75 = mean;

      if (n >= 2) {
        const idx25 = (n - 1) * 0.25;
        const base25 = Math.floor(idx25);
        const rest25 = idx25 - base25;
        q25 =
          values[base25] +
          (values[base25 + 1] !== undefined ? rest25 * (values[base25 + 1] - values[base25]) : 0);

        const idx75 = (n - 1) * 0.75;
        const base75 = Math.floor(idx75);
        const rest75 = idx75 - base75;
        q75 =
          values[base75] +
          (values[base75 + 1] !== undefined ? rest75 * (values[base75 + 1] - values[base75]) : 0);
      }

      let iqr = q75 - q25;
      if (iqr <= 0.00001) {
        const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
        const std = Math.sqrt(variance);
        iqr = std > 0 ? std * 1.349 : 1.0;
      }

      statsList.push({ mean, q25, q75, iqr });
    }

    return statsList;
  }, [props.vectors]);

  // 現在選択されている銘柄の星データ
  const selectedStar = useMemo(() => {
    if (selectedSakeId === null) return null;
    return sakeStars.find((s) => s.id === selectedSakeId) || null;
  }, [sakeStars, selectedSakeId]);

  const handleSearch = async () => {
    const vec = await generateQueryEmbedding(`${query}と相性がよい`, 1024);
    let minSimScale = 1;
    let maxSimScale = 0;

    const color = sakeStars.map((star) => {
      const similarity = cosineSimilarity(star.vector, vec);
      minSimScale = Math.min(minSimScale, similarity);
      maxSimScale = Math.max(maxSimScale, similarity);
      return similarity;
    });
    const position = sakeStars.map((star) => {
      const diff = getOrthogonalVector(star.vector, vec);
      return diff;
    });
    const distanceMatrix = new Matrix(createCosineDistanceMatrix(position));
    const mdsResult = classicalMDS(distanceMatrix, 3);
    const vectors = convertMdsToSphere(mdsResult);

    setSakeStars(
      sakeStars.map((star, i) => {
        const colorScale = ((color[i] - minSimScale) / (maxSimScale - minSimScale)) * 2 - 1;
        star.targetColor = new THREE.Color().set(jetMap(-colorScale).hex());
        star.targetPos = vectors[i];
        star.similarity = color[i];
        return star;
      }),
    );
  };

  useEffect(() => {
    if (!props.vectors || props.vectors.length === 0) {
      setSakeStars([]);
      setSelectedSakeId(null);
      return;
    }

    const N = props.vectors.length;
    let initialVectors: THREE.Vector3[] = [];

    if (N === 1) {
      initialVectors = [new THREE.Vector3(0, 0, GLOBE_RADIUS)];
    } else {
      const baseEmbeddings = props.vectors.map((vec) => vec.vector);
      const initDistanceMatrix = new Matrix(createCosineDistanceMatrix(baseEmbeddings));
      const initMdsResult = classicalMDS(initDistanceMatrix, 3);
      initialVectors = convertMdsToSphere(initMdsResult);
    }

    setSakeStars((prevStars) => {
      const prevStarMap = new Map(prevStars.map((s) => [s.name, s]));

      return props.vectors.map((vec, i) => {
        const prev = prevStarMap.get(vec.name);
        const targetP = initialVectors[i];
        const targetC = prev ? prev.targetColor : new THREE.Color('#9090a0');

        return {
          id: i,
          name: vec.name,
          vector: vec.vector,
          similarity: prev ? prev.similarity : 0,
          initialPos: prev ? prev.targetPos.clone() : targetP.clone(),
          targetPos: targetP,
          initialColor: prev ? prev.targetColor.clone() : targetC,
          targetColor: targetC,
        };
      });
    });
  }, [props.vectors]);

  const handleSelectStar = (starId: number) => {
    setSelectedSakeId(starId);
    setGloval(false);
    setAiAnalysisResult('');
    setAnalysisError('');
  };

  const handleAnalyzeSake = async () => {
    if (!selectedStar || dimensionStatsList.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisError('');
    try {
      const dimCount = selectedStar.vector.length;
      const items: { dimIndex: number; value: number; mean: number; ratio: number }[] = [];

      for (let d = 0; d < dimCount; d++) {
        const val = selectedStar.vector[d] ?? 0;
        const stats = dimensionStatsList[d];
        const ratio = stats && stats.iqr > 0 ? (val - stats.mean) / stats.iqr : 0;
        items.push({ dimIndex: d, value: val, mean: stats ? stats.mean : 0, ratio });
      }

      const sortedPos = [...items].sort((a, b) => b.ratio - a.ratio);
      const sortedNeg = [...items].sort((a, b) => a.ratio - b.ratio);

      const summary = {
        topPositiveDimensions: sortedPos.slice(0, 5),
        topNegativeDimensions: sortedNeg.slice(0, 5),
        averageSimilarityToMean: 0.85,
      };

      const textVectorObj = props.vectors.find((v) => v.name === selectedStar.name);

      const comment = await generateVectorAnalysisComment({
        name: selectedStar.name,
        text: textVectorObj?.text,
        vector: selectedStar.vector,
        statsSummary: summary,
      });

      setAiAnalysisResult(comment);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || 'Geminiによる分析に失敗しました。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div>
      <div>
        <input
          type="text"
          className="block w-full pl-10 pr-24 py-3 mb-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm"
          placeholder="おつまみ・温度など"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <button
        className="w-full bg-indigo-600 text-white py-4 my-4 rounded-xl font-medium disabled:opacity-50 flex justify-center items-center shadow-md hover:bg-indigo-700 transition-colors"
        onClick={handleSearch}
      >
        検索
      </button>

      <div className="flex gap-4 my-4">
        <button
          className={`flex-1 py-3 rounded-xl font-medium transition-colors shadow-md ${
            isGloval ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
          }`}
          onClick={() => {
            setGloval(true);
            setSelectedSakeId(null);
          }}
        >
          全体表示
        </button>
        <button
          className={`flex-1 py-3 rounded-xl font-medium transition-colors shadow-md ${
            !isGloval
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
          }`}
          onClick={() => {
            setGloval(false);
            if (selectedSakeId === null && sakeStars.length > 0) {
              setSelectedSakeId(sakeStars[0].id);
            }
          }}
        >
          {selectedStar ? `個別: ${selectedStar.name}` : '個別表示'}
        </button>
      </div>

      <div
        className="w-full rounded-xl overflow-hidden"
        style={{ height: '70vh', position: 'relative', backgroundColor: 'black' }}
      >
        {/* 3D レンダリング空間 (Canvas) */}
        <Canvas camera={{ position: 35, fov: 55 }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[1, 1, 1]} intensity={0.8} />

          {/* 基準となる平均球面 (半径 = GLOBE_RADIUS) */}
          <Sphere args={[GLOBE_RADIUS, 32, 32]}>
            <meshStandardMaterial color="#30303d" wireframe transparent opacity={0.25} />
          </Sphere>

          {/* 個別表示モード時の補助ガイド球面（25%面 = 1/2, 75%面 = 3/2） */}
          {!isGloval && (
            <>
              {/* 25%分散 (Q1) 面: 半径 0.5 * GLOBE_RADIUS */}
              <Sphere args={[GLOBE_RADIUS * 0.5, 24, 24]}>
                <meshBasicMaterial color="#3388ff" wireframe transparent opacity={0.25} />
              </Sphere>
              {/* 75%分散 (Q3) 面: 半径 1.5 * GLOBE_RADIUS */}
              <Sphere args={[GLOBE_RADIUS * 1.5, 32, 32]}>
                <meshBasicMaterial color="#ff3366" wireframe transparent opacity={0.25} />
              </Sphere>
            </>
          )}

          {/* 個別表示モード時の各次元の半径プロット */}
          {!isGloval && selectedStar && (
            <SakeVectorHeatmap
              vector={selectedStar.vector}
              dimensionUnitVectors={dimensionUnitVectors}
              dimensionStatsList={dimensionStatsList}
            />
          )}

          {/* 複数の星（日本酒）を描画 */}
          <group>
            {sakeStars.map((star) => (
              <SakeStar
                key={star.id}
                data={star}
                isSelected={selectedSakeId === star.id}
                onClick={() => handleSelectStar(star.id)}
              />
            ))}
          </group>

          {/* マウス操作を可能にするコントロール */}
          <OrbitControls enableDamping dampingFactor={0.05} />
        </Canvas>

        {/* HTML / React によるUIレイヤー */}
        <div
          id="ui-container"
          className="absolute bottom-4 left-4 text-white bg-slate-900/85 p-4 rounded-xl backdrop-blur-md max-w-md border border-slate-700/50"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-bold text-lg">
              {!isGloval && selectedStar
                ? `🍶 ${selectedStar.name} の相対分布`
                : '🍶 日本酒ペアリング球'}
            </h3>
            <span className="text-xs text-slate-400">
              {sakeStars.length}/{props.vectors.length}件
            </span>
          </div>

          <p className="text-xs text-slate-300 mb-2 leading-relaxed">
            {!isGloval && selectedStar
              ? '全銘柄の平均値を球面上(半径1.0)とし、下位25%点を半径1/2、上位75%点を半径3/2として個別の数値を半径方向に表示しています。'
              : '銘柄ラベルをクリックすると、全体平均・分散に対するこの銘柄の各次元の偏りを立体的な半径として確認できます。'}
          </p>

          <div id="legend" className="flex flex-wrap gap-2 text-xs">
            {!isGloval && selectedStar ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-red-500"></span>
                  <span>75%以上(突出 / 外球)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-slate-400"></span>
                  <span>平均付近(基準球)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-blue-500"></span>
                  <span>25%以下(凹み / 内球)</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-blue-600"></span>
                  <span>関連高い</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-red-600"></span>
                  <span>関連低い</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-slate-400"></span>
                  <span>未検証</span>
                </div>
              </>
            )}
          </div>

          {!isGloval && selectedStar && (
            <div className="mt-3 pt-3 border-t border-slate-700/60">
              {!aiAnalysisResult && !isAnalyzing && (
                <button
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold py-2 px-3 rounded-lg shadow transition-all flex items-center justify-center gap-1.5"
                  onClick={handleAnalyzeSake}
                >
                  ✨ Geminiでベクトル特徴を文章解説
                </button>
              )}

              {isAnalyzing && (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-purple-300 animate-pulse">
                  <span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></span>
                  ベクトルと統計偏りをGeminiが分析中...
                </div>
              )}

              {analysisError && (
                <div className="text-xs text-rose-400 bg-rose-950/50 p-2 rounded border border-rose-800/50 mt-2">
                  {analysisError}
                </div>
              )}

              {aiAnalysisResult && (
                <div className="mt-2 bg-slate-950/80 p-3 rounded-lg border border-purple-500/30 text-xs leading-relaxed text-slate-200 space-y-1.5 max-h-48 overflow-y-auto">
                  <div className="font-semibold text-purple-300 flex items-center justify-between">
                    <span>🤖 AIベクトル特徴解説</span>
                    <button
                      className="text-[10px] text-slate-400 hover:text-white underline"
                      onClick={handleAnalyzeSake}
                    >
                      再生成
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap text-slate-300">{aiAnalysisResult}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
