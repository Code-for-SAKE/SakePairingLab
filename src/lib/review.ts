import { doc, getDoc } from 'firebase/firestore';
import { Review, Sake, UserProfile } from '../types';
import { db } from './firebase';

const userCache = new Map<string, UserProfile>();
const sakeCache = new Map<string, Sake>();

type EnrichOptions = {
  withUser?: boolean;
  withSake?: boolean;
};

type EnrichedReview<T extends Review, O extends EnrichOptions> = T &
  (O extends { withUser: false } ? { user?: UserProfile } : {}) &
  (O extends { withSake: false } ? { sake?: Sake } : {});

type ReviewWithRelations = Review & { user?: UserProfile; sake?: Sake };

export async function enrichReviews<T extends Review, O extends EnrichOptions>(
  reviews: T[] | null,
  options: O,
): Promise<EnrichedReview<T, O>[]> {
  if (!reviews || reviews.length === 0) {
    return [];
  }

  const enrichedReviews = reviews as EnrichedReview<T, O>[];
  const reviewsWithRelations = enrichedReviews as ReviewWithRelations[];

  for (const review of reviewsWithRelations) {
    if (options.withUser) {
      if (review.userId && !userCache.has(review.userId)) {
        try {
          const uDoc = await getDoc(doc(db, 'users', review.userId));
          if (uDoc.exists()) {
            userCache.set(review.userId, { id: uDoc.id, ...uDoc.data() } as UserProfile);
          }
        } catch (err) {
          console.error('Error fetching user:', err);
        }
      }
      if (review.userId && userCache.has(review.userId)) {
        review.user = userCache.get(review.userId);
      }
    }
    if (options.withSake) {
      if (review.sakeId && !sakeCache.has(review.sakeId)) {
        try {
          const sDoc = await getDoc(doc(db, 'sakes', review.sakeId));
          if (sDoc.exists()) {
            sakeCache.set(review.sakeId, { id: sDoc.id, ...sDoc.data() } as Sake);
          }
        } catch (err) {
          console.error('Error fetching sake:', err);
        }
      }
      if (review.sakeId && sakeCache.has(review.sakeId)) {
        review.sake = sakeCache.get(review.sakeId);
      }
    }
  }

  // Sort reviews by createdAt descending
  reviews.sort((a, b) => {
    const timeA =
      typeof a.createdAt === 'number'
        ? a.createdAt
        : a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : 0;
    const timeB =
      typeof b.createdAt === 'number'
        ? b.createdAt
        : b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : 0;
    return timeB - timeA;
  });
  return enrichedReviews;
}
