# デプロイ手順

このドキュメントでは、家計簿アプリをFirebaseにデプロイする手順を説明します。

## 前提条件

✅ npm依存関係のインストール完了
✅ ビルド成功確認済み
✅ Firebase CLIインストール済み
✅ .envファイル設定済み
✅ Firebaseプロジェクト（kakeibo-app-e092a）作成済み

## デプロイ手順

### 1. WSL環境へのアクセス（Windows環境の場合）

プロジェクトがWSL（Windows Subsystem for Linux）内にある場合：

```bash
# Windowsのスタートメニューから「Ubuntu」または「WSL」を検索して起動
# または、コマンドプロンプト/PowerShellから：
wsl

# プロジェクトディレクトリに移動
cd /home/user/kakeibo
```

### 2. Firebaseへのログイン

```bash
firebase login
```

- ブラウザが開き、Googleアカウントでログインを求められます
- 許可を与えると、ターミナルに戻ります
- 「Success! Logged in as [your-email]」と表示されれば成功です

### 3. Firestoreセキュリティルールのデプロイ

```bash
npm run deploy:rules
```

または：

```bash
firebase deploy --only firestore:rules
```

実行後、以下を確認：
- Firebase Console > Firestore Database > Rules で、ルールが更新されていることを確認

### 4. アプリケーション全体のデプロイ（ビルド＋ホスティング）

```bash
npm run deploy
```

または：

```bash
firebase deploy
```

これにより：
1. `npm run build`が実行され、distフォルダにビルド成果物が生成されます
2. Firebase Hostingにアプリケーションがデプロイされます
3. Firestoreのルールもデプロイされます

### 5. デプロイ後の確認

デプロイ完了後、以下のURLでアプリケーションにアクセスできます：

```
https://kakeibo-app-e092a.web.app
```

または：

```
https://kakeibo-app-e092a.firebaseapp.com
```

## 初回セットアップ（アプリケーション使用開始）

### 1. ユーザーアカウントの作成

デプロイしたアプリケーションにアクセスして、2人分のアカウントを作成します：

**Seigoさんのアカウント:**
- 表示名: Seigo
- メールアドレス: (任意のメールアドレス)
- パスワード: (安全なパスワード)

**Hanakaさんのアカウント:**
- 表示名: Hanaka
- メールアドレス: (任意のメールアドレス)
- パスワード: (安全なパスワード)

### 2. Google Sheetsのデータフォーマット確認

スプレッドシートID: `1ElMcJwdhk92glUN4dtUG6v1rUHUBvtTXv6yeCuOrT7o`
シート名: `Master`

以下の形式でデータを入力してください：

| A列: 日付 | B列: 店名 | C列: 金額 | D列: 支払方法 |
|----------|---------|---------|------------|
| 2026-01-15 | スーパーマーケット | 3580 | クレジットカードA |
| 2026-01-14 | レストランB | 8500 | QR決済 |
| 2026-01-13 | ガソリンスタンド | 5200 | クレジットカードB |

### 3. データのインポートと精算

1. アプリケーションにログイン
2. 「Sheetsから読込」ボタンをクリック
3. Google Sheetsからデータがインポートされます
4. 各レコードの精算方法を選択：
   - **Seigoが全額立替**: Seigoが支払い、Hanakaは半額を精算
   - **Hanakaが全額立替**: Hanakaが支払い、Seigoは半額を精算
   - **折半**: 2人で等分に負担（精算なし）
   - **比率**: 任意の比率で負担を設定
   - **金額指定**: 片方の負担額を直接指定
5. 「保存」をクリックして確定

## トラブルシューティング

### 認証エラーが出る場合

```bash
firebase login --reauth
```

で再度ログインを試みてください。

### デプロイに失敗する場合

```bash
# プロジェクトが正しく設定されているか確認
firebase projects:list

# 現在のプロジェクトを確認
firebase use

# 必要に応じてプロジェクトを切り替え
firebase use kakeibo-app-e092a
```

### ビルドエラーが出る場合

```bash
# node_modulesを削除して再インストール
rm -rf node_modules
npm install

# 再度ビルド
npm run build
```

## ローカル開発サーバーの起動

デプロイ前にローカルで動作確認したい場合：

```bash
npm run dev
```

ブラウザで http://localhost:5173 にアクセスしてください。

## 更新のデプロイ

コードを変更した後、以下の手順で更新をデプロイします：

```bash
# 変更をコミット
git add .
git commit -m "変更内容の説明"
git push

# デプロイ
npm run deploy
```
