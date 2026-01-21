import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, AlertCircle, User } from 'lucide-react';

const Auth = () => {
  const [stage, setStage] = useState('quiz'); // 'quiz' or 'selectUser'
  const [answers, setAnswers] = useState(['', '', '']);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');

  const { login } = useAuth();

  // 正解
  const correctAnswers = ['1109', '0229', '0615'];

  // 問題のプール（ランダムに選ばれる）
  const questionPool = [
    '好きな数字4桁を入力してください',
    '記念日を4桁で入力してください（MMDD形式）',
    '誕生月と日を4桁で入力してください（MMDD形式）',
    '思い出の数字を4桁で入力してください',
    '大切な日を4桁で入力してください（MMDD形式）',
  ];

  // コンポーネント初期化時にランダムな問題を3つ選ぶ
  useEffect(() => {
    const shuffled = [...questionPool].sort(() => Math.random() - 0.5);
    setQuestions(shuffled.slice(0, 3));
  }, []);

  const handleQuizSubmit = (e) => {
    e.preventDefault();
    setError('');

    // 回答チェック
    const allCorrect = answers.every((answer, index) => answer === correctAnswers[index]);

    if (allCorrect) {
      setStage('selectUser');
    } else {
      setError('回答が正しくありません');
      setAnswers(['', '', '']);
    }
  };

  const handleUserLogin = async (userName) => {
    setLoading(true);
    setError('');

    try {
      // 固定のアカウント情報でログイン
      const email = userName === 'Seigo'
        ? 'seigo@example.com'
        : 'hanaka@example.com';
      const password = 'password123'; // 固定パスワード

      await login(email, password);
    } catch (err) {
      console.error('Authentication error:', err);
      setError('ログインに失敗しました');
      setStage('quiz');
      setAnswers(['', '', '']);
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'selectUser') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <User className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">ユーザー選択</h1>
            </div>
            <p className="text-gray-600">ログインするユーザーを選択してください</p>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={() => handleUserLogin('Seigo')}
              disabled={loading}
              className="w-full py-6 bg-blue-600 text-white rounded-xl font-semibold text-2xl hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? '処理中...' : 'Seigo'}
            </button>
            <button
              onClick={() => handleUserLogin('Hanaka')}
              disabled={loading}
              className="w-full py-6 bg-pink-600 text-white rounded-xl font-semibold text-2xl hover:bg-pink-700 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? '処理中...' : 'Hanaka'}
            </button>
          </div>

          <button
            onClick={() => {
              setStage('quiz');
              setAnswers(['', '', '']);
              setError('');
            }}
            className="mt-6 w-full py-2 text-gray-600 hover:text-gray-800 transition-colors text-sm"
          >
            ← 問題に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <LogIn className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">ログイン</h1>
          </div>
          <p className="text-gray-600">家計簿アプリ - Kakeibo</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleQuizSubmit} className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            以下の質問に答えてください
          </p>

          {questions.map((question, index) => (
            <div key={index}>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                問{index + 1}: {question} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={answers[index]}
                onChange={(e) => {
                  const newAnswers = [...answers];
                  newAnswers[index] = e.target.value;
                  setAnswers(newAnswers);
                }}
                placeholder="4桁の数字"
                maxLength={4}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
          >
            回答を送信
          </button>
        </form>
      </div>
    </div>
  );
};

export default Auth;

