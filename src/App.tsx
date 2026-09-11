/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Home, Compass, Target, User } from 'lucide-react';
import HomePage from './pages/Home';
import ExplorePage from './pages/Explore';
import QuestPage from './pages/Quest';
import MyPage from './pages/MyPage';
import SakeDetail from './pages/SakeDetail';
import NewReview from './pages/NewReview';
import NewSake from './pages/NewSake';

function Navigation() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-50">
      <div className="flex justify-around items-center h-16">
        <Link to="/" className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-indigo-600">
          <Home className="w-6 h-6" />
          <span className="text-xs mt-1">ホーム</span>
        </Link>
        <Link to="/explore" className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-indigo-600">
          <Compass className="w-6 h-6" />
          <span className="text-xs mt-1">探す</span>
        </Link>
        <Link to="/quests" className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-indigo-600">
          <Target className="w-6 h-6" />
          <span className="text-xs mt-1">クエスト</span>
        </Link>
        <Link to="/mypage" className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-indigo-600">
          <User className="w-6 h-6" />
          <span className="text-xs mt-1">マイページ</span>
        </Link>
      </div>
    </nav>
  );
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signInWithGoogle } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md w-full bg-white rounded-2xl shadow-sm p-8 border border-slate-100">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Compass className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">日本酒探求SNS</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">
            日本酒の美味しい飲み方をみんなで探求し、最高のペアリングを共有しましょう。
          </p>
          <button
            onClick={signInWithGoogle}
            className="w-full bg-slate-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {children}
      <Navigation />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <MainLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/quests" element={<QuestPage />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/sake/new" element={<NewSake />} />
            <Route path="/sake/:id" element={<SakeDetail />} />
            <Route path="/sake/:id/review" element={<NewReview />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </AuthProvider>
  );
}
