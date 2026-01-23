/**
 * Google Sheets APIからデータを取得する関数
 *
 * 使用前に以下の設定が必要です:
 * 1. Google Cloud ConsoleでGoogle Sheets APIを有効化
 * 2. APIキーを取得
 * 3. .envファイルに設定情報を追加
 */

const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY;
const SPREADSHEET_ID = import.meta.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID;
const SCRIPT_URL = import.meta.env.VITE_GOOGLE_SHEETS_SCRIPT_URL;

/**
 * スプレッドシートからデータを取得
 * @param {string} userName - ログインユーザー名（E列でフィルタリングに使用）
 * @param {string} range - 取得する範囲（例: 'Master!A2:M'）
 * @returns {Promise<Array>} - 変換されたレコードの配列
 */
export const fetchSpreadsheetData = async (userName, range = 'Master!A2:M') => {
  if (!API_KEY || !SPREADSHEET_ID) {
    throw new Error('Google Sheets APIの設定が不足しています。.envファイルを確認してください。');
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const rows = data.values || [];

    // データを変換し、E列でフィルタリング
    const records = rows
      .filter(row => {
        // E列（row[4]）がログインユーザー名と一致するレコードのみ
        const owner = row[4] || '';
        return owner.trim() === userName;
      })
      .map(row => {
        // C列の金額をパース（カンマや全角数字を除去）
        let amountStr = (row[2] || '0').toString();
        // カンマを除去
        amountStr = amountStr.replace(/,/g, '');
        // 全角数字を半角に変換
        amountStr = amountStr.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
        const amount = parseFloat(amountStr) || 0;

        // G列（処理状態）を確認
        const processStatus = (row[6] || '').toString().trim();
        const isProcessed = processStatus === '処理済み';

        // J列の精算要否を'必要'→'yes'、'不要'→'no'に変換
        const needsSettlementValue = (row[9] || '').toString().trim();
        const needsSettlement = needsSettlementValue === '必要' ? 'yes' : 'no';

        return {
          date: row[0] || '', // A列: 日付 (YYYY-MM-DD形式)
          merchant: row[1] || '', // B列: 決算内容
          amount: amount, // C列: 金額
          cardType: row[3] || 'その他', // D列: カード種類
          owner: row[4] || '', // E列: 利用者（Seigo/Hanaka）
          isProcessed: isProcessed, // G列が「処理済み」かどうか
          processedDate: row[7] || '', // H列: 処理日
          category: row[8] || '', // I列: カテゴリ
          needsSettlement: needsSettlement, // J列: 精算要否（'yes'/'no'に統一）
          settleWith: row[10] || '', // K列: 精算相手
          settlementMethod: row[11] || '', // L列: 精算方法
          settlementDetail: row[12] || '', // M列: 精算方法詳細
          settlementStatus: row[13] || '', // N列: 精算完了有無
          settlementCompletedDate: row[14] || '', // O列: 精算完了日
        };
      });

    return records;
  } catch (error) {
    console.error('Google Sheets fetch error:', error);
    throw error;
  }
};

/**
 * Google Sheetsにレコードの処理完了を書き戻す
 * @param {Object} record - 処理完了したレコード
 * @returns {Promise<Object>} - 結果オブジェクト
 */
export const updateRecordToSheet = async (record) => {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URLが設定されていません。.envファイルを確認してください。');
  }

  console.log('🔍 updateRecordToSheet - 受信したrecord:', record);
  console.log('🔍 record.needsSettlement:', record.needsSettlement);
  console.log('🔍 typeof record.needsSettlement:', typeof record.needsSettlement);

  try {
    // 精算方法の文字列を作成
    let settlementMethod = '';
    let settlementDetail = '';

    if (record.settlementRatioType === 'full') {
      settlementMethod = `${record.payer}が全額立替`;
    } else if (record.settlementRatioType === 'half') {
      settlementMethod = '折半';
    } else if (record.settlementRatioType === 'ratio') {
      settlementMethod = '比率';
      settlementDetail = `自分:${record.myRatio || 0}割`;
    } else if (record.settlementRatioType === 'amount') {
      settlementMethod = '金額指定';
      settlementDetail = `自分:${record.myAmount || 0}円`;
    }

    // 精算要否を'yes'/'no'から'必要'/'不要'に変換
    const needsSettlementValue = record.needsSettlement === 'yes' ? '必要' :
                                  record.needsSettlement === 'no' ? '不要' : '';

    // 精算完了有無を'settled'/'unsettled'から'精算済み'/'未精算'に変換
    const settlementStatusValue = record.settlementStatus === 'settled' ? '精算済み' :
                                   record.settlementStatus === 'unsettled' ? '未精算' : '';

    const payload = {
      action: 'update',
      record: {
        date: record.date,
        merchant: record.merchant,
        amount: record.amount,
        owner: record.owner,
        processedDate: record.processedDate || '', // H列: 処理日
        category: record.category || '', // I列: カテゴリ
        needsSettlement: needsSettlementValue, // J列: 精算要否（'必要'/'不要'）
        settleWith: record.settleWith || '', // K列: 精算相手
        settlementMethod: settlementMethod, // L列: 精算方法
        settlementDetail: settlementDetail, // M列: 精算方法詳細
        settlementStatus: settlementStatusValue, // N列: 精算完了有無（'精算済み'/'未精算'）
        settlementCompletedDate: record.settlementCompletedDate || '' // O列: 精算完了日
      }
    };

    console.log('🔍 Google Sheetsに送信するペイロード:', JSON.stringify(payload, null, 2));

    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      mode: 'no-cors' // Google Apps Scriptの制限により必要
    });

    // no-corsモードでは詳細なレスポンスが取得できないため、
    // エラーがなければ成功とみなす
    return { success: true };
  } catch (error) {
    console.error('Google Sheets update error:', error);
    throw error;
  }
};

/**
 * スプレッドシートのフォーマット例（MasterSheet構成）:
 *
 * | A列: 日付   | B列: 決算内容        | C列: 金額 | D列: カード種類    | E列: 利用者 | F列: 取り込み日 | G列: 処理状態 | H列: 処理日 | I列: カテゴリ | J列: 精算要否 | K列: 精算相手 | L列: 精算方法 | M列: 精算方法詳細 | N列: 精算完了有無 | O列: 精算完了日 |
 * |-----------|-------------------|---------|------------------|-----------|------------|-----------|-----------|-----------|-----------|-----------|-----------|--------------|--------------|------------|
 * | 2026-01-15 | スーパーマーケット | 3580    | クレジットカードA | Seigo     |            |           |           |           | 必要      |           |           |              | 未精算       |            |
 * | 2026-01-14 | レストランB       | 8500    | QR決済           | Hanaka    |            | 処理済み   | 2026-01-14 | 食費      | 不要      |           |           |              |              |            |
 *
 * 注意:
 * - E列の値（Seigo/Hanaka）でログインユーザーのレコードのみがフィルタリングされます
 * - J列の精算要否: '必要'/'不要' の値を使用
 * - N列の精算完了有無: '精算済み'/'未精算' の値を使用
 */
