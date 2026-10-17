import { SakeSearchResult } from '../types';
import { Link } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { SakeFlavorImage } from './SakeFlavorImage';
import { db } from '../lib/firebase';

interface SakeCardProps {
  sake: SakeSearchResult;
  isUsingVectorSearch?: boolean;
}

export const SakeCard = (props: SakeCardProps) => {
  const { sake, isUsingVectorSearch = false } = props;
  return (
    <Link
      key={sake.id}
      to={`/sake/${sake.id}`}
      className="block bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:border-indigo-300 transition-colors"
    >
      <div className="flex items-start">
        <div className="w-20 mr-5">
          <SakeFlavorImage
            sakeId={sake.id}
            sakeName={`${sake.brand} ${sake.bottle}(${sake.brewery})`}
            imageUrl={sake.imageUrl}
            onImageUrlChange={(imageUrl) =>
              updateDoc(doc(db, 'sakes', sake.id), { imageUrl })
            }
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 mb-1 truncate">{sake.brewery}</p>
          <p className="font-bold text-slate-900 text-lg mb-1 truncate">{sake.brand}</p>
          <p className="text-sm text-slate-600 truncate">{sake.bottle}</p>
        </div>
        {isUsingVectorSearch && (
          <div className="flex flex-col items-end shrink-0 ml-2 space-y-1">
            {sake.matchType === 'basic' ? (
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md">
                基本情報一致
              </span>
            ) : sake.matchType === 'taste' ? (
              <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">
                味わい一致
              </span>
            ) : (
              <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">
                AIマッチ
              </span>
            )}
            {typeof sake.similarity === 'number' && (
              <span className="text-[11px] font-bold text-slate-600">
                {Math.round(Math.max(0, Math.min(1, sake.similarity)) * 100)}% 一致
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
};
