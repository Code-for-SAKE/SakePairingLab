import { useEffect, useState } from 'react';
import { GlobeVisualizer } from '../components/GlobeVisualizer';
import VectorMaker from '../components/VectorMaker';
import { TextVector } from '../dummyTypes';
import { DimensionPosition } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function ExploreSake() {
  const { profile } = useAuth();
  const [initialVectors, setInitialVectors] = useState<TextVector[]>([]);
  const [vectors, setVectors] = useState<TextVector[]>([]);
  const [dimensionPositions, setDimensionPositions] = useState<DimensionPosition[]>([]);

  useEffect(() => {
    let isMounted = true;

    import('../data/initialVectors.json').then(({ default: data }) => {
      if (!isMounted) return;
      setInitialVectors(data);
      setVectors(data);
    });

    import('../data/dimensionPositions.json').then(({ default: data }) => {
      if (!isMounted) return;
      setDimensionPositions(data);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const onDataChange = (data: TextVector[]) => {
    setVectors(data);
  };

  const handleDownloadDimensionPositions = () => {
    if (profile?.role !== 'admin' || dimensionPositions.length === 0) return;

    const blob = new Blob([JSON.stringify(dimensionPositions, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dimensionPositions.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto pt-6 px-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">🍶 日本酒近さ検証マップ</h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.7 }}>
          1024次元ベクトル空間の直接表現
        </p>
      </div>
      <div>
        {profile?.role === 'admin' && (
          <div className="p-3 mb-2 border rounded-2xl">
            <h2>管理機能</h2>
            <VectorMaker initialVectors={initialVectors} onDataChange={onDataChange} />
            <button
              className="w-full bg-slate-700 text-white py-2 my-2 rounded-lg text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
              onClick={handleDownloadDimensionPositions}
              disabled={dimensionPositions.length === 0}
            >
              次元配置JSONをダウンロード ({dimensionPositions.length}次元)
            </button>
          </div>
        )}
        <GlobeVisualizer
          vectors={vectors}
          dimensionPositions={dimensionPositions}
          onDimensionPositionsCalculated={setDimensionPositions}
        />
      </div>
    </div>
  );
}
