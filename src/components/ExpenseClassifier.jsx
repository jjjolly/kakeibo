import { useState, useEffect } from 'react';
import { Check, X, CreditCard, DollarSign } from 'lucide-react';
import { fetchSpreadsheetData } from '../services/googleSheets';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, onSnapshot } from 'firebase/firestore';

const ExpenseClassifier = () => {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [payer, setPayer] = useState('');
  const [category, setCategory] = useState('');
  const [needsSettlement, setNeedsSettlement] = useState('');
  const [settleWith, setSettleWith] = useState('');
  const [settlementRatioType, setSettlementRatioType] = useState('');
  const [myRatio, setMyRatio] = useState('');
  const [myAmount, setMyAmount] = useState('');
  const [settlementPeople] = useState(['Seigo', 'Hanaka']);
  const [selectedMonth, setSelectedMonth] = useState('2026-01');
  const [activeTab, setActiveTab] = useState('classify');
  const [editingRecord, setEditingRecord] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  const categories = ['食費', '交通費', '光熱費', '通信費', '娯楽', '医療', '日用品', 'その他'];

  // Google Sheetsからデータをインポート
  const handleImportFromSheets = async () => {
    setIsImporting(true);
    try {
      const sheetData = await fetchSpreadsheetData();

      // スプレッドシートのデータをアプリ形式に変換
      const newRecords = sheetData.map((row, index) => ({
        id: Date.now() + index,
        date: row.date,
        merchant: row.merchant,
        amount: row.amount,
        paymentMethod: row.cardType,
        payer: null,
        category: null,
        needsSettlement: null,
        settleWith: null,
        settlementRatio: null,
        settlementRatioType: null,
        myRatio: null,
        myAmount: null,
        settlementAmountValue: null,
        settlementStatus: null,
        status: 'pending'
      }));

      // 既存のレコードと重複チェック（日付・店名・金額が同じものは除外）
      const existingKeys = new Set(
        records.map(r => `${r.date}-${r.merchant}-${r.amount}`)
      );

      const uniqueNewRecords = newRecords.filter(
        r => !existingKeys.has(`${r.date}-${r.merchant}-${r.amount}`)
      );

      if (uniqueNewRecords.length === 0) {
        alert('新しいレコードはありません');
      } else {
        setRecords([...records, ...uniqueNewRecords]);
        alert(`${uniqueNewRecords.length}件の新しいレコードを取り込みました`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('データの取り込みに失敗しました。\nAPI Keyとスプレッドシート設定を確認してください。\n\nエラー: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  // 初回ロード時にデータを読み込む
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = localStorage.getItem('expense-records');
        if (savedData) {
          const savedRecords = JSON.parse(savedData);
          setRecords(savedRecords);
        } else {
          setRecords([
            { id: 1, date: '2026-01-08', merchant: 'スーパーマーケット', amount: 3580, paymentMethod: 'クレジットカードA', payer: null, category: null, needsSettlement: null, settleWith: null, settlementRatio: null, settlementRatioType: null, myRatio: null, myAmount: null, settlementAmountValue: null, settlementStatus: null, status: 'pending' },
            { id: 2, date: '2026-01-07', merchant: 'レストランA', amount: 8500, paymentMethod: 'QR決済B', payer: null, category: null, needsSettlement: null, settleWith: null, settlementRatio: null, settlementRatioType: null, myRatio: null, myAmount: null, settlementAmountValue: null, settlementStatus: null, status: 'pending' },
            { id: 3, date: '2026-01-06', merchant: 'ガソリンスタンド', amount: 5200, paymentMethod: 'クレジットカードA', payer: null, category: null, needsSettlement: null, settleWith: null, settlementRatio: null, settlementRatioType: null, myRatio: null, myAmount: null, settlementAmountValue: null, settlementStatus: null, status: 'pending' },
          ]);
        }
      } catch (error) {
        console.error('データ読み込みエラー:', error);
        setRecords([
          { id: 1, date: '2026-01-08', merchant: 'スーパーマーケット', amount: 3580, paymentMethod: 'クレジットカードA', payer: null, category: null, needsSettlement: null, settleWith: null, settlementRatio: null, settlementRatioType: null, myRatio: null, myAmount: null, settlementAmountValue: null, settlementStatus: null, status: 'pending' },
          { id: 2, date: '2026-01-07', merchant: 'レストランA', amount: 8500, paymentMethod: 'QR決済B', payer: null, category: null, needsSettlement: null, settleWith: null, settlementRatio: null, settlementRatioType: null, myRatio: null, myAmount: null, settlementAmountValue: null, settlementStatus: null, status: 'pending' },
          { id: 3, date: '2026-01-06', merchant: 'ガソリンスタンド', amount: 5200, paymentMethod: 'クレジットカードA', payer: null, category: null, needsSettlement: null, settleWith: null, settlementRatio: null, settlementRatioType: null, myRatio: null, myAmount: null, settlementAmountValue: null, settlementStatus: null, status: 'pending' },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // レコードが変更されるたびに保存
  useEffect(() => {
    if (!isLoading && records.length > 0) {
      try {
        localStorage.setItem('expense-records', JSON.stringify(records));
      } catch (error) {
        console.error('データ保存エラー:', error);
      }
    }
  }, [records, isLoading]);

  const pendingRecords = records.filter(r => r.status === 'pending');
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

  const settleSelectedRecords = () => {
    if (selectedRecords.length === 0) {
      alert('精算するレコードを選択してください');
      return;
    }

    const updatedRecords = records.map(r => {
      if (selectedRecords.includes(r.id)) {
        return {
          ...r,
          settlementStatus: 'settled'
        };
      }
      return r;
    });
    setRecords(updatedRecords);
    setSelectedRecords([]);
  };

  const settleAllWithPerson = (person) => {
    const updatedRecords = records.map(r => {
      if (r.settleWith === person && r.settlementStatus === 'unsettled') {
        return {
          ...r,
          settlementStatus: 'settled'
        };
      }
      return r;
    });
    setRecords(updatedRecords);
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

  const saveEditedRecord = (updatedData) => {
    const updatedRecords = records.map(r => {
      if (r.id === editingRecord.id) {
        return {
          ...r,
          ...updatedData
        };
      }
      return r;
    });
    setRecords(updatedRecords);
    closeEditModal();
  };

  const EditModal = ({ record, onClose, onSave }) => {
    const [editPayer, setEditPayer] = useState(record.payer);
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
        payer: editPayer,
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
                <label className="block text-sm font-semibold text-gray-700 mb-3">入力者</label>
                <div className="grid grid-cols-2 gap-2">
                  {settlementPeople.map(person => (
                    <button
                      key={person}
                      type="button"
                      onClick={() => setEditPayer(person)}
                      className={`py-3 px-4 rounded-lg border-2 transition-all ${
                        editPayer === person
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {person}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">カテゴリ</label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditCategory(cat)}
                      className={`py-3 px-4 rounded-lg border-2 transition-all ${
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
                      {settlementPeople.filter(p => p !== editPayer).map(person => (
                        <button
                          key={person}
                          type="button"
                          onClick={() => setEditSettleWith(person)}
                          className={`py-3 px-4 rounded-lg border-2 transition-all ${
                            editSettleWith === person
                              ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                        >
                          {person}
                        </button>
                      ))}
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

  const handleSave = () => {
    if (!payer || !category || !needsSettlement) {
      alert('入力者、カテゴリ、精算有無を選択してください');
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

    const updatedRecords = records.map(r => {
      if (r.id === currentRecord.id) {
        return {
          ...r,
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
          status: 'closed'
        };
      }
      return r;
    });

    setRecords(updatedRecords);
    setPayer('');
    setCategory('');
    setNeedsSettlement('');
    setSettleWith('');
    setSettlementRatioType('');
    setMyRatio('');
    setMyAmount('');
  };

  if (!currentRecord && activeTab === 'classify') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">家計簿分類</h1>

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
                  📊 Google Sheetsから取り込む
                </>
              )}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('classify')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white"
              >
                <div className="text-sm">分類</div>
                <div className="text-xs mt-1">未処理: 0件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settlement')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600"
              >
                <div className="text-sm">精算管理</div>
                <div className="text-xs mt-1">未精算: {unsettledRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600"
              >
                <div className="text-sm">履歴</div>
                <div className="text-xs mt-1">処理済み: {closedRecords.length}件</div>
              </button>
            </div>
          </div>
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
            <h1 className="text-3xl font-bold text-gray-800 mb-4">家計簿分類</h1>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('classify')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">分類</div>
                <div className="text-xs mt-1">未処理: {pendingRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settlement')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white"
              >
                <div className="text-sm">精算管理</div>
                <div className="text-xs mt-1">未精算: {unsettledRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">履歴</div>
                <div className="text-xs mt-1">処理済み: {closedRecords.length}件</div>
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
                <h2 className="text-xl font-bold text-gray-800">未精算レコード一覧</h2>
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

  if (activeTab === 'history') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-2xl mx-auto pt-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">家計簿分類</h1>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('classify')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">分類</div>
                <div className="text-xs mt-1">未処理: {pendingRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settlement')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                <div className="text-sm">精算管理</div>
                <div className="text-xs mt-1">未精算: {unsettledRecords.length}件</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white"
              >
                <div className="text-sm">履歴</div>
                <div className="text-xs mt-1">処理済み: {closedRecords.length}件</div>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">家計簿分類</h1>

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
                📊 Google Sheetsから取り込む
              </>
            )}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('classify')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold bg-indigo-600 text-white"
            >
              <div className="text-sm">分類</div>
              <div className="text-xs mt-1">未処理: {pendingRecords.length}件</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settlement')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              <div className="text-sm">精算管理</div>
              <div className="text-xs mt-1">未精算: {unsettledRecords.length}件</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className="flex-1 py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              <div className="text-sm">履歴</div>
              <div className="text-xs mt-1">処理済み: {closedRecords.length}件</div>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              <span className="text-sm font-semibold text-indigo-600">{currentRecord.paymentMethod}</span>
            </div>
            <div className="text-sm text-gray-500 mb-1">{currentRecord.date}</div>
            <div className="text-2xl font-bold text-gray-800 mb-1">{currentRecord.merchant}</div>
            <div className="text-3xl font-bold text-indigo-600">¥{currentRecord.amount.toLocaleString()}</div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              入力者 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {settlementPeople.map(person => (
                <button
                  key={person}
                  type="button"
                  onClick={() => setPayer(person)}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    payer === person
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {person}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              カテゴリ <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    category === cat
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              精算有無 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setNeedsSettlement('yes');
                  setSettleWith('');
                }}
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
                onClick={() => {
                  setNeedsSettlement('no');
                  setSettleWith('');
                }}
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

          {needsSettlement === 'yes' && (
            <>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  精算相手 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {settlementPeople.filter(p => p !== payer).map(person => (
                    <button
                      key={person}
                      type="button"
                      onClick={() => setSettleWith(person)}
                      className={`py-3 px-4 rounded-lg border-2 transition-all ${
                        settleWith === person
                          ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {person}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  精算方法 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSettlementRatioType('full');
                      setMyRatio('');
                      setMyAmount('');
                    }}
                    className={`w-full py-3 px-4 rounded-lg border-2 transition-all text-left ${
                      settlementRatioType === 'full'
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
                      setSettlementRatioType('half');
                      setMyRatio('');
                      setMyAmount('');
                    }}
                    className={`w-full py-3 px-4 rounded-lg border-2 transition-all text-left ${
                      settlementRatioType === 'half'
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
                      setSettlementRatioType('ratio');
                      setMyAmount('');
                    }}
                    className={`w-full py-3 px-4 rounded-lg border-2 transition-all text-left ${
                      settlementRatioType === 'ratio'
                        ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <span className="font-semibold">比率</span>
                    <span className="text-sm ml-2 text-gray-500">(割合で指定)</span>
                  </button>

                  {settlementRatioType === 'ratio' && (
                    <div className="bg-teal-50 p-4 rounded-lg border-2 border-teal-200">
                      <div className="mb-3">
                        <label className="text-sm font-semibold text-gray-700 block mb-2">
                          自分の支払い割合 (10分の{myRatio || '?'})
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setMyRatio(num.toString())}
                              className={`py-3 px-2 rounded-lg border-2 font-semibold transition-all ${
                                myRatio === num.toString()
                                  ? 'border-teal-600 bg-teal-600 text-white'
                                  : 'border-teal-300 bg-white text-teal-700 hover:bg-teal-100'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>
                      {myRatio && (
                        <div className="mt-3 p-3 bg-white rounded-lg">
                          <div className="flex justify-between items-center text-sm">
                            <div>
                              <div className="text-gray-600">自分の支払い</div>
                              <div className="text-lg font-bold text-gray-800">
                                ¥{Math.round((currentRecord.amount * parseInt(myRatio)) / 10).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-gray-400">→</div>
                            <div className="text-right">
                              <div className="text-gray-600">相手の支払い</div>
                              <div className="text-lg font-bold text-teal-600">
                                ¥{Math.round((currentRecord.amount * (10 - parseInt(myRatio))) / 10).toLocaleString()}
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
                      setSettlementRatioType('amount');
                      setMyRatio('');
                    }}
                    className={`w-full py-3 px-4 rounded-lg border-2 transition-all text-left ${
                      settlementRatioType === 'amount'
                        ? 'border-teal-500 bg-teal-50 text-teal-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <span className="font-semibold">金額</span>
                    <span className="text-sm ml-2 text-gray-500">(金額で指定)</span>
                  </button>

                  {settlementRatioType === 'amount' && (
                    <div className="bg-teal-50 p-4 rounded-lg border-2 border-teal-200">
                      <label className="text-sm font-semibold text-gray-700 block mb-2">
                        自分の支払い金額
                      </label>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg font-bold text-gray-700">¥</span>
                        <input
                          type="number"
                          value={myAmount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (val <= currentRecord.amount) {
                              setMyAmount(e.target.value);
                            }
                          }}
                          placeholder="0"
                          min="0"
                          max={currentRecord.amount}
                          className="flex-1 px-4 py-3 border-2 border-teal-500 rounded-lg focus:outline-none text-lg font-semibold"
                        />
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {[1000, 2000, 3000, 5000].map(amount => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => {
                              const newAmount = (parseInt(myAmount) || 0) + amount;
                              if (newAmount <= currentRecord.amount) {
                                setMyAmount(newAmount.toString());
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
                          onClick={() => setMyAmount('0')}
                          className="py-2 px-3 bg-white border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-all text-sm"
                        >
                          クリア
                        </button>
                        <button
                          type="button"
                          onClick={() => setMyAmount(currentRecord.amount.toString())}
                          className="py-2 px-3 bg-white border-2 border-teal-300 rounded-lg text-teal-700 font-semibold hover:bg-teal-100 transition-all text-sm"
                        >
                          全額
                        </button>
                      </div>
                      {myAmount && (
                        <div className="mt-3 p-3 bg-white rounded-lg">
                          <div className="flex justify-between items-center text-sm">
                            <div>
                              <div className="text-gray-600">自分の支払い</div>
                              <div className="text-lg font-bold text-gray-800">
                                ¥{parseInt(myAmount).toLocaleString()}
                              </div>
                            </div>
                            <div className="text-gray-400">→</div>
                            <div className="text-right">
                              <div className="text-gray-600">相手の支払い</div>
                              <div className="text-lg font-bold text-teal-600">
                                ¥{(currentRecord.amount - parseInt(myAmount)).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            保存して次へ
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpenseClassifier;
