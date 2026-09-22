export type UserProfile = {
  id: string;
  displayName: string;
  photoURL: string;
  title: string;
  contributionScore: number;
  tastePreferences?: any;
  role: 'user' | 'admin';
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
  embedding?: number[];
  reviewCount: number;
};

export type TasteProfile = {
  broads: string[];
  specific: string[];
  custom?: string;
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
  embedding?: number[];
};

export type Quest = {
  id: string;
  sakeId?: string;
  sakeBrand?: string;
  sakeBottle?: string;
  title: string;
  description?: string;
  targetTemperature?: string;
  targetVessel?: string;
  targetPairing?: string;
  status: 'open' | 'completed';
  rewardPoints: number;
  createdBy?: string;
  createdAt?: any;
};

export interface ClusterDoc {
  centroid: number[]; // ★このクラスタの中心を表す1024次元ベクトル（インデックス対象）
  count: number; // このクラスタに分類された累計のお酒の件数
  createdAt?: any;
}

// レスポンスの型定義
export interface NetworkNode {
  id: string;
  label: string;
  cluster: number;
  info: string;
}

export interface NetworkLink {
  source: string;
  target: string;
  weight: number;
}

export interface NetworkResponse {
  nodes: NetworkNode[];
  links: NetworkLink[];
}
