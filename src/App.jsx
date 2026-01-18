import { AuthProvider, useAuth } from './contexts/AuthContext';
import ExpenseClassifier from './components/ExpenseClassifier';
import Auth from './components/Auth';

function AppContent() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Auth />;
  }

  return <ExpenseClassifier />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
