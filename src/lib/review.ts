import { doc, getDoc } from 'firebase/firestore';
import { ReviewWithUser, UserProfile } from '../types';
import { db } from './firebase';

export async function enrichReviews(reviews: ReviewWithUser[] | null): Promise<ReviewWithUser[]> {
  if (!reviews || reviews.length === 0) {
    return [];
  }
  const userCache = new Map<string, UserProfile>();
  for (const rev of reviews) {
    if (rev.userId && !userCache.has(rev.userId)) {
      try {
        const uSnap = await getDoc(doc(db, 'users', rev.userId));
        if (uSnap.exists()) {
          userCache.set(rev.userId, uSnap.data() as UserProfile);
        }
      } catch (e) {
        console.error('Error fetching user profile:', e);
      }
    }
    if (rev.userId && userCache.has(rev.userId)) {
      rev.user = userCache.get(rev.userId);
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
  return reviews;
}
