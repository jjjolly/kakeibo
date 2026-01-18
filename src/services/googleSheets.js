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

/**
 * スプレッドシートからデータを取得
 * @param {string} range - 取得する範囲（例: 'Master!A2:D'）
 * @returns {Promise<Array>} - 変換されたレコードの配列
 */
export const fetchSpreadsheetData = async (range = 'Master!A2:D') => {
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

    // データを変換
    const records = rows.map(row => ({
      date: row[0] || '', // A列: 日付 (YYYY-MM-DD形式)
      merchant: row[1] || '', // B列: 店名
      amount: parseFloat(row[2]) || 0, // C列: 金額
      cardType: row[3] || 'その他', // D列: 支払方法
    }));

    return records;
  } catch (error) {
    console.error('Google Sheets fetch error:', error);
    throw error;
  }
};

/**
 * スプレッドシートのフォーマット例:
 *
 * | A列: 日付        | B列: 店名              | C列: 金額  | D列: 支払方法          |
 * |-----------------|----------------------|----------|----------------------|
 * | 2026-01-15      | スーパーマーケット      | 3580     | クレジットカードA      |
 * | 2026-01-14      | レストランB           | 8500     | QR決済                |
 * | 2026-01-13      | ガソリンスタンド       | 5200     | クレジットカードB      |
 */
