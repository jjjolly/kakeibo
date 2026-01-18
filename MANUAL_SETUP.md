# Firebase手動セットアップ手順

## 1. Firestoreセキュリティルールの設定

### 手順：

1. **Firebase Consoleを開く**
   - https://console.firebase.google.com/ にアクセス

2. **プロジェクトを選択**
   - 「**kakeibo-app-e092a**」をクリック

3. **Firestore Databaseに移動**
   - 左側のメニューから「**Firestore Database**」をクリック
   - （初回の場合）データベースが作成済みであることを確認

4. **ルールタブを開く**
   - 上部のタブで「**Rules**」（ルール）をクリック

5. **セキュリティルールを貼り付け**
   - エディタ内の既存の内容をすべて削除
   - 以下のルールをコピーして貼り付けてください：

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // recordsコレクション: 認証済みユーザーのみアクセス可能
    match /records/{recordId} {
      // 認証済みユーザーは読み取り可能
      allow read: if request.auth != null;

      // 認証済みユーザーは作成・更新・削除可能
      allow create: if request.auth != null
                    && request.resource.data.createdAt is timestamp;

      allow update: if request.auth != null;

      allow delete: if request.auth != null;
    }
  }
}
```

6. **公開する**
   - 「**公開**」（Publish）ボタンをクリック
   - 確認ダイアログが表示されたら「**公開**」をクリック

✅ これでFirestoreのセキュリティルールが設定されました！

---

## 2. アプリケーションのデプロイ（Windows環境から）

### 前提条件確認

PowerShellまたはコマンドプロンプトを開いて確認：

```powershell
# Node.jsのバージョン確認
node --version

# npmのバージョン確認
npm --version

# Gitのバージョン確認
git --version
```

**Node.jsがインストールされていない場合:**
- https://nodejs.org/ からLTS版をダウンロードしてインストール

**Gitがインストールされていない場合:**
- https://git-scm.com/download/win からダウンロードしてインストール

### デプロイ手順

#### 1. プロジェクトをクローン

PowerShellで以下を実行：

```powershell
# ドキュメントフォルダに移動
cd $HOME\Documents

# GitHubリポジトリをクローン（URLは実際のリポジトリURLに置き換えてください）
git clone https://github.com/jjjolly/kakeibo.git
cd kakeibo

# 作業ブランチに切り替え
git checkout claude/setup-sheets-integration-40kFP
```

#### 2. .envファイルを作成

プロジェクトフォルダ内に`.env`ファイルを作成し、以下の内容を貼り付けます：

```env
# Firebase設定
VITE_FIREBASE_API_KEY=AIzaSyDRsopbf544JsMlvInK49KgehubEhhfGv8
VITE_FIREBASE_AUTH_DOMAIN=kakeibo-app-e092a.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kakeibo-app-e092a
VITE_FIREBASE_STORAGE_BUCKET=kakeibo-app-e092a.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=910111901941
VITE_FIREBASE_APP_ID=1:910111901941:web:d0d8173f4f7d7d01bc9dbc

# Google Sheets設定
VITE_GOOGLE_SHEETS_API_KEY=AIzaSyAXhSxoHM4NIcfLSBj4Q9WCfTiRxWjVmFs
VITE_GOOGLE_SHEETS_SPREADSHEET_ID=1ElMcJwdhk92glUN4dtUG6v1rUHUBvtTXv6yeCuOrT7o
```

PowerShellで作成する場合：

```powershell
# .envファイルを作成
@"
# Firebase設定
VITE_FIREBASE_API_KEY=AIzaSyDRsopbf544JsMlvInK49KgehubEhhfGv8
VITE_FIREBASE_AUTH_DOMAIN=kakeibo-app-e092a.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kakeibo-app-e092a
VITE_FIREBASE_STORAGE_BUCKET=kakeibo-app-e092a.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=910111901941
VITE_FIREBASE_APP_ID=1:910111901941:web:d0d8173f4f7d7d01bc9dbc

# Google Sheets設定
VITE_GOOGLE_SHEETS_API_KEY=AIzaSyAXhSxoHM4NIcfLSBj4Q9WCfTiRxWjVmFs
VITE_GOOGLE_SHEETS_SPREADSHEET_ID=1ElMcJwdhk92glUN4dtUG6v1rUHUBvtTXv6yeCuOrT7o
"@ | Out-File -FilePath .env -Encoding UTF8
```

#### 3. 依存関係をインストール

```powershell
npm install
```

#### 4. Firebase CLIをインストール

```powershell
npm install -g firebase-tools
```

#### 5. Firebaseにログイン

```powershell
firebase login
```

ブラウザが開き、Googleアカウントでログインを求められます。
許可を与えると、ターミナルに戻ります。

#### 6. アプリケーションをデプロイ

```powershell
npm run deploy
```

このコマンドは以下を実行します：
1. `npm run build` でアプリケーションをビルド
2. `firebase deploy` でFirebase Hostingにデプロイ

#### 7. デプロイ完了

デプロイが完了すると、以下のURLが表示されます：

```
✔  Deploy complete!

Hosting URL: https://kakeibo-app-e092a.web.app
```

---

## 3. アプリケーションの初期設定

### ユーザーアカウントの作成

1. デプロイしたアプリケーション（https://kakeibo-app-e092a.web.app）にアクセス

2. 「新規登録」タブをクリック

3. Seigoさんのアカウントを作成：
   - 表示名: **Seigo**
   - メールアドレス: （任意のメールアドレス、例：seigo@example.com）
   - パスワード: （安全なパスワード）
   - 「サインアップ」をクリック

4. ログアウトして、Hanakaさんのアカウントも作成：
   - 表示名: **Hanaka**
   - メールアドレス: （任意のメールアドレス、例：hanaka@example.com）
   - パスワード: （安全なパスワード）

### Google Sheetsのデータ準備

スプレッドシートID: `1ElMcJwdhk92glUN4dtUG6v1rUHUBvtTXv6yeCuOrT7o`
シート名: `Master`

データフォーマット：

| A列: 日付 | B列: 店名 | C列: 金額 | D列: 支払方法 |
|----------|---------|---------|------------|
| 2026-01-15 | スーパーマーケット | 3580 | クレジットカードA |
| 2026-01-14 | レストランB | 8500 | QR決済 |
| 2026-01-13 | ガソリンスタンド | 5200 | クレジットカードB |

### アプリケーションの使い方

1. ログイン後、「**Sheetsから読込**」ボタンをクリック
2. Google Sheetsからデータが自動的にインポートされます
3. 各レコードの精算方法を選択：
   - **Seigoが全額立替**: Seigoが支払い、Hanakaが半額を精算
   - **Hanakaが全額立替**: Hanakaが支払い、Seigoが半額を精算
   - **折半**: 2人で等分（精算なし）
   - **比率**: 任意の比率で設定
   - **金額指定**: 片方の負担額を直接指定
4. 「保存」をクリック

---

## トラブルシューティング

### Firebase loginで「command not found」エラー

PowerShellを再起動してから再度実行してください。

### デプロイ時にエラーが出る場合

```powershell
# プロジェクトを確認
firebase projects:list

# プロジェクトを設定
firebase use kakeibo-app-e092a

# 再度デプロイ
npm run deploy
```

### ビルドエラーが出る場合

```powershell
# node_modulesを削除して再インストール
Remove-Item -Recurse -Force node_modules
npm install

# 再度ビルド
npm run build
```
