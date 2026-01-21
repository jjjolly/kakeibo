# Google Apps Script 修正ガイド

## 問題点
1. 処理日（M列）がMasterSheetに反映されない
2. 精算完了日（N列）の反映を確認

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
    "category": "食費",
    "needsSettlement": "あり",
    "settleWith": "Hanaka",
    "settlementMethod": "折半",
    "settlementDetail": "",
    "settlementStatus": "unsettled",
    "processedDate": "2026-01-21",
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

    // A列（日付）、B列（店名）、C列（金額）、E列（所有者）で該当行を特定
    if (row[0] === record.date &&
        row[1] === record.merchant &&
        row[2] === record.amount &&
        row[4] === record.owner) {

      const rowNumber = i + 1; // シート上の行番号（1始まり）

      // G列（7列目）: 処理状態 = "処理済み"
      sheet.getRange(rowNumber, 7).setValue('処理済み');

      // H列（8列目）: カテゴリ
      if (record.category) {
        sheet.getRange(rowNumber, 8).setValue(record.category);
      }

      // I列（9列目）: 精算有無
      if (record.needsSettlement) {
        sheet.getRange(rowNumber, 9).setValue(record.needsSettlement);
      }

      // J列（10列目）: 精算相手
      if (record.settleWith) {
        sheet.getRange(rowNumber, 10).setValue(record.settleWith);
      }

      // K列（11列目）: 精算方法
      if (record.settlementMethod) {
        sheet.getRange(rowNumber, 11).setValue(record.settlementMethod);
      }

      // L列（12列目）: 精算方法詳細
      if (record.settlementDetail) {
        sheet.getRange(rowNumber, 12).setValue(record.settlementDetail);
      }

      // ★★★ 重要: M列（13列目）: 処理日 ★★★
      if (record.processedDate) {
        sheet.getRange(rowNumber, 13).setValue(record.processedDate);
      }

      // ★★★ 重要: N列（14列目）: 精算完了日 ★★★
      // 精算完了日が空文字の場合もクリアするために書き込む
      sheet.getRange(rowNumber, 14).setValue(record.settlementCompletedDate || '');

      // ★★★ 追加: O列（15列目）: 精算ステータス ★★★
      if (record.settlementStatus) {
        sheet.getRange(rowNumber, 15).setValue(record.settlementStatus);
      }

      Logger.log('レコード更新完了: 行番号 ' + rowNumber);
      return;
    }
  }

  Logger.log('該当するレコードが見つかりませんでした');
  throw new Error('該当するレコードが見つかりませんでした');
}
```

## 修正のポイント

### 1. M列（13列目）の処理日を追加
```javascript
if (record.processedDate) {
  sheet.getRange(rowNumber, 13).setValue(record.processedDate);
}
```

### 2. N列（14列目）の精算完了日を追加
```javascript
// 空文字列の場合もクリアするために書き込む
sheet.getRange(rowNumber, 14).setValue(record.settlementCompletedDate || '');
```

### 3. O列（15列目）の精算ステータスを追加（オプション）
```javascript
if (record.settlementStatus) {
  sheet.getRange(rowNumber, 15).setValue(record.settlementStatus);
}
```

## 列番号の対応表

| 列名 | 列番号 | 内容 |
|-----|-------|------|
| A | 1 | 日付 |
| B | 2 | 店名 |
| C | 3 | 金額 |
| D | 4 | 支払方法 |
| E | 5 | 所有者 |
| F | 6 | （未使用?） |
| G | 7 | 処理状態 |
| H | 8 | カテゴリ |
| I | 9 | 精算有無 |
| J | 10 | 精算相手 |
| K | 11 | 精算方法 |
| L | 12 | 精算方法詳細 |
| **M** | **13** | **処理日（新規追加）** |
| **N** | **14** | **精算完了日（新規追加）** |
| O | 15 | 精算ステータス（オプション） |

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
2. MasterシートのM列に処理日が記録されているか確認
3. 精算管理から精算完了処理を実行
4. MasterシートのN列に精算完了日が記録されているか確認
5. 履歴から精算済み→未精算に変更
6. MasterシートのN列がクリアされているか確認
