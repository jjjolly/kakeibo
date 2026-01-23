function doPost(e) {
  try {
    // リクエストボディをJSON解析
    const requestData = JSON.parse(e.postData.contents);

    Logger.log('受信したリクエスト: ' + JSON.stringify(requestData));

    // actionがupdateの場合のみ処理
    if (requestData.action === 'update' && requestData.record) {
      updateRecord(requestData.record);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'レコードが正常に更新されました'
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      throw new Error('不正なリクエスト形式です');
    }
  } catch (error) {
    Logger.log('エラー: ' + error.toString());

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function updateRecord(record) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Master');

  if (!sheet) {
    throw new Error('Masterシートが見つかりません');
  }

  Logger.log('=== 更新リクエスト受信 ===');
  Logger.log('検索条件:');
  Logger.log('  date: ' + record.date + ' (型: ' + typeof record.date + ')');
  Logger.log('  merchant: ' + record.merchant);
  Logger.log('  amount: ' + record.amount + ' (型: ' + typeof record.amount + ')');
  Logger.log('  owner: ' + record.owner);

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  // ヘッダー行を除く
  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    // デバッグ：各行の内容をログ出力
    if (i <= 3) { // 最初の3行だけログ出力
      Logger.log('--- 行' + (i + 1) + ' ---');
      Logger.log('  A列(日付): ' + row[0] + ' (型: ' + typeof row[0] + ')');
      Logger.log('  B列(決算内容): ' + row[1]);
      Logger.log('  C列(金額): ' + row[2] + ' (型: ' + typeof row[2] + ')');
      Logger.log('  E列(利用者): ' + row[4]);
    }

    // 日付の比較（Date型と文字列の両方に対応）
    let dateMatch = false;
    if (row[0] instanceof Date) {
      // スプレッドシートの日付がDate型の場合、YYYY-MM-DD形式に変換して比較
      const sheetDate = Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      dateMatch = (sheetDate === record.date);
      if (i <= 3) Logger.log('  日付比較: ' + sheetDate + ' === ' + record.date + ' => ' + dateMatch);
    } else {
      // 文字列として比較
      dateMatch = (row[0] === record.date);
      if (i <= 3) Logger.log('  日付比較: ' + row[0] + ' === ' + record.date + ' => ' + dateMatch);
    }

    // 金額の比較（数値として比較）
    const sheetAmount = typeof row[2] === 'number' ? row[2] : parseFloat(row[2]);
    const recordAmount = typeof record.amount === 'number' ? record.amount : parseFloat(record.amount);
    const amountMatch = (sheetAmount === recordAmount);
    if (i <= 3) Logger.log('  金額比較: ' + sheetAmount + ' === ' + recordAmount + ' => ' + amountMatch);

    // すべての条件が一致するかチェック
    if (dateMatch &&
        row[1] === record.merchant &&
        amountMatch &&
        row[4] === record.owner) {

      const rowNumber = i + 1;
      Logger.log('✓ 該当行を発見: ' + rowNumber + '行目');

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
      // 必ず値を設定（空欄の場合も書き込む）
      sheet.getRange(rowNumber, 10).setValue(record.needsSettlement || '');

      // K列以降: 精算要否が'不要'の場合は空欄にする
      if (record.needsSettlement === '不要' || !record.needsSettlement) {
        // K列（11列目）: 精算相手 → 空欄
        sheet.getRange(rowNumber, 11).setValue('');

        // L列（12列目）: 精算方法 → 空欄
        sheet.getRange(rowNumber, 12).setValue('');

        // M列（13列目）: 精算方法詳細 → 空欄
        sheet.getRange(rowNumber, 13).setValue('');

        // N列（14列目）: 精算完了有無 → 空欄
        sheet.getRange(rowNumber, 14).setValue('');

        // O列（15列目）: 精算完了日 → 空欄
        sheet.getRange(rowNumber, 15).setValue('');

        Logger.log('✓ 精算不要: K列〜O列をクリア');
      } else {
        // 精算要否が'必要'の場合は各フィールドを設定

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
        sheet.getRange(rowNumber, 15).setValue(record.settlementCompletedDate || '');
      }

      Logger.log('✓ レコード更新完了: 行番号 ' + rowNumber);
      return;
    }
  }

  Logger.log('✗ 該当するレコードが見つかりませんでした');
  throw new Error('該当するレコードが見つかりませんでした');
}
