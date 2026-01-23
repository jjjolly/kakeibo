# Google Apps Script 修正ガイド

## MasterSheetカラム構成（2026-01-23更新）

新しいカラム構成に対応するための修正ガイドです。

## 現在のペイロード構造

React側から送信されるデータ:
```json
{
  "action": "update",
  "record": {
    "date": "2026-01-21",
    "merchant": "店名",
    "amount": 1000,
    "owner": "Seigo",
    "processedDate": "2026-01-21",
    "category": "食費",
    "needsSettlement": "必要",
    "settleWith": "Hanaka",
    "settlementMethod": "折半",
    "settlementDetail": "",
    "settlementStatus": "未精算",
    "settlementCompletedDate": ""
  }
}
```

## Google Apps Scriptの修正

### 必要な修正内容

現在のGoogle Apps Scriptの`doPost`関数を以下のように修正してください：

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'update') {
      updateRecord(data.record);
      return ContentService.createTextOutput(JSON.stringify({ success: true }));
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }));
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }));
  }
}

function updateRecord(record) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Master'); // シート名を確認してください

  if (!sheet) {
    throw new Error('Masterシートが見つかりません');
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // ヘッダー行を除く
  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    // A列（日付）、B列（決算内容）、C列（金額）、E列（利用者）で該当行を特定
    if (row[0] === record.date &&
        row[1] === record.merchant &&
        row[2] === record.amount &&
        row[4] === record.owner) {

      const rowNumber = i + 1; // シート上の行番号（1始まり）

      // G列（7列目）: 処理状態 = "処理済み"
      sheet.getRange(rowNumber, 7).setValue('処理済み');

      // H列（8列目）: 処理日
      if (record.processedDate) {
        sheet.getRange(rowNumber, 8).setValue(record.processedDate);
      }

      // I列（9列目）: カテゴリ
      if (record.category) {
        sheet.getRange(rowNumber, 9).setValue(record.category);
      }

      // J列（10列目）: 精算要否（'必要'/'不要'）
      if (record.needsSettlement) {
        sheet.getRange(rowNumber, 10).setValue(record.needsSettlement);
      }

      // K列（11列目）: 精算相手
      if (record.settleWith) {
        sheet.getRange(rowNumber, 11).setValue(record.settleWith);
      }

      // L列（12列目）: 精算方法
      if (record.settlementMethod) {
        sheet.getRange(rowNumber, 12).setValue(record.settlementMethod);
      }

      // M列（13列目）: 精算方法詳細
      if (record.settlementDetail) {
        sheet.getRange(rowNumber, 13).setValue(record.settlementDetail);
      }

      // N列（14列目）: 精算完了有無（'精算済み'/'未精算'）
      if (record.settlementStatus) {
        sheet.getRange(rowNumber, 14).setValue(record.settlementStatus);
      }

      // O列（15列目）: 精算完了日
      // 精算完了日が空文字の場合もクリアするために書き込む
      sheet.getRange(rowNumber, 15).setValue(record.settlementCompletedDate || '');

      Logger.log('レコード更新完了: 行番号 ' + rowNumber);
      return;
    }
  }

  Logger.log('該当するレコードが見つかりませんでした');
  throw new Error('該当するレコードが見つかりませんでした');
}
```

## 修正のポイント

### 1. 新しいカラム構成に対応（H列〜O列）
H列とI列の順序が入れ替わり、処理日が先になりました。

### 2. 値の形式変更
- **精算要否（J列）**: 'あり'/'なし' → '必要'/'不要'
- **精算完了有無（N列）**: 'settled'/'unsettled' → '精算済み'/'未精算'

### 3. 処理日を最初に設定（H列8列目）
```javascript
if (record.processedDate) {
  sheet.getRange(rowNumber, 8).setValue(record.processedDate);
}
```

### 4. 精算完了日はO列に移動（15列目）
```javascript
// 空文字列の場合もクリアするために書き込む
sheet.getRange(rowNumber, 15).setValue(record.settlementCompletedDate || '');
```

## 列番号の対応表

| 列名 | 列番号 | 内容 | 備考 |
|-----|-------|------|------|
| A | 1 | 日付 | YYYY-MM-DD形式 |
| B | 2 | 決算内容 | 店名など |
| C | 3 | 金額 | 数値 |
| D | 4 | カード種類 | クレジットカード、QR決済など |
| E | 5 | 利用者 | Seigo/Hanaka |
| F | 6 | 取り込み日 | |
| G | 7 | 処理状態 | "処理済み"など |
| **H** | **8** | **処理日** | **YYYY-MM-DD形式** |
| **I** | **9** | **カテゴリ** | **食費、交通費など** |
| **J** | **10** | **精算要否** | **'必要'/'不要'** |
| K | 11 | 精算相手 | Seigo/Hanaka |
| L | 12 | 精算方法 | 折半、全額立替など |
| M | 13 | 精算方法詳細 | 比率や金額の詳細 |
| **N** | **14** | **精算完了有無** | **'精算済み'/'未精算'** |
| O | 15 | 精算完了日 | YYYY-MM-DD形式 |

## デプロイ手順

1. Google Apps Scriptエディタを開く
2. 上記のコードに修正
3. 「デプロイ」→「新しいデプロイ」
4. 種類: ウェブアプリ
5. アクセス権限: 「全員」
6. デプロイ後、新しいURLを取得
7. .envファイルの`VITE_GOOGLE_SHEETS_SCRIPT_URL`を更新（URLが変わった場合）

## テスト方法

1. Reactアプリから未処理レコードを保存
2. MasterシートのH列に処理日が記録されているか確認
3. MasterシートのI列にカテゴリが記録されているか確認
4. MasterシートのJ列に精算要否が'必要'または'不要'で記録されているか確認
5. 精算管理から精算完了処理を実行
6. MasterシートのN列に精算完了有無が'精算済み'で記録されているか確認
7. MasterシートのO列に精算完了日が記録されているか確認
8. 履歴から精算済み→未精算に変更
9. MasterシートのN列が'未精算'に、O列が空になっているか確認
