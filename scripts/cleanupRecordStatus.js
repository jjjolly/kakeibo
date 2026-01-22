/**
 * Firestoreレコードのステータスクリーンアップスクリプト
 *
 * このスクリプトは、Firestore上の全レコードを確認し、
 * statusフィールドが不整合なレコードを特定・修正します。
 *
 * 実行方法:
 * node scripts/cleanupRecordStatus.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import * as dotenv from 'dotenv';

// .envファイルを読み込み
dotenv.config();

// Firebase設定
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// Firebaseアプリを初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanupRecordStatus() {
  console.log('🔍 Firestoreレコードのステータスを確認中...\n');

  try {
    const recordsRef = collection(db, 'records');
    const snapshot = await getDocs(recordsRef);

    let totalCount = 0;
    let pendingCount = 0;
    let closedCount = 0;
    let invalidCount = 0;
    let fixedCount = 0;

    const invalidRecords = [];

    snapshot.forEach((docSnapshot) => {
      const record = docSnapshot.data();
      const recordId = docSnapshot.id;
      totalCount++;

      // statusフィールドの確認
      if (record.status === 'pending') {
        pendingCount++;
      } else if (record.status === 'closed') {
        closedCount++;
      } else {
        // statusが存在しないか、不正な値
        invalidCount++;
        invalidRecords.push({
          id: recordId,
          date: record.date,
          merchant: record.merchant,
          amount: record.amount,
          status: record.status || '(なし)',
          payer: record.payer,
          category: record.category
        });
      }
    });

    console.log('📊 レコード統計:');
    console.log(`  総レコード数: ${totalCount}件`);
    console.log(`  未処理 (status='pending'): ${pendingCount}件`);
    console.log(`  処理済み (status='closed'): ${closedCount}件`);
    console.log(`  不正なステータス: ${invalidCount}件\n`);

    if (invalidRecords.length > 0) {
      console.log('⚠️  不正なステータスのレコード:');
      invalidRecords.forEach((record, index) => {
        console.log(`  ${index + 1}. ID: ${record.id}`);
        console.log(`     日付: ${record.date}, 店名: ${record.merchant}, 金額: ${record.amount}`);
        console.log(`     ステータス: ${record.status}, payer: ${record.payer || '(なし)'}, カテゴリ: ${record.category || '(なし)'}\n`);
      });

      // 自動修正のロジック
      console.log('🔧 不正なレコードを自動修正します...\n');

      for (const record of invalidRecords) {
        const recordRef = doc(db, 'records', record.id);

        // payerとcategoryが設定されている場合は処理済み、それ以外は未処理
        const newStatus = (record.payer && record.category) ? 'closed' : 'pending';

        await updateDoc(recordRef, {
          status: newStatus
        });

        console.log(`  ✅ ID: ${record.id} → status: '${newStatus}' に修正`);
        fixedCount++;
      }

      console.log(`\n✨ ${fixedCount}件のレコードを修正しました。`);
    } else {
      console.log('✅ すべてのレコードのステータスは正常です。');
    }

    console.log('\n🎉 クリーンアップ完了！');
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  }
}

// スクリプトを実行
cleanupRecordStatus().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('❌ 致命的なエラー:', error);
  process.exit(1);
});
