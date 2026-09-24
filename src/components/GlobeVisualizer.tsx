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
import { relative } from 'path';

// 例1: 定番のカラーマップ「Jet (レインボー)」
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
  const rows = mdsResult.rows; // データの個数
  const spherePositions: THREE.Vector3[] = [];

  for (let i = 0; i < rows; i++) {
    // classicalMDSの戻り値から、各星のX, Y, Zを取得
    let x = mdsResult.get(i, 0);
    let y = mdsResult.get(i, 1);
    let z = mdsResult.get(i, 2);

    // 【重要】原点からの現在の距離（半径）を測定
    const currentDist = Math.sqrt(x * x + y * y + z * z);

    const vec = new THREE.Vector3(x, y, z);
    if (currentDist > 0) {
      // ベクトルの長さを1にしてから、指定の半径（100）に引き伸ばす（L2正規化）
      // これにより、MDSの繋がりをキープしたまま、完全に球面の表面に星が張り付きます
      vec.normalize().multiplyScalar(radius);
    }
    spherePositions.push(vec);
  }

  return spherePositions;
}

// --- 3. 個々の「星（日本酒）」を表す内部コンポーネント ---
const SakeStar: React.FC<{ data: SakeStarData }> = ({ data }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  // マウスが乗っているかどうかの状態（ホバーした星だけラベルを大きく目立たせるなどの演出用）
  const [isHovered, setIsHovered] = useState(false);

  // 現在の位置と色を保持（LERPアニメーション用）
  const currentPos = useMemo(() => data.initialPos.clone(), [data.initialPos]);
  const currentColor = useMemo(() => data.initialColor.clone(), [data.initialColor]);

  // 毎フレーム（60fps）実行されるアニメーションループ
  useFrame(() => {
    if (!meshRef.current) return;
    // 現在のモードに合わせて「目的地」と「目標の色」を決定
    const targetP = data.targetPos;
    const targetC = data.targetColor;

    const distanceP = currentPos.distanceTo(targetP);
    const distanceC = chroma.distance(currentColor.getHexString(), targetC.getHexString());

    if (distanceP < 0.01 && distanceC < 0.01) {
      return;
    }

    // 1. 位置の補間 (LERP) と球面上へのクランプ
    currentPos.lerp(targetP, ANIMATION_SPEED);
    currentPos.normalize().multiplyScalar(GLOBE_RADIUS);
    meshRef.current.position.copy(currentPos);

    // 2. 色の補間 (LERP)
    currentColor.lerp(targetC, ANIMATION_SPEED);
    // マテリアルに色を直接反映
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.color.copy(currentColor);
  });

  return (
    <mesh
      ref={meshRef}
      onPointerOver={(e) => {
        e.stopPropagation(); // 他の星とイベントが重なるのを防ぐ
        setIsHovered(true);
      }}
      onPointerOut={() => setIsHovered(false)}
    >
      <sphereGeometry args={[1.5, 16, 16]} />
      <meshBasicMaterial />
      {/* 💡 3D空間の星の位置に連動して表示される2DのHTMLラベル */}
      <Html
        distanceFactor={180} // 🗺️ 迷子防止：カメラが遠く離れたら文字を自動で小さくする設定
        center // テキストの中心を星の座標に合わせる
        style={{
          pointerEvents: 'none', // マウス操作が地球儀の回転の邪魔をしないようにする
          whiteSpace: 'nowrap',
          transition: 'all 0.1s ease',
        }}
      >
        <div
          style={{
            // 星の「右斜め上」に少しずらして見やすく配置
            transform: 'translate(10px, -10px)',
            backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 10, 25, 0.65)',
            color: isHovered ? '#05050c' : '#ffffff',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: isHovered ? '12px' : '10px',
            fontWeight: isHovered ? 'bold' : 'normal',
            border: isHovered ? '1px solid #4c4c9d' : '1px solid rgba(255,255,255,0.2)',
            boxShadow: isHovered ? '0 0 10px rgba(140,140,255,0.5)' : 'none',
            fontFamily: 'monospace', // ID数字が綺麗に揃うフォント
          }}
        >
          {/* 星のIDを表示（マウスホバー時は銘柄名も一緒に見せるなどの応用が可能） */}
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
  // ダミーデータの一度限りの生成（useMemoで再レンダリング防止）
  const [sakeStars, setSakeStars] = useState<SakeStarData[]>([]);
  const [query, setQuery] = useState<string>('');

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
        console.log(color[i], colorScale);
        star.targetColor = new THREE.Color().set(jetMap(colorScale).hex());
        star.targetPos = vectors[i];
        star.similarity = color[i];
        return star;
      }),
    );
  };

  useEffect(() => {
    const stars: SakeStarData[] = [];
    if (props.vectors.length == 0) {
      return;
    }
    const baseEmbeddings = props.vectors.map((vec, i) => {
      return vec.vector;
    });
    const initDistanceMatrix = new Matrix(createCosineDistanceMatrix(baseEmbeddings));
    const initMdsResult = classicalMDS(initDistanceMatrix, 3);
    const initialVectors = convertMdsToSphere(initMdsResult);

    props.vectors.map((vec, i) => {
      stars.push({
        id: i,
        name: vec.name,
        vector: vec.vector,
        similarity: 0,
        initialPos: new THREE.Vector3(),
        targetPos: initialVectors[i],
        initialColor: new THREE.Color('#9090a0'), // グレー
        targetColor: new THREE.Color('#9090a0'), // 赤 or 青
      });
    });
    setSakeStars(stars);

    return;
  }, [props.vectors]);

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
      <div
        style={{ width: '70vw', height: '70vh', position: 'relative', backgroundColor: 'black' }}
      >
        {/* 3D レンダリング空間 (Canvas) */}
        <Canvas camera={{ position: 10, fov: 55 }}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[1, 1, 1]} intensity={0.8} />

          {/* 土台となる地球の球体 */}
          <Sphere args={[GLOBE_RADIUS, 32, 32]}>
            <meshStandardMaterial
              color="#303030"
              wireframe // 迷子防止のワイヤーフレーム（またはテクスチャに差し替え可能）
              transparent
              opacity={1}
            />
          </Sphere>

          {/* 複数の星（日本酒）を一斉に描画 */}
          <group>
            {sakeStars.map((star) => (
              <SakeStar key={star.id} data={star} />
            ))}
          </group>

          {/* マウス操作を可能にするコントロール */}
          <OrbitControls enableDamping dampingFactor={0.05} />
        </Canvas>

        {/* HTML / React によるUIレイヤー（styleは前回のCSSを適用、またはテイルウィンド等で代用可能） */}
        <div id="ui-container" className="absolute bottom-4 left-2 text-white">
          {sakeStars.length}/{props.vectors.length}件<h3>日本酒ペアリング球</h3>
          <p>座標は「文脈（理由・特徴）」を表し、色は「関連度」を表します。</p>
          <div id="legend">
            <div className="legend-item">
              <div className="color-box m-1 p-1 rounded-lg" style={{ background: '#3333ff80' }}>
                関連高い
              </div>
            </div>
            <div className="legend-item">
              <div className="color-box m-1 p-1 rounded-lg" style={{ background: '#ff333380' }}>
                関連低い
              </div>
            </div>
            <div className="legend-item">
              <div className="color-box m-1 p-1 rounded-lg" style={{ background: '#9090a080' }}>
                未検証 / 関係なし
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
