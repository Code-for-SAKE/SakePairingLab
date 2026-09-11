import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Target, Award, Zap, Loader2, Plus } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Sake } from '../types';

interface GeneratedQuest {
  id: string;
  sakeId: string;
  sakeBrand: string;
  sakeBottle: string;
  title: string;
  description: string;
  targetPairing?: string;
  targetTemperature?: string;
  targetVessel?: string;
  status: 'open' | 'completed';
  rewardPoints: number;
}

export default function QuestPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [quests, setQuests] = useState<GeneratedQuest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchQuestsFromSakes = async () => {
      try {
        setLoading(true);
        const sakesSnap = await getDocs(collection(db, 'sakes'));
        const sakes = sakesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sake));

        // Generate quests based on actual sakes in Firestore
        const generated: GeneratedQuest[] = [];

        sakes.forEach((sake, index) => {
          // Quest type A: Pairing quest
          generated.push({
            id: `quest-pairing-${sake.id}`,
            sakeId: sake.id,
            sakeBrand: sake.brand,
            sakeBottle: sake.bottle,
            title: `【${sake.brand}】未知のペアリングを探せ`,
            description: `${sake.brand}に合う最高のおつまみや料理の組み合わせをレポートしてください。`,
            targetPairing: index % 2 === 0 ? '魚料理・和食' : '肉料理・洋食',
            status: 'open',
            rewardPoints: 50,
          });

          // Quest type B: Temperature quest
          generated.push({
            id: `quest-temp-${sake.id}`,
            sakeId: sake.id,
            sakeBrand: sake.brand,
            sakeBottle: sake.bottle,
            title: `【${sake.brand}】温度変化の妙`,
            description: `冷酒または燗酒での味わいの変化をテイスティングしてレビューしましょう。`,
            targetTemperature: index % 2 === 0 ? '花冷え (10℃)' : 'ぬる燗 (40℃)',
            status: 'open',
            rewardPoints: 100,
          });
        });

        if (isMounted) {
          setQuests(generated);
        }
      } catch (err) {
        console.error('Error loading quests from sakes:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchQuestsFromSakes();

    return () => {
      isMounted = false;
    };
  }, []);
  return (
    <div className="max-w-xl mx-auto pt-6 px-4 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">クエスト</h1>
          <p className="text-sm text-slate-500 mt-1">未開拓のペアリングを見つけよう</p>
        </div>
        <div className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-sm font-bold flex items-center">
          <Award className="w-4 h-4 mr-1" />
          称号：{profile?.title || '見習い'}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
          <p className="text-sm">クエストを読み込み中...</p>
        </div>
      ) : quests.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
          <p className="text-slate-600 font-medium mb-2">まだ対象の日本酒が登録されていません</p>
          <p className="text-slate-400 text-sm mb-6">日本酒を登録すると、新しいペアリングクエストが自動生成されます！</p>
          <Link
            to="/sake/new"
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            日本酒を登録する
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {quests.map((quest) => (
            <div key={quest.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
              
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-slate-900">{quest.title}</h3>
                <div className="flex items-center text-amber-500 font-bold text-sm bg-amber-50 px-2 py-1 rounded-md">
                  <Zap className="w-3 h-3 mr-1" />
                  {quest.rewardPoints} pt
                </div>
              </div>
              
              <p className="text-sm font-medium text-indigo-600 mb-3">対象: {quest.sakeBrand} {quest.sakeBottle}</p>
              <p className="text-slate-600 text-sm mb-4 leading-relaxed">{quest.description}</p>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {quest.targetTemperature && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md">指定温度: {quest.targetTemperature}</span>
                )}
                {quest.targetPairing && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md">指定ペアリング: {quest.targetPairing}</span>
                )}
              </div>

              <button
                onClick={() => navigate(`/sake/${quest.sakeId}/review`, { 
                  state: { 
                    questId: quest.id, 
                    targetTemperature: quest.targetTemperature, 
                    targetPairing: quest.targetPairing,
                    targetVessel: quest.targetVessel
                  } 
                })}
                className="w-full bg-indigo-50 text-indigo-700 font-medium py-2.5 rounded-xl text-sm hover:bg-indigo-100 transition-colors flex items-center justify-center"
              >
                <Target className="w-4 h-4 mr-2" />
                クエストに挑戦する
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
