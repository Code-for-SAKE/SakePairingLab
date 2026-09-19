<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 日本酒ペアリングラボ (Sake Pairing Lab)

日本酒の美味しい飲み方やペアリングを共有・探求するコミュニティWebアプリケーションです。
</div>

---

## 🛠 技術スタック

- **フロントエンド**: React 19, TypeScript, Vite 6, Tailwind CSS 4
- **バックエンド / データベース**: Firebase (Authentication, Cloud Firestore)
- **アイコン / アニメーション**: Lucide React, Motion

---

## 🚀 ローカル開発環境の起動

### 前提条件

- **Node.js**: v18以上
- **npm**: v9以上

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで表示されたURL（通常 `http://localhost:3000` または `http://localhost:3001`）にアクセスしてください。

---

## 🌐 デプロイ手順

本プロジェクトは **Firebase (Hosting & Firestore)** を使って本番環境へ公開できます。

### 1. プロジェクトのビルド

本番向けに静的ファイル（HTML/CSS/JS）をコンパイルします。

```bash
npm run build
```

ビルドに成功すると、`dist/` ディレクトリに公開用ファイルが生成されます。

---

### 2. Firebase へのデプロイ（推奨）

#### (1) Firebase CLI の準備

Firebase CLI が未インストールの場合はインストールし、ログインします。

```bash
npm install -g firebase-tools
firebase login
```

#### (2) プロジェクトの選択

本プロジェクト (`sakepairinglab`) を指定します。

```bash
firebase use sakepairinglab
```

※一覧確認は `firebase projects:list`

#### (3) Firestore セキュリティルールのデプロイ

Firestore のアクセス制御ルール（`firestore.rules`）をデプロイします。

```bash
firebase deploy --only firestore:rules
```

#### (4) Firebase Hosting のデプロイ

ビルドしたフロントエンド静的ファイルをデプロイします。

```bash
firebase deploy --only hosting
```

> 💡 **Tip: ルールとホスティングを一括デプロイする場合**
>
> ```bash
> npm run build
> firebase deploy
> ```

#### (5) Firebase Authentication の設定（初回のみ）

Google アカウントでログインを有効化している場合、デプロイ先のドメインを許可リストに追加する必要があります。

1. [Firebase Console](https://console.firebase.google.com/) にアクセスし、`sakepairinglab` プロジェクトを開きます。
2. 左メニューの **「Authentication」** > **「設定 (Settings)」** タブ > **「承認済みドメイン (Authorized domains)」** を開きます。
3. デプロイ後に発行された Firebase Hosting のドメイン（例: `sakepairinglab.web.app` や `sakepairinglab.firebaseapp.com`）が登録されていることを確認します（登録されていない場合は「ドメインを追加」）。

---

### 3. Vercel や Netlify へのデプロイ（代替手段）

Firebase Hosting 以外の静的ホスティングを利用することも可能です。

- **ビルドコマンド**: `npm run build`
- **出力ディレクトリ**: `dist`
- **ルーティング設定**: SPA（Single Page Application）のため、すべてのパス（`/*`）を `/index.html` にリライトするように設定してください。
- **Firestore / Auth**: デプロイ先ドメインを Firebase Authentication の「承認済みドメイン」に追加してください。
