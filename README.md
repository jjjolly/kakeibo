# 家計簿アプリ (Kakeibo)

夫婦2人での使用を想定した家計簿管理アプリケーションです。Google Sheetsからデータを取り込み、精算内容の入力・管理が可能です。

## 機能

- Google Sheetsからの支出データ取り込み
- 支出の分類（カテゴリ、入力者）
- 精算管理（立替、折半、比率指定、金額指定）
- 精算状況の確認・管理
- 履歴の閲覧

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. Firebase プロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: kakeibo-app）
4. Google Analyticsは任意で設定
5. プロジェクトが作成されるまで待機

### 3. Firebase Authentication の設定

1. Firebase Consoleの左メニューから「Authentication」を選択
2. 「始める」をクリック
3. 「Sign-in method」タブを選択
4. 「メール/パスワード」を有効化
5. 必要に応じて他の認証方法も有効化

### 4. Cloud Firestore の設定

1. Firebase Consoleの左メニューから「Firestore Database」を選択
2. 「データベースの作成」をクリック
3. 「本番環境モードで開始」を選択（後でルールを設定）
4. ロケーションを選択（例: asia-northeast1（東京））
5. 「有効にする」をクリック

### 5. Firebase 設定情報の取得

1. Firebase Consoleのプロジェクト設定（歯車アイコン）を開く
2. 「全般」タブの「マイアプリ」セクションで「ウェブアプリ」を選択（</> アイコン）
3. アプリのニックネームを入力（例: kakeibo-web）
4. 「Firebase Hosting」のチェックは外す
5. 「アプリを登録」をクリック
6. 表示される `firebaseConfig` オブジェクトの値をコピー

### 6. Google Sheets API の設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. Firebaseプロジェクトを選択（または新規作成）
3. 「APIとサービス」→「ライブラリ」を開く
4. 「Google Sheets API」を検索して有効化
5. 「認証情報」→「認証情報を作成」→「APIキー」を選択
6. 作成されたAPIキーをコピー
7. （推奨）APIキーの制限を設定:
   - 「HTTPリファラー」を選択
   - デプロイ先のURLを追加（例: `https://your-domain.com/*`）
   - APIの制限で「Google Sheets API」のみを選択

### 7. Google Spreadsheet の準備

1. Google Sheetsで新しいスプレッドシートを作成
2. 以下の形式でデータを入力:

| A列: 日付    | B列: 店名          | C列: 金額 | D列: 支払方法      |
|-------------|-------------------|---------|------------------|
| 2026-01-15  | スーパーマーケット   | 3580    | クレジットカードA  |
| 2026-01-14  | レストランB        | 8500    | QR決済           |

3. スプレッドシートのURLから`SPREADSHEET_ID`を取得:
   - URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
4. スプレッドシートを「リンクを知っている全員」に共有設定

### 8. 環境変数の設定

`.env.example` をコピーして `.env` ファイルを作成:

```bash
cp .env.example .env
```

`.env` ファイルを編集して、取得した値を設定:

```env
# Firebase設定（手順5で取得）
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Google Sheets設定（手順6, 7で取得）
VITE_GOOGLE_SHEETS_API_KEY=your_google_sheets_api_key
VITE_GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
```

### 9. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開いてアプリケーションを確認できます。

## ビルド

本番環境用にビルド:

```bash
npm run build
```

ビルドされたファイルは `dist` ディレクトリに出力されます。

## セキュリティルールの設定

### Firestore セキュリティルールのデプロイ

アプリを本番環境で使用する前に、Firestoreのセキュリティルールを設定する必要があります。

```bash
# Firebase CLIをインストール（未インストールの場合）
npm install -g firebase-tools

# Firebaseにログイン
firebase login

# プロジェクトを初期化
firebase init firestore
# 既存のfirestore.rulesファイルを使用するか聞かれたら「Yes」を選択

# セキュリティルールをデプロイ
npm run deploy:rules
```

プロジェクトに含まれている `firestore.rules` ファイルは、以下のルールを設定します：
- 認証済みユーザーのみがデータの読み書きが可能
- すべてのユーザーがすべてのレコードにアクセス可能（夫婦2人での共有を想定）

## デプロイ

### Firebase Hosting にデプロイ

```bash
# Firebase CLIをインストール（未インストールの場合）
npm install -g firebase-tools

# Firebaseにログイン
firebase login

# Hostingを初期化
firebase init hosting
# 以下のように設定:
# - Public directory: dist
# - Configure as a single-page app: Yes
# - Set up automatic builds and deploys with GitHub: No

# ビルドとデプロイを実行
npm run deploy

# または、Hostingのみデプロイする場合
npm run deploy:hosting
```

デプロイ後、Firebase Consoleの「Hosting」セクションでURLを確認できます。

## トラブルシューティング

### Google Sheets からデータが取り込めない

- APIキーが正しく設定されているか確認
- スプレッドシートIDが正しいか確認
- スプレッドシートの共有設定を確認
- Google Sheets APIが有効になっているか確認

### Firebase接続エラー

- `.env` ファイルの設定値を確認
- Firebase Consoleでプロジェクトが正しく作成されているか確認
- Firestore、Authenticationが有効になっているか確認

## ライセンス

MIT
