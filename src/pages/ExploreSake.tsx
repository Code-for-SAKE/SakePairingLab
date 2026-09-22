import { SakeNetworkVisualizer } from '../components/SakeNetworkVisualizer';

export default function ExploreSake() {
  return (
    <div className="mx-auto pt-6 px-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">🍶 日本酒近さ検証マップ</h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.7 }}>
          1024次元ベクトル空間の近傍検索リンク ＆ 近似クラスタリング可視化
        </p>
      </div>
      <div className="relative mb-6">
        <SakeNetworkVisualizer />
      </div>
    </div>
  );
}
