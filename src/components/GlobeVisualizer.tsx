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
import { generateQueryEmbedding } from '../lib/gemini';
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

// --- 2. 単一銘柄の全次元ベクトルを球表面全体に描画するヒートマップコンポーネント ---
const SakeVectorHeatmap: React.FC<{
  vector: number[];
  dimensionPositions: THREE.Vector3[];
}> = ({ vector, dimensionPositions }) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!instancedMeshRef.current || dimensionPositions.length === 0) return;

    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < vector.length; i++) {
      const v = vector[i] ?? 0;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }

    dimensionPositions.forEach((pos, i) => {
      tempObject.position.copy(pos);
      tempObject.updateMatrix();
      instancedMeshRef.current!.setMatrixAt(i, tempObject.matrix);

      const val = vector[i] ?? 0;

      const t = ((val - minVal) / (maxVal - minVal || 1)) * 2 - 1;
      tempColor.set(jetMap(t).hex());

      console.log(val, t, jetMap(t).hex());

      instancedMeshRef.current!.setColorAt(i, tempColor);
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (instancedMeshRef.current.instanceColor) {
      instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
  }, [vector, dimensionPositions, tempObject, tempColor]);

  return (
    <instancedMesh ref={instancedMeshRef} args={[undefined, undefined, dimensionPositions.length]}>
      <boxGeometry args={[1.8, 1.8, 1.8]} />
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

  // 各次元 (Vector の各要素) 同士の相関行列を作成し、球面上における相関に基く配置を計算
  const dimensionPositions = useMemo(() => {
    if (!props.vectors || props.vectors.length === 0) return [];
    const dimCount = props.vectors[0].vector.length;
    if (dimCount === 0) return [];

    // 各次元 (0 ~ dimCount-1) における各日本酒の値を並べたベクトル
    const dimVectors: number[][] = [];
    for (let d = 0; d < dimCount; d++) {
      dimVectors.push(props.vectors.map((v) => v.vector[d] ?? 0));
    }

    if (props.vectors.length >= 2) {
      // 銘柄同士の各次元相関（コサイン距離行列）を計算
      const dimDistanceMatrix = new Matrix(createCosineDistanceMatrix(dimVectors));
      const mdsResult = classicalMDS(dimDistanceMatrix, 3);
      return convertMdsToSphere(mdsResult, GLOBE_RADIUS);
    } else {
      // 銘柄数が2未満の場合は球面上に均等分散配置
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
        star.targetColor = new THREE.Color().set(jetMap(colorScale).hex());
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
        <Canvas camera={{ position: 30, fov: 55 }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[1, 1, 1]} intensity={0.8} />

          {/* 土台となる地球の球体 */}
          <Sphere args={[GLOBE_RADIUS, 32, 32]}>
            <meshStandardMaterial color="#202028" wireframe transparent opacity={0.6} />
          </Sphere>

          {/* 個別表示モード時の全次元ベクトルヒートマップ */}
          {!isGloval && selectedStar && (
            <SakeVectorHeatmap
              vector={selectedStar.vector}
              dimensionPositions={dimensionPositions}
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
          className="absolute bottom-4 left-4 text-white bg-slate-900/80 p-4 rounded-xl backdrop-blur-sm max-w-md"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-bold text-lg">
              {!isGloval && selectedStar
                ? `🍶 ${selectedStar.name} のベクトル分布`
                : '🍶 日本酒ペアリング球'}
            </h3>
            <span className="text-xs text-slate-400">
              {sakeStars.length}/{props.vectors.length}件
            </span>
          </div>

          <p className="text-xs text-slate-300 mb-2">
            {!isGloval && selectedStar
              ? '相関のある次元同士が近く並ぶよう球表面に配置し、この銘柄の各次元の反応強度を色で表現しています。'
              : '銘柄ラベルをクリックすると、その日本酒の全次元ベクトルを球表面全体に表示します。'}
          </p>

          <div id="legend" className="flex flex-wrap gap-2 text-xs">
            {!isGloval && selectedStar ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-red-500"></span>
                  <span>高反応(正)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-blue-500"></span>
                  <span>逆反応(負)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full inline-block bg-slate-600"></span>
                  <span>無反応</span>
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
        </div>
      </div>
    </div>
  );
};
