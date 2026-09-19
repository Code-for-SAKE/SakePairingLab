# 日本酒ペアリングラボ セキュリティ仕様書 (Security Spec)

本ドキュメントは「日本酒ペアリングラボ」における Firestore セキュリティルールおよびデータ保護に関するセキュリティ仕様と、想定される脅威（Dirty Dozen）への対策を定義したものです。

---

## 1. データの不変条件 (Data Invariants)

1. **ユーザー管理 (`User`)**
   - `User` ドキュメントの作成・更新は、認証された本人のみ（`request.auth.uid == userId`）実行可能です。
   - `id` フィールドは作成後に変更不可（Immutable）です。
2. **日本酒データ (`Sake`)**
   - `Sake` ドキュメントは認証済みユーザーであれば誰でも新規登録できますが、誤削除や改ざん防止のため削除（delete）は許可されません。
   - 作成者情報 (`createdBy`) は本人の UID と一致している必要があります。
3. **レビュー・ペアリング記録 (`Review`)**
   - `Review` ドキュメントは認証済みユーザーが作成可能ですが、`userId` は本人の UID と一致している必要があります。
   - 自身のレビューのみ更新および削除（update / delete）が可能です。他人のレビューは操作できません。
   - `sakeId` や `createdAt` などの基本メタデータは作成後に変更不可（Immutable）です。
4. **タイムスタンプの整合性 (`createdAt`)**
   - 作成時のタイムスタンプ（`createdAt`）はクライアント時刻ではなく、サーバー時刻 `request.time` と完全一致していなければなりません。
5. **スキーマおよびデータ制限**
   - 文字列の最大長（例: `displayName` は 50 文字以内、`comment` は 1000 文字以内など）や配列サイズ（例: `broads` は最大 10 個、`specific` は最大 20 個）を厳密に制限し、リソース枯渇や異常値の登録を防止します。

---

## 2. 想定脅威とテストペイロード (The "Dirty Dozen" Payloads)

Firestore セキュリティルールでブロック対象としている代表的な12の脅威シナリオと対策方針です。

| No. | 脅威分類 / ペイロード                               | 攻撃シナリオ概要                                                                                  | セキュリティ仕様 / 対策                                                                                           |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | **ID なりすまし (Identity Spoofing)**               | ユーザー A がユーザー B の `userId` を指定して `User` ドキュメントを作成しようとする。            | `request.auth.uid == userId` かつ `data.id == request.auth.uid` を強制し、他者ドキュメントの作成・更新を拒否。    |
| 2   | **スキーマ違反 (Schema Violation)**                 | 2MB を超える巨大な `displayName` を含む `User` ドキュメントを送信し、DB 負荷や UI 破壊を狙う。    | `data.displayName is string && data.displayName.size() <= 50` により文字数上限を検証し拒否。                      |
| 3   | **日本酒データのポイズニング (Sake Poisoning)**     | 必須項目である `brewery`（蔵元名）を欠落させた不正な `Sake` ドキュメントを作成しようとする。      | `data.keys().hasAll(['brewery', 'brand', 'bottle', 'createdAt', 'createdBy'])` により必須キーの存在を検証し拒否。 |
| 4   | **日本酒作成者の偽装 (Sake Identity)**              | `createdBy` に自身以外の UID を指定して `Sake` ドキュメントを作成しようとする。                   | `data.createdBy == request.auth.uid` を強制し、作成者メタデータの偽装を防止。                                     |
| 5   | **レビュー作成者のなりすまし (Review Spoofing)**    | ユーザー A がレビューを作成する際、`userId` にユーザー B の UID を設定して投稿しようとする。      | `data.userId == request.auth.uid` を強制し、他者名義でのレビュー投稿を遮断。                                      |
| 6   | **孤立リレーションの作成 (Review Relation Orphan)** | 存在しない、または不正な形式の `sakeId` を指定して `Review` を作成しようとする。                  | `isValidId(data.sakeId)` により ID 形式・長さを厳格にバリデーション。                                             |
| 7   | **過去/未来時刻の偽装 (Time Traveling)**            | 過去や未来のタイムスタンプを `createdAt` に指定してレビューを投稿しようとする。                   | `data.createdAt == request.time` を強制し、サーバー時刻以外での登録を拒否。                                       |
| 8   | **不正な配列要素型 (Invalid Array Type)**           | `aroma.broads` や `taste.broads` に文字列ではなく数値やオブジェクトを含めて送信する。             | `isValidTasteProfile()` 内で `broads[0] is string` などを検証し、配列要素の型安全性を確保。                       |
| 9   | **配列サイズ枯渇攻撃 (Array Size Exhaustion)**      | `taste.specific` に 1000 個の要素を詰め込んだ巨大配列を送信し、読み取りコストや帯域を圧迫させる。 | `profile.broads.size() <= 10` および `profile.specific.size() <= 20` により要素数を厳格に制限。                   |
| 10  | **他者レビューの改ざん (Review Tampering)**         | ユーザー B がユーザー A の投稿した `Review` ドキュメントを更新・削除しようとする。                | `existing().userId == request.auth.uid` により、作成者本人以外による更新・削除を完全に拒否。                      |
| 11  | **データ型の汚染 (Value Poisoning)**                | `likesCount` などの数値フィールドに文字列を代入して更新し、クライアント側の処理落ちを誘発する。   | `incoming().likesCount is number` を検証し、許可された型以外の書き込みを拒否。                                    |
| 12  | **過剰読み取り・課金攻撃 (Denial of Wallet)**       | 条件なしで全件取得クエリを実行し、Read コストを急増させる。                                       | 各コレクションの取得に適切な ID チェックやクエリ制限を前提とし、ルールで許可されたパス・構造のみ読み取りを許可。  |
