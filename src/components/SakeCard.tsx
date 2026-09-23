import { Sake } from '../types';
import { Link } from 'react-router-dom';
import { SakeFlavorImage } from './SakeFlavorImage';

interface SakeCardProps {
  sake: Sake;
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
          />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">{sake.brewery}</p>
          <p className="font-bold text-slate-900 text-lg mb-1">{sake.brand}</p>
          <p className="text-sm text-slate-600">{sake.bottle}</p>
        </div>
        {isUsingVectorSearch && (
          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md shrink-0 ml-2">
            AIマッチ
          </span>
        )}
      </div>
    </Link>
  );
};
