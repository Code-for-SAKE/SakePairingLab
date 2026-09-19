import { db } from "./firebase";
import { collection, query, limit, startAfter, getDocs, DocumentSnapshot, QueryOrderByConstraint, QuerySnapshot, DocumentData } from "firebase/firestore";

export default class FirestorePager<T> {
  collectionName: string;
  orderBy: QueryOrderByConstraint;
  pageSize: number;
  lastVisibleDoc: null | DocumentSnapshot;
  isLastPage: boolean;
  /**
   * @param {string} collectionName - コレクション名 (例: "cities", "posts")
   * @param {QueryOrderByConstraint} orderBy - 並び替え条件
   * @param {number} [pageSize=5] - 1回あたりに取得する件数
   */
  constructor(collectionName: string, orderBy: QueryOrderByConstraint, pageSize = 5) {
    this.collectionName = collectionName;
    this.orderBy = orderBy;
    this.pageSize = pageSize;
    
    this.lastVisibleDoc = null; // 最後のドキュメントの状態を保持
    this.isLastPage = false;    // すべて読み込み終わったかのフラグ
  }

  /**
   * 次の5件（指定件数）を取得するメソッド
   * @returns {Promise<Array<{id: string, [key: string]: any}> | null>} 取得したデータの配列（これ以上なければnull）
   */
  async loadFirst() : Promise<T[] | null> {
    if (this.isLastPage) return null;

    try {
      const colRef = collection(db, this.collectionName);
      let q;

        // 初回読み込み
        q = query(colRef, this.orderBy, limit(this.pageSize));

      const querySnapshot = await getDocs(q);

      // データが空の場合
      if (querySnapshot.empty) {
        this.isLastPage = true;
        return [];
      }

      // 次回のために最後のドキュメントを更新
      this.lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

      // 指定件数より少なければ、次のページはないと判定
      if (querySnapshot.docs.length < this.pageSize) {
        this.isLastPage = true;
      }

      // ドキュメントのデータを配列にして返す
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];

    } catch (error) {
      console.error(`[${this.collectionName}] 取得エラー:`, error);
      throw error;
    }
  }

  /**
   * 次の5件（指定件数）を取得するメソッド
   * @returns {Promise<Array<{id: string, [key: string]: any}> | null>} 取得したデータの配列（これ以上なければnull）
   */
  async loadNext() : Promise<T[] | null> {
    if (this.isLastPage) return null;

    try {
      const colRef = collection(db, this.collectionName);
      let q;

      // 引数で受け取った fieldName や direction を動的にセット
      if (this.lastVisibleDoc === null) {
        // 初回読み込み
        q = query(colRef, this.orderBy, limit(this.pageSize));
      } else {
        // 2回目以降（カーソル指定）
        q = query(colRef, this.orderBy, startAfter(this.lastVisibleDoc), limit(this.pageSize));
      }

      const querySnapshot = await getDocs(q);

      // 次回のために最後のドキュメントを更新
      this.lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];

      // データが空の場合
      if (querySnapshot.empty) {
        this.isLastPage = true;
        return [];
      }

      // 指定件数より少なければ、次のページはないと判定
      if (querySnapshot.docs.length < this.pageSize) {
        this.isLastPage = true;
      }

      // ドキュメントのデータを配列にして返す
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];

    } catch (error) {
      console.error(`[${this.collectionName}] 取得エラー:`, error);
      throw error;
    }
  }
  /**
   * 状態を最初リセットするメソッド（検索条件の変更やリフレッシュ用）
   */
  reset() {
    this.lastVisibleDoc = null;
    this.isLastPage = false;
  }
}