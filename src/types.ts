export type UserProfile = {
  id: string;
  displayName: string;
  photoURL: string;
  title: string;
  contributionScore: number;
  tastePreferences?: any;
};

export type Sake = {
  id: string;
  brewery: string; // 酒蔵
  brand: string; // 銘柄
  bottle: string; // ボトル
  description: string;
  imageUrl?: string;
  createdAt?: any;
  createdBy?: string;
};

export type TasteProfile = {
  broads: string[];
  specific: string[];
};

export type Review = {
  id: string;
  sakeId: string;
  userId: string;
  rating: number;
  aroma: TasteProfile;
  taste: TasteProfile;
  temperature: string;
  vessel: string;
  pairing: string;
  comment: string;
  imageUrl?: string;
  createdAt: any;
  likesCount: number;
  questId?: string;
};

export type Quest = {
  id: string;
  sakeId: string;
  title: string;
  description: string;
  targetTemperature?: string;
  targetVessel?: string;
  targetPairing?: string;
  status: 'open' | 'completed';
  rewardPoints: number;
};
