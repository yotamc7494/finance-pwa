// src/App.tsx
import React from 'react';
import { TransactionsView } from './features/transactions/TransactionsView';
import './index.css';

// Root component with premium glassmorphism background and RTL layout
export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-800 to-slate-700 text-slate-100" dir="rtl">
      <TransactionsView />
    </div>
  );
};

export default App;
