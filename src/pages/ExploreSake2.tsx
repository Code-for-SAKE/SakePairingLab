import { useState } from 'react';
import { GlobeVisualizer } from '../components/GlobeVisualizer';
import VectorMaker from '../components/VectorMaker';
import { TextVector } from '../dummyTypes';

export default function ExploreSake() {
  const [vectors, setVectors] = useState<TextVector[]>([]);

  const onDataChange = (data: TextVector[]) => {
    setVectors(data);
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
        <VectorMaker onDataChange={onDataChange} />
        <GlobeVisualizer vectors={vectors} />
      </div>
    </div>
  );
}
