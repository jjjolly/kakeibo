import { useState, useEffect } from 'react';
import { Check, X, CreditCard, DollarSign, LogOut, User } from 'lucide-react';
import { fetchSpreadsheetData, updateRecordToSheet } from '../services/googleSheets';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

const ExpenseClassifier = () => {
  const { currentUser, logout } = useAuth();
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [category, setCategory] = useState('');
  const [needsSettlement, setNeedsSettlement] = useState('');
  const [settleWith, setSettleWith] = useState('');
  const [settlementRatioType, setSettlementRatioType] = useState('');
  const [myRatio, setMyRatio] = useState('');
  const [myAmount, setMyAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2026-01');
  const [activeTab, setActiveTab] = useState('classify');
  const [analyticsSubTab, setAnalyticsSubTab] = useState('monthly'); // 'monthly' or 'category'
  const [selectedCategory, setSelectedCategory] = useState(''); // 月別推移で選択されたカテゴリ
  const [editingRecord, setEditingRecord] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  // 分類モード: 'single'（個別処理）または 'batch'（一括処理）
  const [classifyMode, setClassifyMode] = useState('single');

  // 一括処理用の各レコードの入力データを管理
  const [batchRecordData, setBatchRecordData] = useState({});

  // 一括処理で選択されたレコードID
  const [batchSelectedRecords, setBatchSelectedRecords] = useState([]);

  // 処理中フラグとメッセージ
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');

  // 相手のユーザー名を取得
  const getOtherUser = () => {
    return currentUser?.displayName === 'Seigo' ? 'Hanaka' : 'Seigo';
  };

  // 精算有無が変更されたときに精算相手をデフォルト設定
  useEffect(() => {
    if (needsSettlement === 'yes' && !settleWith) {
      setSettleWith(getOtherUser());
    }
  }, [needsSettlement]);

  // 現在のレコードが変わったときにフォームをリセット
  useEffect(() => {
    const pendingRecords = records.filter(r => r.status === 'pending');
    const currentRecord = pendingRecords.length > 0 ? pendingRecords[0] : null;

    if (currentRecord) {
      // レコードに推定カテゴリが設定されていればフォームに反映
      setCategory(currentRecord.category || '');
      setNeedsSettlement(currentRecord.needsSettlement || '');
      setSettleWith(currentRecord.settleWith || '');
      setSettlementRatioType(currentRecord.settlementRatioType || '');
      setMyRatio(currentRecord.myRatio?.toString() || '');
      setMyAmount(currentRecord.myAmount?.toString() || '');
    } else {
      // レコードがない場合はフォームをクリア
      setCategory('');
      setNeedsSettlement('');
      setSettleWith('');
      setSettlementRatioType('');
      setMyRatio('');
      setMyAmount('');
    }
  }, [records]);

  // 未処理レコード用の一括データを初期化
  useEffect(() => {
    const pendingRecords = records.filter(r => r.status === 'pending');
    const newBatchData = {};

    pendingRecords.forEach(record => {
      if (!batchRecordData[record.id]) {
        newBatchData[record.id] = {
          category: record.category || '',
          needsSettlement: record.needsSettlement || 'no',
          settleWith: record.settleWith || getOtherUser(),
          settlementRatioType: record.settlementRatioType || 'full',
          myRatio: record.myRatio?.toString() || '5',
          myAmount: record.myAmount?.toString() || '0'
        };
      } else {
        newBatchData[record.id] = batchRecordData[record.id];
      }
    });

    setBatchRecordData(newBatchData);
  }, [records]);

  const categories = {
    '固定費': ['住宅費', '水道光熱費', '通信料', 'サブスク費', 'その他'],
    '変動費': ['食費', '日用品費', '医療費', '被服費', '美容費', '交際費', '娯楽費', '交通費', '雑費', '特別費', 'ジャック']
  };

  // 店名から過去の最頻カテゴリを推定
  const suggestCategoryFromHistory = (merchantName) => {
    // 同じ店名の過去の処理済みレコードを取得
    const similarRecords = records.filter(r =>
      r.merchant === merchantName &&
      r.status === 'closed' &&
      r.category
    );

    if (similarRecords.length === 0) {
      return null; // 過去データなし
    }

    // カテゴリの出現回数をカウント
    const categoryCount = {};
    similarRecords.forEach(r => {
      categoryCount[r.category] = (categoryCount[r.category] || 0) + 1;
    });

    // 最頻カテゴリを取得
    let mostFrequentCategory = null;
    let maxCount = 0;
    Object.entries(categoryCount).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostFrequentCategory = cat;
      }
    });

    return mostFrequentCategory;
  };

  // Google Sheetsからデータをインポート
  const handleImportFromSheets = async () => {
    setIsImporting(true);
    try {
      const sheetData = await fetchSpreadsheetData(currentUser.displayName);

      // 既存のレコードと重複チェック用のキーセット
      const existingKeys = new Set(
        records.map(r => `${r.date}-${r.merchant}-${r.amount}`)
      );

      // 新規レコードをフィルタリング
      const newRecordsToAdd = sheetData.filter(row => {
        const key = `${row.date}-${row.merchant}-${row.amount}`;
        return !existingKeys.has(key);
      });

      if (newRecordsToAdd.length === 0) {
        alert('新しいレコードはありません');
      } else {
        // Firestoreに新規レコードを追加
        const recordsRef = collection(db, 'records');
        const addPromises = newRecordsToAdd.map(row => {
          // 処理済みレコードかどうかで保存内容を分ける
          if (row.isProcessed) {
            // 処理済みレコード：Google Sheetsの情報をそのまま使用
            return addDoc(recordsRef, {
              date: row.date,
              merchant: row.merchant,
              amount: row.amount,
              paymentMethod: row.cardType,
              owner: row.owner,
              payer: row.owner, // 入力者=所有者
              category: row.category || null,
              needsSettlement: row.needsSettlement, // googleSheets.jsで既に'yes'/'no'に変換済み
              settleWith: row.settleWith || null,
              settlementRatio: row.settlementMethod || null,
              settlementRatioType: null, // 過去データのため詳細不明
              myRatio: null,
              myAmount: null,
              settlementAmountValue: null,
              settlementStatus: row.needsSettlement === 'yes' ? 'unsettled' : null,
              status: 'closed', // 処理済み
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              updatedBy: row.owner
            });
          } else {
            // 未処理レコード：通常の新規取り込み
            // 過去の類似レコードからカテゴリを推定
            const suggestedCategory = suggestCategoryFromHistory(row.merchant);

            return addDoc(recordsRef, {
              date: row.date,
              merchant: row.merchant,
              amount: row.amount,
              paymentMethod: row.cardType,
              owner: row.owner,
              payer: null,
              category: suggestedCategory, // 推定カテゴリを設定
              needsSettlement: null,
              settleWith: null,
              settlementRatio: null,
              settlementRatioType: null,
              myRatio: null,
              myAmount: null,
              settlementAmountValue: null,
              settlementStatus: null,
              status: 'pending',
              createdAt: new Date().toISOString()
            });
          }
        });

        await Promise.all(addPromises);
        const processedCount = newRecordsToAdd.filter(r => r.isProcessed).length;
        const pendingCount = newRecordsToAdd.filter(r => !r.isProcessed).length;
        alert(`${newRecordsToAdd.length}件の新しいレコードを取り込みました\n（処理済み: ${processedCount}件、未処理: ${pendingCount}件）`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('データの取り込みに失敗しました。\nAPI Keyとスプレッドシート設定を確認してください。\n\nエラー: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  // Firestoreからデータをリアルタイム監視
  useEffect(() => {
    if (!currentUser) return;

    const recordsRef = collection(db, 'records');
    // ログインユーザーのレコードのみを取得
    const q = query(recordsRef, where('owner', '==', currentUser.displayName));

    // リアルタイムリスナーを設定
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordsData = [];
      snapshot.forEach((doc) => {
        recordsData.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // 日付順にソート（新しい順）
      recordsData.sort((a, b) => new Date(b.date) - new Date(a.date));

      setRecords(recordsData);
      setIsLoading(false);
    }, (error) => {
      console.error('Firestore監視エラー:', error);
      setIsLoading(false);
    });

    // クリーンアップ
    return () => unsubscribe();
  }, [currentUser]);

  // 未処理レコードを日付順（古い順）にソート
  const pendingRecords = records
    .filter(r => r.status === 'pending')
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const currentRecord = pendingRecords.length > 0 ? pendingRecords[0] : null;
  const closedRecords = records.filter(r => r.status === 'closed');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">データを読み込んでいます...</p>
        </div>
      </div>
    );
  }

  const recordsByMonth = closedRecords.reduce((acc, record) => {
    const month = record.date.substring(0, 7);
    if (!acc[month]) {
      acc[month] = [];
    }
    acc[month].push(record);
    return acc;
  }, {});

  const months = Object.keys(recordsByMonth).sort().reverse();

  // 月別集計を計算
  const calculateMonthlyStats = (month) => {
    const monthRecords = recordsByMonth[month] || [];

    // カテゴリ別集計
    const categoryTotals = {};
    let totalAmount = 0;
    let fixedCostTotal = 0; // 固定費合計
    let variableCostTotal = 0; // 変動費合計

    monthRecords.forEach(record => {
      const amount = record.amount || 0;
      totalAmount += amount;

      if (record.category) {
        if (!categoryTotals[record.category]) {
          categoryTotals[record.category] = 0;
        }
        categoryTotals[record.category] += amount;

        // 固定費・変動費の判定
        if (categories['固定費'].includes(record.category)) {
          fixedCostTotal += amount;
        } else if (categories['変動費'].includes(record.category)) {
          variableCostTotal += amount;
        }
      }
    });

    return {
      totalAmount,
      fixedCostTotal,
      variableCostTotal,
      categoryTotals,
      recordCount: monthRecords.length
    };
  };

  const getSettlementAmount = (record) => {
    if (!record.settlementRatioType) return 0;

    if (record.settlementRatioType === 'full') {
      return record.amount;
    } else if (record.settlementRatioType === 'half') {
      return Math.round(record.amount / 2);
    } else if (record.settlementRatioType === 'ratio') {
      const theirRatio = 10 - parseInt(record.myRatio || 0);
      return Math.round((record.amount * theirRatio) / 10);
    } else if (record.settlementRatioType === 'amount') {
      return record.amount - (record.myAmount || 0);
    }
    return record.settlementAmountValue || 0;
  };

  const unsettledRecords = closedRecords.filter(r =>
    r.needsSettlement === 'yes' && r.settlementStatus !== 'settled'
  );

  const calculateSettlementSummary = () => {
    const summary = {};
    unsettledRecords.forEach(record => {
      const payerPerson = record.payer;
      const settleWithPerson = record.settleWith;

      if (!payerPerson || !settleWithPerson) return;

      let key, isReceiving;
      if (payerPerson === 'Seigo') {
        key = settleWithPerson;
        isReceiving = false;
      } else if (settleWithPerson === 'Seigo') {
        key = payerPerson;
        isReceiving = true;
      } else {
        return;
      }

      if (!summary[key]) {
        summary[key] = { toMe: 0, toThem: 0 };
      }

      const amount = getSettlementAmount(record);

      if (isReceiving) {
        summary[key].toThem += amount;
      } else {
        summary[key].toMe += amount;
      }
    });
    return summary;
  };

  const settlementSummary = calculateSettlementSummary();

  const toggleRecordSelection = (recordId) => {
    setSelectedRecords(prev => {
      if (prev.includes(recordId)) {
        return prev.filter(id => id !== recordId);
      } else {
        return [...prev, recordId];
      }
    });
  };

  const selectAllRecords = () => {
    setSelectedRecords(unsettledRecords.map(r => r.id));
  };

  const selectByPayer = (payerName) => {
    const recordsToSelect = unsettledRecords.filter(r => r.payer === payerName).map(r => r.id);
    setSelectedRecords(recordsToSelect);
  };

  const clearAllSelections = () => {
    setSelectedRecords([]);
  };

  const calculateSelectedSummary = () => {
    const selectedUnsettled = unsettledRecords.filter(r => selectedRecords.includes(r.id));
    const summary = {};

    selectedUnsettled.forEach(record => {
      const payerPerson = record.payer;
      const settleWithPerson = record.settleWith;

      if (!payerPerson || !settleWithPerson) return;

      const direction = `${payerPerson} → ${settleWithPerson}`;

      if (!summary[direction]) {
        summary[direction] = 0;
      }

      const amount = getSettlementAmount(record);
      summary[direction] += amount;
    });

    return summary;
  };

  const settleSelectedRecords = async () => {
    if (selectedRecords.length === 0) {
      alert('精算するレコードを選択してください');
      return;
    }

    setIsProcessing(true);
    setProcessingMessage(`${selectedRecords.length}件の精算処理中...`);

    try {
      const settledDate = new Date();
      const settlementCompletedDate = settledDate.toISOString().split('T')[0]; // YYYY-MM-DD形式

      // 選択したレコードを取得
      const recordsToSettle = records.filter(r => selectedRecords.includes(r.id));

      // 選択したレコードを一括更新
      const updatePromises = selectedRecords.map(recordId => {
        const recordRef = doc(db, 'records', recordId);
        return updateDoc(recordRef, {
          settlementStatus: 'settled',
          settledAt: settledDate.toISOString(),
          settledBy: currentUser?.displayName || currentUser?.email
        });
      });

      await Promise.all(updatePromises);

      // Google Sheetsに精算完了日を書き戻す
      const sheetUpdatePromises = recordsToSettle.map(record => {
        return updateRecordToSheet({
          ...record,
          settlementCompletedDate: settlementCompletedDate
        });
      });

      await Promise.all(sheetUpdatePromises);

      setSelectedRecords([]);
    } catch (error) {
      console.error('精算エラー:', error);
      alert('精算処理に失敗しました: ' + error.message);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const settleAllWithPerson = async (person) => {
    const recordsToSettleCount = records.filter(
      r => r.settleWith === person && r.settlementStatus === 'unsettled'
    ).length;

    setIsProcessing(true);
    setProcessingMessage(`${person}との${recordsToSettleCount}件の精算処理中...`);

    try {
      const settledDate = new Date();
      const settlementCompletedDate = settledDate.toISOString().split('T')[0]; // YYYY-MM-DD形式

      // 指定した人との未精算レコードを取得
      const recordsToSettle = records.filter(
        r => r.settleWith === person && r.settlementStatus === 'unsettled'
      );

      if (recordsToSettle.length === 0) {
        return;
      }

      // 一括更新
      const updatePromises = recordsToSettle.map(record => {
        const recordRef = doc(db, 'records', record.id);
        return updateDoc(recordRef, {
          settlementStatus: 'settled',
          settledAt: settledDate.toISOString(),
          settledBy: currentUser?.displayName || currentUser?.email
        });
      });

      await Promise.all(updatePromises);

      // Google Sheetsに精算完了日を書き戻す
      const sheetUpdatePromises = recordsToSettle.map(record => {
        return updateRecordToSheet({
          ...record,
          settlementCompletedDate: settlementCompletedDate
        });
      });

      await Promise.all(sheetUpdatePromises);
    } catch (error) {
      console.error('精算エラー:', error);
      alert('精算処理に失敗しました: ' + error.message);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split('-');
    return `${year}年${parseInt(month)}月`;
  };

  const formatDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(month)}/${parseInt(day)}`;
  };

  const openEditModal = (record) => {
    setEditingRecord(record);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setEditingRecord(null);
    setShowEditModal(false);
  };

  const saveEditedRecord = async (updatedData) => {
    setIsProcessing(true);
    setProcessingMessage('更新中...');

    try {
      const recordRef = doc(db, 'records', editingRecord.id);

      // 未精算→精算済みに変更された場合、精算完了日を追加
      let finalUpdatedData = { ...updatedData };
      if (editingRecord.settlementStatus === 'unsettled' && updatedData.settlementStatus === 'settled') {
        const settlementCompletedDate = new Date().toISOString().split('T')[0];
        finalUpdatedData.settlementCompletedDate = settlementCompletedDate;
      }
      // 精算済み→未精算に変更された場合、精算完了日を削除
      else if (editingRecord.settlementStatus === 'settled' && updatedData.settlementStatus === 'unsettled') {
        finalUpdatedData.settlementCompletedDate = '';
      }

      // 精算有→精算不要に変更された場合、精算関連フィールドをクリア
      if (editingRecord.needsSettlement === 'yes' && updatedData.needsSettlement === 'no') {
        finalUpdatedData.settleWith = null;
        finalUpdatedData.settlementRatio = null;
        finalUpdatedData.settlementRatioType = null;
        finalUpdatedData.myRatio = null;
        finalUpdatedData.myAmount = null;
        finalUpdatedData.settlementAmountValue = null;
        finalUpdatedData.settlementStatus = null;
        finalUpdatedData.settlementCompletedDate = '';
      }

      await updateDoc(recordRef, {
        ...finalUpdatedData,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.displayName || currentUser?.email
      });

      // Google Sheetsに同期
      try {
        const completeRecord = {
          ...editingRecord,
          ...finalUpdatedData
        };
        await updateRecordToSheet(completeRecord);
      } catch (sheetError) {
        console.error('Google Sheets sync error:', sheetError);
        // Google Sheetsの同期に失敗してもFirestoreは更新されているので続行
      }

      closeEditModal();
    } catch (error) {
      console.error('更新エラー:', error);
      alert('更新に失敗しました: ' + error.message);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const EditModal = ({ record, onClose, onSave }) => {
    const [editCategory, setEditCategory] = useState(record.category);
    const [editNeedsSettlement, setEditNeedsSettlement] = useState(record.needsSettlement);
    const [editSettleWith, setEditSettleWith] = useState(record.settleWith);
    const [editSettlementRatioType, setEditSettlementRatioType] = useState(record.settlementRatioType || '');
    const [editMyRatio, setEditMyRatio] = useState(record.myRatio?.toString() || '');
    const [editMyAmount, setEditMyAmount] = useState(record.myAmount?.toString() || '');
    const [editSettlementStatus, setEditSettlementStatus] = useState(record.settlementStatus);

    const handleSaveEdit = () => {
      let finalRatio = '';
      let settlementAmountValue = 0;

      if (editSettlementRatioType === 'full') {
        finalRatio = '立替';
        settlementAmountValue = record.amount;
      } else if (editSettlementRatioType === 'half') {
        finalRatio = '折半';
        settlementAmountValue = record.amount / 2;
      } else if (editSettlementRatioType === 'ratio') {
        if (!editMyRatio) {
          alert('比率を選択してください');
          return;
        }
        const theirRatio = 10 - parseInt(editMyRatio);
        finalRatio = `比率 ${editMyRatio}:${theirRatio}`;
        settlementAmountValue = (record.amount * theirRatio) / 10;
      } else if (editSettlementRatioType === 'amount') {
        if (!editMyAmount) {
          alert('金額を入力してください');
          return;
        }
        const theirAmount = record.amount - parseInt(editMyAmount);
        finalRatio = `金額 自分¥${parseInt(editMyAmount).toLocaleString()}/相手¥${theirAmount.toLocaleString()}`;
        settlementAmountValue = theirAmount;
      }

      onSave({
        payer: currentUser?.displayName,
        category: editCategory,
        needsSettlement: editNeedsSettlement,
        settleWith: editNeedsSettlement === 'yes' ? editSettleWith : null,
        settlementRatio: editNeedsSettlement === 'yes' ? finalRatio : null,
        settlementRatioType: editNeedsSettlement === 'yes' ? editSettlementRatioType : null,
        myRatio: editNeedsSettlement === 'yes' && editSettlementRatioType === 'ratio' ? editMyRatio : null,
        myAmount: editNeedsSettlement === 'yes' && editSettlementRatioType === 'amount' ? parseInt(editMyAmount) : null,
        settlementAmountValue: editNeedsSettlement === 'yes' ? Math.round(settlementAmountValue) : null,
        settlementStatus: editNeedsSettlement === 'yes' ? editSettlementStatus : null,
      });
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto" onClick={onClose}>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6 sticky top-0 bg-white pb-4 border-b">
                <h2 className="text-2xl font-bold text-gray-800">レコード編集</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                    {record.paymentMethod}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mb-1">{record.date}</div>
                <div className="text-xl font-bold text-gray-800 mb-1">{record.merchant}</div>
                <div className="text-2xl font-bold text-indigo-600">¥{record.amount.toLocaleString()}</div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">カテゴリ</label>
                <div className="space-y-4">
                  {Object.entries(categories).map(([groupName, items]) => (
                    <div key={groupName}>
                      <div className="text-sm font-semibold text-gray-600 mb-2">{groupName}</div>
                      <div className="grid grid-cols-3 gap-2">
                        {items.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setEditCategory(cat)}
                            className={`py-2 px-3 rounded-lg border-2 transition-all text-sm ${
                              editCategory === cat
                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">精算有無</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditNeedsSettlement('yes')}
                    className={`py-4 px-6 rounded-lg border-2 transition-all ${
                      editNeedsSettlement === 'yes'
                        ? 'border-green-500 bg-green-50 text-green-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    精算有
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditNeedsSettlement('no')}
                    className={`py-4 px-6 rounded-lg border-2 transition-all ${
                      editNeedsSettlement === 'no'
                        ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    精算不要
                  </button>
                </div>
              </div>

              {editNeedsSettlement === 'yes' && (
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">精算相手</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditSettleWith(getOtherUser())}
                        className={`py-3 px-4 rounded-lg border-2 transition-all ${
                          editSettleWith === getOtherUser()
                            ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        {getOtherUser()}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditSettleWith('Other')}
                        className={`py-3 px-4 rounded-lg border-2 transition-all ${
                          editSettleWith === 'Other'
                            ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        Other
                      </button>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">精算方法</label>
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditSettlementRatioType('full');
                          setEditMyRatio('');
                          setEditMyAmount('');
                        }}
                        className={`w-full py-3 px-4 rounded-lg border-2 transition-all text-left ${
                          editSettlementRatioType === 'full'
                            ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <span className="font-semibold">立替</span>
                        <span className="text-sm ml-2 text-gray-500">(全額相手負担)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditSettlementRatioType('half');
                          setEditMyRatio('');
                          setEditMyAmount('');
                        }}
                        className={`w-full py-3 px-4 rounded-lg border-2 transition-all text-left ${
                          editSettlementRatioType === 'half'
                            ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <span className="font-semibold">折半</span>
                        <span className="text-sm ml-2 text-gray-500">(半分ずつ)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditSettlementRatioType('ratio');
                          setEditMyAmount('');
                        }}
                        className={`w-full py-3 px-4 rounded-lg border-2 transition-all text-left ${
                          editSettlementRatioType === 'ratio'
                            ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <span className="font-semibold">比率</span>
                        <span className="text-sm ml-2 text-gray-500">(割合で指定)</span>
                      </button>

                      {editSettlementRatioType === 'ratio' && (
                        <div className="bg-teal-50 p-4 rounded-lg border-2 border-teal-200">
                          <div className="mb-3">
                            <label className="text-sm font-semibold text-gray-700 block mb-2">
                              自分の支払い割合 (10分の{editMyRatio || '?'})
                            </label>
                            <div className="grid grid-cols-5 gap-2">
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                <button
                                  key={num}
                                  type="button"
                                  onClick={() => setEditMyRatio(num.toString())}
                                  className={`py-3 px-2 rounded-lg border-2 font-semibold transition-all ${
                                    editMyRatio === num.toString()
                                      ? 'border-teal-600 bg-teal-600 text-white'
                                      : 'border-teal-300 bg-white text-teal-700 hover:bg-teal-100'
                                  }`}
                                >
                                  {num}
                                </button>
                              ))}
                            </div>
                          </div>
                          {editMyRatio && (
                            <div className="mt-3 p-3 bg-white rounded-lg">
                              <div className="flex justify-between items-center text-sm">
                                <div>
                                  <div className="text-gray-600">自分の支払い</div>
                                  <div className="text-lg font-bold text-gray-800">
                                    ¥{Math.round((record.amount * parseInt(editMyRatio)) / 10).toLocaleString()}
                                  </div>
                                </div>
                                <div className="text-gray-400">→</div>
                                <div className="text-right">
                                  <div className="text-gray-600">相手の支払い</div>
                                  <div className="text-lg font-bold text-teal-600">
                                    ¥{Math.round((record.amount * (10 - parseInt(editMyRatio))) / 10).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditSettlementRatioType('amount');
                          setEditMyRatio('');
                        }}
                        className={`w-full py-3 px-4 rounded-lg border-2 transition-all text-left ${
                          editSettlementRatioType === 'amount'
                            ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <span className="font-semibold">金額</span>
                        <span className="text-sm ml-2 text-gray-500">(金額で指定)</span>
                      </button>

                      {editSettlementRatioType === 'amount' && (
                        <div className="bg-teal-50 p-4 rounded-lg border-2 border-teal-200">
                          <label className="text-sm font-semibold text-gray-700 block mb-2">
                            自分の支払い金額
                          </label>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg font-bold text-gray-700">¥</span>
                            <input
                              type="number"
                              value={editMyAmount}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                if (val <= record.amount) {
                                  setEditMyAmount(e.target.value);
                                }
                              }}
                              placeholder="0"
                              min="0"
                              max={record.amount}
                              className="flex-1 px-4 py-3 border-2 border-teal-500 rounded-lg focus:outline-none text-lg font-semibold"
                            />
                          </div>
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            {[1000, 2000, 3000, 5000].map(amount => (
                              <button
                                key={amount}
                                type="button"
                                onClick={() => {
                                  const newAmount = (parseInt(editMyAmount) || 0) + amount;
                                  if (newAmount <= record.amount) {
                                    setEditMyAmount(newAmount.toString());
                                  }
                                }}
                                className="py-2 px-3 bg-white border-2 border-teal-300 rounded-lg text-teal-700 font-semibold hover:bg-teal-100 transition-all text-sm"
                              >
                                +¥{amount.toLocaleString()}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <button
                              type="button"
                              onClick={() => setEditMyAmount('0')}
                              className="py-2 px-3 bg-white border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-all text-sm"
                            >
                              クリア
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditMyAmount(record.amount.toString())}
                              className="py-2 px-3 bg-white border-2 border-teal-300 rounded-lg text-teal-700 font-semibold hover:bg-teal-100 transition-all text-sm"
                            >
                              全額
                            </button>
                          </div>
                          {editMyAmount && (
                            <div className="mt-3 p-3 bg-white rounded-lg">
                              <div className="flex justify-between items-center text-sm">
                                <div>
                                  <div className="text-gray-600">自分の支払い</div>
                                  <div className="text-lg font-bold text-gray-800">
                                    ¥{parseInt(editMyAmount).toLocaleString()}
                                  </div>
                                </div>
                                <div className="text-gray-400">→</div>
                                <div className="text-right">
                                  <div className="text-gray-600">相手の支払い</div>
                                  <div className="text-lg font-bold text-teal-600">
                                    ¥{(record.amount - parseInt(editMyAmount)).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">精算状態</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEditSettlementStatus('unsettled')}
                        className={`py-4 px-6 rounded-lg border-2 transition-all ${
                          editSettlementStatus === 'unsettled'
                            ? 'border-yellow-500 bg-yellow-50 text-yellow-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        未精算
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditSettlementStatus('settled')}
                        className={`py-4 px-6 rounded-lg border-2 transition-all ${
                          editSettlementStatus === 'settled'
                            ? 'border-green-500 bg-green-50 text-green-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        精算済み
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 sticky bottom-0 bg-white pt-4 border-t mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
                >
                  更新
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleSave = async () => {
    if (!category || !needsSettlement) {
      alert('カテゴリ、精算有無を選択してください');
      return;
    }

    if (needsSettlement === 'yes' && !settleWith) {
      alert('精算相手を選択してください');
      return;
    }

    if (needsSettlement === 'yes' && !settlementRatioType) {
      alert('精算方法を選択してください');
      return;
    }

    if (needsSettlement === 'yes' && settlementRatioType === 'ratio' && !myRatio) {
      alert('比率を選択してください');
      return;
    }

    if (needsSettlement === 'yes' && settlementRatioType === 'amount' && !myAmount) {
      alert('金額を入力してください');
      return;
    }

    const payer = currentUser?.displayName; // 入力者はログインユーザー

    let finalRatio = '';
    let settlementAmountValue = 0;

    if (settlementRatioType === 'full') {
      finalRatio = '立替';
      settlementAmountValue = currentRecord.amount;
    } else if (settlementRatioType === 'half') {
      finalRatio = '折半';
      settlementAmountValue = currentRecord.amount / 2;
    } else if (settlementRatioType === 'ratio') {
      const theirRatio = 10 - parseInt(myRatio);
      finalRatio = `比率 ${myRatio}:${theirRatio}`;
      settlementAmountValue = (currentRecord.amount * theirRatio) / 10;
    } else if (settlementRatioType === 'amount') {
      const theirAmount = currentRecord.amount - parseInt(myAmount);
      finalRatio = `金額 自分¥${parseInt(myAmount).toLocaleString()}/相手¥${theirAmount.toLocaleString()}`;
      settlementAmountValue = theirAmount;
    }

    setIsProcessing(true);
    setProcessingMessage('保存中...');

    try {
      const processedDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式の処理日

      // Firestoreのドキュメントを更新
      const recordRef = doc(db, 'records', currentRecord.id);
      await updateDoc(recordRef, {
        payer,
        category,
        needsSettlement,
        settleWith: needsSettlement === 'yes' ? settleWith : null,
        settlementRatio: needsSettlement === 'yes' ? finalRatio : null,
        settlementRatioType: needsSettlement === 'yes' ? settlementRatioType : null,
        myRatio: needsSettlement === 'yes' && settlementRatioType === 'ratio' ? myRatio : null,
        myAmount: needsSettlement === 'yes' && settlementRatioType === 'amount' ? parseInt(myAmount) : null,
        settlementAmountValue: needsSettlement === 'yes' ? Math.round(settlementAmountValue) : null,
        settlementStatus: needsSettlement === 'yes' ? 'unsettled' : null,
        processedDate: processedDate, // 処理日を追加
        status: 'closed',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.displayName || currentUser?.email
      });

      // Google Sheetsに書き戻し
      try {
        await updateRecordToSheet({
          date: currentRecord.date,
          merchant: currentRecord.merchant,
          amount: currentRecord.amount,
          owner: currentRecord.owner,
          cardType: currentRecord.cardType,
          payer,
          category,
          needsSettlement, // 'yes'/'no'のまま渡す（googleSheets.jsで'必要'/'不要'に変換される）
          settleWith: needsSettlement === 'yes' ? settleWith : '',
          settlementRatioType: needsSettlement === 'yes' ? settlementRatioType : '',
          myRatio: needsSettlement === 'yes' && settlementRatioType === 'ratio' ? myRatio : '',
          myAmount: needsSettlement === 'yes' && settlementRatioType === 'amount' ? parseInt(myAmount) : '',
          settlementStatus: needsSettlement === 'yes' ? 'unsettled' : '', // 'unsettled'のまま渡す（googleSheets.jsで'未精算'に変換される）
          processedDate: processedDate // 処理日を追加
        });
        console.log('Google Sheetsへの書き戻し成功');
      } catch (sheetError) {
        console.error('Google Sheets書き戻しエラー:', sheetError);
        // Google Sheetsの書き戻しに失敗してもFirestoreの保存は成功しているので、エラーは無視
      }

      // フォームをリセット
      setCategory('');
      setNeedsSettlement('');
      setSettleWith('');
      setSettlementRatioType('');
      setMyRatio('');
      setMyAmount('');
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました: ' + error.message);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  // 一括保存処理
  const handleBatchSave = async () => {
    // 選択されたレコードのみ取得
    const selectedRecordsToSave = records.filter(r =>
      r.status === 'pending' && batchSelectedRecords.includes(r.id)
    );

    if (selectedRecordsToSave.length === 0) {
      alert('保存するレコードを選択してください');
      return;
    }

    // バリデーション
    for (const record of selectedRecordsToSave) {
      const data = batchRecordData[record.id];
      if (!data || !data.category) {
        alert(`${record.merchant} のカテゴリを選択してください`);
        return;
      }
      if (data.needsSettlement === 'yes' && !data.settleWith) {
        alert(`${record.merchant} の精算相手を選択してください`);
        return;
      }
      if (data.needsSettlement === 'yes' && !data.settlementRatioType) {
        alert(`${record.merchant} の精算方法を選択してください`);
        return;
      }
    }

    setIsProcessing(true);
    setProcessingMessage(`${selectedRecordsToSave.length}件のレコードを保存中...`);

    try {
      const payer = currentUser?.displayName;
      const processedDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式の処理日

      // 選択されたレコードのみを並列で処理
      const updatePromises = selectedRecordsToSave.map(async (record) => {
        const data = batchRecordData[record.id];

        let finalRatio = '';
        let settlementAmountValue = 0;

        if (data.settlementRatioType === 'full') {
          finalRatio = '立替';
          settlementAmountValue = record.amount;
        } else if (data.settlementRatioType === 'half') {
          finalRatio = '折半';
          settlementAmountValue = record.amount / 2;
        } else if (data.settlementRatioType === 'ratio') {
          const theirRatio = 10 - parseInt(data.myRatio);
          finalRatio = `比率 ${data.myRatio}:${theirRatio}`;
          settlementAmountValue = (record.amount * theirRatio) / 10;
        } else if (data.settlementRatioType === 'amount') {
          const theirAmount = record.amount - parseInt(data.myAmount);
          finalRatio = `金額 自分¥${parseInt(data.myAmount).toLocaleString()}/相手¥${theirAmount.toLocaleString()}`;
          settlementAmountValue = theirAmount;
        }

        // Firestoreを更新
        const recordRef = doc(db, 'records', record.id);
        await updateDoc(recordRef, {
          payer,
          category: data.category,
          needsSettlement: data.needsSettlement,
          settleWith: data.needsSettlement === 'yes' ? data.settleWith : null,
          settlementRatio: data.needsSettlement === 'yes' ? finalRatio : null,
          settlementRatioType: data.needsSettlement === 'yes' ? data.settlementRatioType : null,
          myRatio: data.needsSettlement === 'yes' && data.settlementRatioType === 'ratio' ? data.myRatio : null,
          myAmount: data.needsSettlement === 'yes' && data.settlementRatioType === 'amount' ? parseInt(data.myAmount) : null,
          settlementAmountValue: data.needsSettlement === 'yes' ? Math.round(settlementAmountValue) : null,
          settlementStatus: data.needsSettlement === 'yes' ? 'unsettled' : null,
          processedDate: processedDate, // 処理日を追加
          status: 'closed',
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser?.displayName || currentUser?.email
        });

        // Google Sheetsに書き戻し
        try {
          await updateRecordToSheet({
            date: record.date,
            merchant: record.merchant,
            amount: record.amount,
            owner: record.owner,
            cardType: record.cardType,
            payer,
            category: data.category,
            needsSettlement: data.needsSettlement, // 'yes'/'no'のまま渡す（googleSheets.jsで'必要'/'不要'に変換される）
            settleWith: data.needsSettlement === 'yes' ? data.settleWith : '',
            settlementRatioType: data.needsSettlement === 'yes' ? data.settlementRatioType : '',
            myRatio: data.needsSettlement === 'yes' && data.settlementRatioType === 'ratio' ? data.myRatio : '',
            myAmount: data.needsSettlement === 'yes' && data.settlementRatioType === 'amount' ? parseInt(data.myAmount) : '',
            settlementStatus: data.needsSettlement === 'yes' ? 'unsettled' : '', // 'unsettled'のまま渡す（googleSheets.jsで'未精算'に変換される）
            processedDate: processedDate // 処理日を追加
          });
        } catch (sheetError) {
          console.error('Google Sheets書き戻しエラー:', sheetError);
        }
      });

      await Promise.all(updatePromises);

      // 選択をクリア
      setBatchSelectedRecords([]);

      // 保存したレコードの一括データをクリア
      const newBatchData = { ...batchRecordData };
      selectedRecordsToSave.forEach(record => {
        delete newBatchData[record.id];
      });
      setBatchRecordData(newBatchData);

      alert(`${selectedRecordsToSave.length}件のレコードを保存しました`);
    } catch (error) {
      console.error('一括保存エラー:', error);
      alert('保存に失敗しました: ' + error.message);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  if (!currentRecord && activeTab === 'classify') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-800">おうち決算</h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-700">
                    {currentUser?.displayName || currentUser?.email}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="ログアウト"
                >
                  <LogOut className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('classify')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white"
              >
                <div className="text-sm">分類</div>
                <div className="text-xs mt-1">{pendingRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settlement')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600"
              >
                <div className="text-sm">精算管理</div>
                <div className="text-xs mt-1">{unsettledRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600"
              >
                <div className="text-sm">履歴</div>
                <div className="text-xs mt-1">{closedRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600"
              >
                <div className="text-sm">統計</div>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleImportFromSheets}
            disabled={isImporting}
            className="w-full mb-4 py-3 px-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-400"
          >
            {isImporting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                取り込み中...
              </>
            ) : (
              <>
                Google Sheetsから取り込む
              </>
            )}
          </button>

          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">未処理レコードなし</h2>
            <p className="text-gray-600">すべてのレコードが処理済みです</p>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'settlement') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-800">おうち決算</h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-700">
                    {currentUser?.displayName || currentUser?.email}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="ログアウト"
                >
                  <LogOut className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('classify')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
              >
                <div className="text-sm">分類</div>
                <div className="text-xs mt-1">{pendingRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settlement')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white whitespace-nowrap"
              >
                <div className="text-sm">精算管理</div>
                <div className="text-xs mt-1">{unsettledRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
              >
                <div className="text-sm">履歴</div>
                <div className="text-xs mt-1">{closedRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
              >
                <div className="text-sm">統計</div>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-green-600" />
                精算サマリー
              </h2>

              {Object.keys(settlementSummary).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  未精算の項目はありません
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(settlementSummary).map(([person, amounts]) => {
                    const netAmount = amounts.toMe - amounts.toThem;
                    const isReceiving = netAmount > 0;
                    const displayAmount = Math.abs(netAmount);

                    if (displayAmount === 0) return null;

                    return (
                      <div key={person} className={`rounded-xl p-5 border-2 ${
                        isReceiving
                          ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200'
                          : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-sm text-gray-600 mb-1">
                              {isReceiving ? `${person} → あなた` : `あなた → ${person}`}
                            </div>
                            <div className="text-lg text-gray-700">
                              {isReceiving ? '受け取る金額' : '支払う金額'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-3xl font-bold ${
                              isReceiving ? 'text-blue-600' : 'text-green-600'
                            }`}>
                              ¥{displayAmount.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => settleAllWithPerson(person)}
                          className={`w-full py-3 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                            isReceiving
                              ? 'bg-blue-600 hover:bg-blue-700'
                              : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          <Check className="w-5 h-5" />
                          {isReceiving ? `${person}から受け取り完了` : `${person}への支払いを完了`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">未精算レコード</h2>
                {unsettledRecords.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={selectAllRecords}
                      className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-semibold"
                    >
                      すべて選択
                    </button>
                    {Array.from(new Set(unsettledRecords.map(r => r.payer))).map(payer => (
                      <button
                        key={payer}
                        type="button"
                        onClick={() => selectByPayer(payer)}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-semibold"
                      >
                        {payer}のみ
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={clearAllSelections}
                      className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                    >
                      クリア
                    </button>
                  </div>
                )}
              </div>

              {unsettledRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  未精算のレコードはありません
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-4">
                    {unsettledRecords.map(record => (
                      <div
                        key={record.id}
                        onClick={() => toggleRecordSelection(record.id)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedRecords.includes(record.id)
                            ? 'bg-green-50 border-green-300'
                            : 'bg-yellow-50 border-yellow-200 hover:border-yellow-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex items-center pt-1">
                            <input
                              type="checkbox"
                              checked={selectedRecords.includes(record.id)}
                              onChange={() => toggleRecordSelection(record.id)}
                              className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-gray-500">{formatDate(record.date)}</span>
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                                {record.paymentMethod}
                              </span>
                            </div>
                            <div className="font-semibold text-gray-800 mb-1">{record.merchant}</div>
                            <div className="text-sm text-gray-600 mb-2">
                              入力者: {record.payer} • {record.category} • {record.settleWith}と精算 ({record.settlementRatio})
                            </div>
                            <div className="flex items-center gap-4">
                              <div>
                                <div className="text-xs text-gray-500">支払総額</div>
                                <div className="text-lg font-bold text-gray-700">
                                  ¥{record.amount.toLocaleString()}
                                </div>
                              </div>
                              <div className="text-gray-400">→</div>
                              <div>
                                <div className="text-xs text-gray-500">精算額</div>
                                <div className="text-lg font-bold text-green-600">
                                  ¥{getSettlementAmount(record).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedRecords.length > 0 && (
                    <div className="sticky bottom-0 bg-white pt-4 border-t space-y-4">
                      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border-2 border-indigo-200">
                        <h3 className="text-sm font-bold text-gray-700 mb-3">選択した精算の内訳</h3>
                        <div className="space-y-2">
                          {Object.entries(calculateSelectedSummary()).map(([direction, amount]) => {
                            const [from, to] = direction.split(' → ');
                            const isFromMe = from === 'Seigo';
                            const isToMe = to === 'Seigo';

                            return (
                              <div key={direction} className="flex items-center justify-between bg-white rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${
                                    isToMe ? 'bg-blue-500' : isFromMe ? 'bg-green-500' : 'bg-gray-500'
                                  }`}></div>
                                  <span className="text-sm font-semibold text-gray-700">
                                    {direction}
                                  </span>
                                </div>
                                <div className={`text-lg font-bold ${
                                  isToMe ? 'text-blue-600' : isFromMe ? 'text-green-600' : 'text-gray-700'
                                }`}>
                                  ¥{amount.toLocaleString()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={settleSelectedRecords}
                        className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Check className="w-5 h-5" />
                        選択した{selectedRecords.length}件を精算済みにする
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'analytics') {
    const stats = selectedMonth && months.includes(selectedMonth)
      ? calculateMonthlyStats(selectedMonth)
      : null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-800">おうち決算</h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-700">
                    {currentUser?.displayName || currentUser?.email}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="ログアウト"
                >
                  <LogOut className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('classify')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">分類</div>
                <div className="text-xs mt-1">{pendingRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settlement')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">精算管理</div>
                <div className="text-xs mt-1">{unsettledRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">履歴</div>
                <div className="text-xs mt-1">{closedRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white"
              >
                <div className="text-sm">統計</div>
              </button>
            </div>
          </div>

          {months.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
              <p className="text-gray-500">処理済みのレコードはまだありません</p>
            </div>
          ) : (
            <>
              {/* サブタブ切り替え */}
              <div className="bg-white rounded-2xl shadow-xl p-4 mb-6">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab('monthly')}
                    className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                      analyticsSubTab === 'monthly'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    月別推移
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalyticsSubTab('category')}
                    className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                      analyticsSubTab === 'category'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    カテゴリ別
                  </button>
                </div>
              </div>

              {/* 月別推移タブ */}
              {analyticsSubTab === 'monthly' && (
                <>
                  {/* カテゴリ選択 */}
                  <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">
                      カテゴリを選択
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">全支出</option>
                      <option value="_fixed">固定費合計</option>
                      <option value="_variable">変動費合計</option>
                      <optgroup label="固定費">
                        {categories['固定費'].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </optgroup>
                      <optgroup label="変動費">
                        {categories['変動費'].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* 月別推移グラフ */}
                  <div className="bg-white rounded-2xl shadow-xl p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">
                      {selectedCategory === '' && '全支出の推移'}
                      {selectedCategory === '_fixed' && '固定費の推移'}
                      {selectedCategory === '_variable' && '変動費の推移'}
                      {selectedCategory && !selectedCategory.startsWith('_') && `${selectedCategory}の推移`}
                    </h3>
                    {(() => {
                      // 全月の統計を計算
                      const allMonthsStats = months.map(month => ({
                        month,
                        ...calculateMonthlyStats(month)
                      }));

                      // 選択されたカテゴリのデータを抽出
                      let chartData;
                      if (selectedCategory === '') {
                        chartData = allMonthsStats.map(s => ({ month: s.month, amount: s.totalAmount }));
                      } else if (selectedCategory === '_fixed') {
                        chartData = allMonthsStats.map(s => ({ month: s.month, amount: s.fixedCostTotal }));
                      } else if (selectedCategory === '_variable') {
                        chartData = allMonthsStats.map(s => ({ month: s.month, amount: s.variableCostTotal }));
                      } else {
                        chartData = allMonthsStats.map(s => ({
                          month: s.month,
                          amount: s.categoryTotals[selectedCategory] || 0
                        }));
                      }

                      const maxAmount = Math.max(...chartData.map(d => d.amount), 1);

                      return (
                        <div className="space-y-2">
                          {chartData.map((data, index) => {
                            const heightPercent = (data.amount / maxAmount) * 100;
                            return (
                              <div key={data.month} className="flex items-center gap-3">
                                <div className="w-20 text-sm font-semibold text-gray-600">
                                  {formatMonth(data.month)}
                                </div>
                                <div className="flex-1 bg-gray-100 rounded-lg h-10 overflow-hidden relative">
                                  <div
                                    className="bg-indigo-500 h-full rounded-lg transition-all duration-300"
                                    style={{ width: `${heightPercent}%` }}
                                  ></div>
                                </div>
                                <div className="w-28 text-sm font-semibold text-gray-700 text-right">
                                  ¥{data.amount.toLocaleString()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* カテゴリ別タブ */}
              {analyticsSubTab === 'category' && stats && (
                <>
                  {/* 月選択 */}
                  <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
                    <h2 className="text-lg font-bold text-gray-800 mb-4">月を選択</h2>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {months.map(month => (
                        <button
                          key={month}
                          type="button"
                          onClick={() => setSelectedMonth(month)}
                          className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                            selectedMonth === month
                              ? 'bg-indigo-600 text-white font-semibold'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {formatMonth(month)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* サマリーカード */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {/* 合計支出 */}
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">合計支出</h3>
                      <p className="text-3xl font-bold text-gray-800">¥{stats.totalAmount.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">{stats.recordCount}件</p>
                    </div>

                    {/* 固定費 */}
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">固定費</h3>
                      <p className="text-3xl font-bold text-blue-600">¥{stats.fixedCostTotal.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats.totalAmount > 0 ? Math.round((stats.fixedCostTotal / stats.totalAmount) * 100) : 0}%
                      </p>
                    </div>

                    {/* 変動費 */}
                    <div className="bg-white rounded-2xl shadow-xl p-6">
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">変動費</h3>
                      <p className="text-3xl font-bold text-green-600">¥{stats.variableCostTotal.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats.totalAmount > 0 ? Math.round((stats.variableCostTotal / stats.totalAmount) * 100) : 0}%
                      </p>
                    </div>
                  </div>

                  {/* カテゴリ別集計 */}
                  <div className="bg-white rounded-2xl shadow-xl p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">カテゴリ別支出</h3>
                    <div className="space-y-3">
                      {Object.entries(stats.categoryTotals)
                        .sort((a, b) => b[1] - a[1])
                        .map(([category, amount]) => {
                          const percentage = stats.totalAmount > 0
                            ? Math.round((amount / stats.totalAmount) * 100)
                            : 0;
                          const isFixed = categories['固定費'].includes(category);

                          return (
                            <div key={category} className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-sm font-semibold ${isFixed ? 'text-blue-700' : 'text-green-700'}`}>
                                    {category}
                                  </span>
                                  <span className="text-sm font-bold text-gray-700">
                                    ¥{amount.toLocaleString()} ({percentage}%)
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${isFixed ? 'bg-blue-500' : 'bg-green-500'}`}
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (activeTab === 'history') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-800">おうち決算</h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-700">
                    {currentUser?.displayName || currentUser?.email}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="ログアウト"
                >
                  <LogOut className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('classify')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">分類</div>
                <div className="text-xs mt-1">{pendingRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settlement')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">精算管理</div>
                <div className="text-xs mt-1">{unsettledRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white"
              >
                <div className="text-sm">履歴</div>
                <div className="text-xs mt-1">{closedRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">統計</div>
              </button>
            </div>
          </div>

          {months.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
              <p className="text-gray-500">処理済みのレコードはまだありません</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">処理済みレコード</h2>

              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {months.map(month => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => setSelectedMonth(month)}
                    className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                      selectedMonth === month
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {formatMonth(month)}
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recordsByMonth[selectedMonth]?.map(record => (
                  <div key={record.id} className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-indigo-300 transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-gray-500">{formatDate(record.date)}</span>
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                            {record.paymentMethod}
                          </span>
                          {record.settlementStatus === 'settled' && (
                            <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                              精算済み
                            </span>
                          )}
                          {record.settlementStatus === 'unsettled' && (
                            <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">
                              未精算
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-gray-800">{record.merchant}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          入力者: {record.payer} • {record.category} • {record.needsSettlement === 'yes' ? `${record.settleWith}と精算 (${record.settlementRatio})` : '精算不要'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-700 text-lg mb-2">¥{record.amount.toLocaleString()}</div>
                        <button
                          type="button"
                          onClick={() => openEditModal(record)}
                          className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-sm font-semibold"
                        >
                          編集
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showEditModal && editingRecord && (
            <EditModal
              record={editingRecord}
              onClose={closeEditModal}
              onSave={saveEditedRecord}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-800">おうち決算</h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg">
                <User className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-semibold text-indigo-700">
                  {currentUser?.displayName || currentUser?.email}
                </span>
              </div>
              <button
                onClick={logout}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="ログアウト"
              >
                <LogOut className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('classify')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white whitespace-nowrap"
            >
              <div className="text-sm">分類</div>
              <div className="text-xs mt-1">{pendingRecords.length}件</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settlement')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
            >
              <div className="text-sm">精算管理</div>
              <div className="text-xs mt-1">{unsettledRecords.length}件</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
            >
              <div className="text-sm">履歴</div>
              <div className="text-xs mt-1">{closedRecords.length}件</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
            >
              <div className="text-sm">統計</div>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleImportFromSheets}
          disabled={isImporting}
          className="w-full mb-4 py-3 px-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-400"
        >
          {isImporting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              取り込み中...
            </>
          ) : (
            <>
              Google Sheetsから取り込む
            </>
          )}
        </button>

        {/* モード切り替えボタン */}
        <div className="bg-white rounded-2xl shadow-xl p-4 mb-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setClassifyMode('single')}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all text-sm ${
                classifyMode === 'single'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              個別処理
            </button>
            <button
              type="button"
              onClick={() => setClassifyMode('batch')}
              className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-all text-sm ${
                classifyMode === 'batch'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              一括処理
            </button>
          </div>
        </div>

        {/* 個別処理 */}
        {classifyMode === 'single' && currentRecord && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-semibold text-indigo-600">{currentRecord.paymentMethod}</span>
              </div>
              <div className="text-sm text-gray-500 mb-1">{currentRecord.date}</div>
              <div className="text-2xl font-bold text-gray-800 mb-1">{currentRecord.merchant}</div>
              <div className="text-3xl font-bold text-indigo-600">¥{currentRecord.amount.toLocaleString()}</div>
              <div className="text-sm text-gray-500 mt-2">
                残り {pendingRecords.length - 1} 件
              </div>
            </div>

            {/* カテゴリ選択 */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                カテゴリ <span className="text-red-500">*</span>
              </label>
              <div className="space-y-4">
                {Object.entries(categories).map(([groupName, items]) => (
                  <div key={groupName}>
                    <div className="text-sm font-semibold text-gray-600 mb-2">{groupName}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {items.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategory(cat)}
                          className={`py-3 px-4 rounded-lg border-2 transition-all text-sm font-semibold ${
                            category === cat
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 精算有無 */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                精算有無 <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNeedsSettlement('yes')}
                  className={`py-4 px-6 rounded-lg border-2 transition-all ${
                    needsSettlement === 'yes'
                      ? 'border-green-500 bg-green-50 text-green-700 font-semibold'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  精算有
                </button>
                <button
                  type="button"
                  onClick={() => setNeedsSettlement('no')}
                  className={`py-4 px-6 rounded-lg border-2 transition-all ${
                    needsSettlement === 'no'
                      ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  精算不要
                </button>
              </div>
            </div>

            {/* 精算設定 */}
            {needsSettlement === 'yes' && (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    精算相手 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettleWith(getOtherUser())}
                      className={`py-3 px-4 rounded-lg border-2 transition-all ${
                        settleWith === getOtherUser()
                          ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {getOtherUser()}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettleWith('Other')}
                      className={`py-3 px-4 rounded-lg border-2 transition-all ${
                        settleWith === 'Other'
                          ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      Other
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    精算方法 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettlementRatioType('full')}
                      className={`py-3 px-4 rounded-lg border-2 transition-all text-sm ${
                        settlementRatioType === 'full'
                          ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      立替（全額相手負担）
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlementRatioType('half')}
                      className={`py-3 px-4 rounded-lg border-2 transition-all text-sm ${
                        settlementRatioType === 'half'
                          ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      折半（半分ずつ）
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlementRatioType('ratio')}
                      className={`py-3 px-4 rounded-lg border-2 transition-all text-sm ${
                        settlementRatioType === 'ratio'
                          ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      比率（割合で指定）
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlementRatioType('amount')}
                      className={`py-3 px-4 rounded-lg border-2 transition-all text-sm ${
                        settlementRatioType === 'amount'
                          ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      金額指定
                    </button>
                  </div>
                </div>

                {settlementRatioType === 'ratio' && (
                  <div className="mb-6 bg-teal-50 p-4 rounded-lg">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      自分の支払い割合 (10分の{myRatio || '?'})
                    </label>
                    <select
                      value={myRatio}
                      onChange={(e) => setMyRatio(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg"
                    >
                      <option value="">選択</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                        <option key={num} value={num}>{num}/10</option>
                      ))}
                    </select>
                  </div>
                )}

                {settlementRatioType === 'amount' && (
                  <div className="mb-6 bg-teal-50 p-4 rounded-lg">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      自分の支払い金額
                    </label>
                    <input
                      type="number"
                      value={myAmount}
                      onChange={(e) => setMyAmount(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg"
                      placeholder="金額を入力"
                    />
                    <div className="text-sm text-gray-600 mt-2">
                      相手: ¥{(currentRecord.amount - parseInt(myAmount || 0)).toLocaleString()}
                    </div>
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              onClick={handleSave}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors shadow-lg"
            >
              保存して次へ
            </button>
          </div>
        )}

        {/* 一括処理 */}
        {classifyMode === 'batch' && (
          <div className="space-y-4">
          {/* 一括保存ボタン（上部） */}
          {pendingRecords.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xl p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (batchSelectedRecords.length === pendingRecords.length) {
                      setBatchSelectedRecords([]);
                    } else {
                      setBatchSelectedRecords(pendingRecords.map(r => r.id));
                    }
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                >
                  {batchSelectedRecords.length === pendingRecords.length ? '全て選択解除' : '全て選択'}
                </button>
                <button
                  type="button"
                  onClick={handleBatchSave}
                  disabled={batchSelectedRecords.length === 0}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {batchSelectedRecords.length === 0
                    ? '選択してください'
                    : `選択した${batchSelectedRecords.length}件を一括保存`}
                </button>
              </div>
            </div>
          )}

          {pendingRecords.map((record) => {
            const data = batchRecordData[record.id] || {};
            const isSelected = batchSelectedRecords.includes(record.id);

            return (
              <div key={record.id} className={`bg-white rounded-2xl shadow-xl p-6 ${isSelected ? 'ring-2 ring-indigo-500' : ''}`}>
                {/* レコード情報 */}
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <div className="flex items-center gap-3 mb-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchSelectedRecords([...batchSelectedRecords, record.id]);
                        } else {
                          setBatchSelectedRecords(batchSelectedRecords.filter(id => id !== record.id));
                        }
                      }}
                      className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-500">{record.date}</div>
                        <div className="text-xl font-bold text-gray-800">{record.merchant}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-indigo-600">¥{record.amount.toLocaleString()}</div>
                        <div className="flex items-center gap-2 justify-end mt-1">
                          <CreditCard className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-600">{record.paymentMethod}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* カテゴリ選択 */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    カテゴリ <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={data.category || ''}
                    onChange={(e) => {
                      setBatchRecordData({
                        ...batchRecordData,
                        [record.id]: {
                          ...data,
                          category: e.target.value
                        }
                      });
                    }}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">選択してください</option>
                    {Object.entries(categories).map(([groupName, items]) => (
                      <optgroup key={groupName} label={groupName}>
                        {items.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* 精算有無 */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    精算有無 <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBatchRecordData({
                          ...batchRecordData,
                          [record.id]: {
                            ...data,
                            needsSettlement: 'yes'
                          }
                        });
                      }}
                      className={'py-2 px-4 rounded-lg border-2 transition-all text-sm ' + (
                        data.needsSettlement === 'yes'
                          ? 'border-green-500 bg-green-50 text-green-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      )}
                    >
                      精算有
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBatchRecordData({
                          ...batchRecordData,
                          [record.id]: {
                            ...data,
                            needsSettlement: 'no'
                          }
                        });
                      }}
                      className={'py-2 px-4 rounded-lg border-2 transition-all text-sm ' + (
                        data.needsSettlement === 'no'
                          ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      )}
                    >
                      精算不要
                    </button>
                  </div>
                </div>

                {/* 精算設定 */}
                {data.needsSettlement === 'yes' && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <div className="text-sm font-semibold text-gray-700 mb-3">精算設定</div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      {/* 精算相手 */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">精算相手</label>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setBatchRecordData({
                                ...batchRecordData,
                                [record.id]: {
                                  ...data,
                                  settleWith: getOtherUser()
                                }
                              });
                            }}
                            className={'py-1.5 px-2 rounded-lg border-2 transition-all text-xs ' + (
                              data.settleWith === getOtherUser()
                                ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            )}
                          >
                            {getOtherUser()}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBatchRecordData({
                                ...batchRecordData,
                                [record.id]: {
                                  ...data,
                                  settleWith: 'Other'
                                }
                              });
                            }}
                            className={'py-1.5 px-2 rounded-lg border-2 transition-all text-xs ' + (
                              data.settleWith === 'Other'
                                ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            )}
                          >
                            Other
                          </button>
                        </div>
                      </div>

                      {/* 精算方法 */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">精算方法</label>
                        <select
                          value={data.settlementRatioType || 'full'}
                          onChange={(e) => {
                            setBatchRecordData({
                              ...batchRecordData,
                              [record.id]: {
                                ...data,
                                settlementRatioType: e.target.value
                              }
                            });
                          }}
                          className="w-full px-2 py-1.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 text-xs"
                        >
                          <option value="full">立替</option>
                          <option value="half">折半</option>
                          <option value="ratio">比率</option>
                          <option value="amount">金額</option>
                        </select>
                      </div>
                    </div>

                    {/* 比率/金額入力 */}
                    {(data.settlementRatioType === 'ratio' || data.settlementRatioType === 'amount') && (
                      <div className="bg-teal-50 p-3 rounded-lg mt-3">
                        {data.settlementRatioType === 'ratio' && (
                          <>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              自分の割合: {data.myRatio || 5}/10
                            </label>
                            <select
                              value={data.myRatio || '5'}
                              onChange={(e) => {
                                setBatchRecordData({
                                  ...batchRecordData,
                                  [record.id]: {
                                    ...data,
                                    myRatio: e.target.value
                                  }
                                });
                              }}
                              className="w-full px-2 py-1.5 border-2 border-gray-300 rounded-lg text-xs"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                <option key={num} value={num}>{num}/10</option>
                              ))}
                            </select>
                          </>
                        )}
                        {data.settlementRatioType === 'amount' && (
                          <>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              自分の支払い額
                            </label>
                            <input
                              type="number"
                              value={data.myAmount || '0'}
                              onChange={(e) => {
                                setBatchRecordData({
                                  ...batchRecordData,
                                  [record.id]: {
                                    ...data,
                                    myAmount: e.target.value
                                  }
                                });
                              }}
                              className="w-full px-2 py-1.5 border-2 border-gray-300 rounded-lg text-xs"
                              placeholder="金額"
                            />
                            <div className="text-xs text-gray-600 mt-1">
                              相手: ¥{(record.amount - parseInt(data.myAmount || 0)).toLocaleString()}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>

    {/* 処理中オーバーレイ */}
    {isProcessing && (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600"></div>
            <div className="text-xl font-semibold text-gray-800">{processingMessage}</div>
            <div className="text-sm text-gray-500">しばらくお待ちください...</div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default ExpenseClassifier;
