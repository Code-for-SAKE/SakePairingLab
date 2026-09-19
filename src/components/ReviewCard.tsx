import { formatDistanceToNow } from "date-fns";
import { ReviewWithUser } from "../types";
import { ja } from "date-fns/locale";
import RatingBadge from "./RatingBadge";
import { Heart } from "lucide-react";

interface ReviewCardProps {
    review: ReviewWithUser;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({ review }: ReviewCardProps) => {
    return (
        <div key={review.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm">
                        {review.user?.displayName?.[0] || '名'}
                    </div>
                    <div>
                        <p className="font-medium text-slate-900 text-sm">{review.user?.displayName || 'ユーザー'}</p>
                        <p className="text-xs text-slate-400">
                            {review.createdAt ? formatDistanceToNow(
                                typeof review.createdAt === 'number' ? review.createdAt : review.createdAt.toMillis ? review.createdAt.toMillis() : Date.now(),
                                { addSuffix: true, locale: ja }
                            ) : ''}
                        </p>
                    </div>
                </div>
                <RatingBadge rating={review.rating} />
            </div>

            {review.comment && (
                <p className="text-slate-700 text-sm mb-3">{review.comment}</p>
            )}

            <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs mb-3">
                {review.temperature && (
                    <div>
                        <span className="text-slate-400 block mb-0.5">温度</span>
                        <span className="font-medium text-slate-700">{review.temperature}</span>
                    </div>
                )}
                {review.vessel && (
                    <div>
                        <span className="text-slate-400 block mb-0.5">酒器</span>
                        <span className="font-medium text-slate-700">{review.vessel}</span>
                    </div>
                )}
                {review.pairing && (
                    <div className="col-span-2">
                        <span className="text-slate-400 block mb-0.5">ペアリング</span>
                        <span className="font-medium text-slate-700">{review.pairing}</span>
                    </div>
                )}
            </div>

            {((review.aroma?.broads && review.aroma.broads.length > 0) || (review.taste?.broads && review.taste.broads.length > 0) || review.aroma?.custom || review.taste?.custom) && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {review.aroma?.broads?.map((a, i) => (
                        <span key={`aroma-${i}`} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                            香: {a}
                        </span>
                    ))}
                    {review.aroma?.custom && (
                        <span className="text-xs bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-full font-medium border border-indigo-200">
                            香(メモ): {review.aroma.custom}
                        </span>
                    )}
                    {review.taste?.broads?.map((t, i) => (
                        <span key={`taste-${i}`} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                            味: {t}
                        </span>
                    ))}
                    {review.taste?.custom && (
                        <span className="text-xs bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                            味(メモ): {review.taste.custom}
                        </span>
                    )}
                </div>
            )}

            <div className="flex items-center text-slate-400 text-xs mt-2">
                <span className="flex items-center space-x-1">
                    <Heart className="w-3.5 h-3.5 text-slate-400" />
                    <span>{review.likesCount || 0}</span>
                </span>
            </div>
        </div>
    );
}