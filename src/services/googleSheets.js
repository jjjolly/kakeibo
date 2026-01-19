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

        return {
          date: row[0] || '', // A列: 日付 (YYYY-MM-DD形式)
          merchant: row[1] || '', // B列: 店名
          amount: amount, // C列: 金額
          cardType: row[3] || 'その他', // D列: 支払方法
          owner: row[4] || '', // E列: 所有者（Seigo/Hanaka）
          isProcessed: isProcessed, // G列が「処理済み」かどうか
          category: row[7] || '', // H列: カテゴリ
          needsSettlement: row[8] || '', // I列: 精算有無
          settleWith: row[9] || '', // J列: 精算相手
          settlementMethod: row[10] || '', // K列: 精算方法
          settlementDetail: row[11] || '', // L列: 精算方法詳細
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

    const payload = {
      action: 'update',
      record: {
        date: record.date,
        merchant: record.merchant,
        amount: record.amount,
        owner: record.owner,
        category: record.category || '',
        needsSettlement: record.needsSettlement || '',
        settleWith: record.settleWith || '',
        settlementMethod: settlementMethod,
        settlementDetail: settlementDetail,
        settlementCompletedDate: record.settlementCompletedDate || '' // N列: 精算完了日
      }
    };

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
 * スプレッドシートのフォーマット例:
 *
 * | A列: 日付        | B列: 店名              | C列: 金額  | D列: 支払方法          | E列: 所有者  |
 * |-----------------|----------------------|----------|----------------------|-------------|
 * | 2026-01-15      | スーパーマーケット      | 3580     | クレジットカードA      | Seigo       |
 * | 2026-01-14      | レストランB           | 8500     | QR決済                | Hanaka      |
 * | 2026-01-13      | ガソリンスタンド       | 5200     | クレジットカードB      | Seigo       |
 *
 * 注意: E列の値（Seigo/Hanaka）でログインユーザーのレコードのみがフィルタリングされます
 */
