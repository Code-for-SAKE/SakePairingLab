import React, { useEffect, useState, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
// @ts-ignore (型定義エラーの回避用)
import fcose from 'cytoscape-fcose';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { NetworkResponse } from '../types';

// 自動配置アルゴリズムを登録
cytoscape.use(fcose);

// APIデータの型定義
interface ApiNode {
  id: string;
  label: string; // 日本酒名など
  cluster: number; // 近似やml-kmeansで決まったクラスタID (0, 1, 2...)
  info: string; // ホバー/クリック時に表示する文脈情報
}

interface ApiLink {
  source: string;
  target: string;
  weight: number; // コサイン類似度スコア (0.75〜1.0)
}

// クラスタごとの色分けパレット
const CLUSTER_COLORS = [
  '#FF6B6B',
  '#4D96FF',
  '#6BCB77',
  '#FFD93D',
  '#9B5DE5',
  '#F15BB5',
  '#00BBF9',
  '#00F5D4',
];

export const SakeNetworkVisualizer: React.FC = () => {
  const [elements, setElements] = useState<cytoscape.ElementDefinition[]>([]);
  const [selectedInfo, setSelectedInfo] = useState<string | null>(
    'ノード（点）をクリックすると、詳細な味わいやペアリングの文脈が表示されます。',
  );
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    const loadGraphData = async () => {
      try {
        const functions = getFunctions(app);

        let networkData: NetworkResponse;

        // まずFirestoreのキャッシュからネットワークデータを読み取る
        try {
          const getNetwork = httpsCallable<void, NetworkResponse>(
            functions,
            'getNetworkDataVector',
          );
          const cached = await getNetwork();
          networkData = cached.data;
          console.log('Loaded cached network data from Firestore:', networkData);
        } catch (cacheErr) {
          // キャッシュがない場合はネットワークデータを再構築
          console.warn('No cached network data, rebuilding...', cacheErr);
          const rebuildAll = httpsCallable<{ reindexAll?: boolean }, NetworkResponse>(
            functions,
            'rebuildSakeNetworkData',
          );
          const res = await rebuildAll({});
          networkData = res.data;
          console.log('Rebuilt and cached network data:', networkData);
        }

        const cyElements: cytoscape.ElementDefinition[] = [];

        // 1. ノードを追加
        networkData.nodes.forEach((node) => {
          cyElements.push({
            data: {
              id: node.id,
              label: node.label,
              info: node.info,
              color: CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length],
            },
          });
        });

        // 2. リンク（エッジ）を追加
        networkData.links.forEach((link, idx) => {
          cyElements.push({
            data: {
              id: `edge-${idx}`,
              source: link.source,
              target: link.target,
              weight: link.weight,
            },
          });
        });

        setElements(cyElements);
      } catch (error) {
        console.error('データの取得に失敗しました:', error);
      }
    };

    loadGraphData();
  }, []);

  // 3. グラフの見た目（スタイル）の定義
  const cyStylesheet: any[] = [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'background-color': 'data(color)',
        width: '32px',
        height: '32px',
        'font-size': '11px',
        color: '#2C3E50',
        'text-valign': 'bottom',
        'text-margin-y': 6,
        'font-weight': 'bold',
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 'mapData(weight, 0.8, 1.0, 1.5, 6)',
        'line-color': '#DCDDE1',
        opacity: 0.5,
        'curve-style': 'haystack',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': '4px',
        'border-color': '#2C3E50',
        width: '40px',
        height: '40px',
      },
    },
  ];

  // グラフが初期化された際のイベント登録
  const handleCyInit = (cy: cytoscape.Core) => {
    cyRef.current = cy;

    // クリック（タップ）されたノードの情報を下部パネルへ
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedInfo(node.data('info'));
    });
  };

  // 力学モデル（fcose）の配置オプション設定
  const layoutOptions = {
    name: 'fcose',
    animate: true,
    animationDuration: 800,
    fit: true,
    padding: 40,
    nodeDimensionsIncludeLabels: true,
    // 類似度の重み（weight）に応じて引っ張り合う距離を動的に変える
    idealEdgeLength: (edge: any) => 60 / edge.data('weight'),
    nodeRepulsion: 5000,
  };

  return (
    <div
      style={{
        width: '100%',
        height: '70vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#F8F9FA',
      }}
    >
      {/* マップ描画エリア */}
      <div style={{ flex: 1, position: 'relative' }}>
        {elements.length > 0 ? (
          <CytoscapeComponent
            elements={elements}
            style={{ width: '100%', height: '100%' }}
            stylesheet={cyStylesheet}
            layout={layoutOptions}
            cy={handleCyInit}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              color: '#7F8C8D',
              fontSize: '14px',
            }}
          >
            ⏳ バックエンドから空間の相関データを計算・読み込み中...
          </div>
        )}
      </div>

      {/* 詳細インフォメーションパネル */}
      <div
        style={{
          padding: '20px 24px',
          background: '#FFF',
          borderTop: '1px solid #E4E7EB',
          minHeight: '90px',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#7F8C8D' }}>
          選択中の日本酒情報
        </span>
        <p
          style={{
            margin: '6px 0 0 0',
            color: '#333',
            fontSize: '15px',
            lineHeight: 1.5,
            fontWeight: 500,
          }}
        >
          {selectedInfo}
        </p>
      </div>
    </div>
  );
};
