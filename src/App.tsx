/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Home, FlaskRound, Compass, User } from 'lucide-react';
import Header from './components/Header';

const HomePage = lazy(() => import('./pages/Home'));
const ExplorePage = lazy(() => import('./pages/Explore'));
const QuestPage = lazy(() => import('./pages/Quest'));
const MyPage = lazy(() => import('./pages/MyPage'));
const SakeDetail = lazy(() => import('./pages/SakeDetail'));
const NewReview = lazy(() => import('./pages/NewReview'));
const NewSake = lazy(() => import('./pages/NewSake'));
const NewQuest = lazy(() => import('./pages/NewQuest'));
const SettingsPage = lazy(() => import('./pages/Settings'));

function Navigation() {
  const location = useLocation();
  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  const linkClass = (path: string) =>
    `flex flex-col items-center justify-center w-full h-full transition-colors ${
      isActive(path) ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-50">
      <div className="flex justify-around items-center h-16">
        <Link to="/" className={linkClass('/')}>
          <Home className="w-6 h-6" />
          <span className="text-xs mt-1 font-medium">ホーム</span>
        </Link>
        <Link to="/explore" className={linkClass('/explore')}>
          <Compass className="w-6 h-6" />
          <span className="text-xs mt-1 font-medium">探す</span>
        </Link>
        <Link to="/quests" className={linkClass('/quests')}>
          <FlaskRound className="w-6 h-6" />
          <span className="text-xs mt-1 font-medium">クエスト</span>
        </Link>
        <Link to="/mypage" className={linkClass('/mypage')}>
          <User className="w-6 h-6" />
          <span className="text-xs mt-1 font-medium">マイページ</span>
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
            <FlaskRound className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">日本酒ペアリングラボ</h1>
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
      <Header />
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
          <Suspense
            fallback={
              <div className="min-h-[50vh] flex items-center justify-center text-slate-400 font-medium">
                読み込み中...
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/quests" element={<QuestPage />} />
              <Route path="/quests/new" element={<NewQuest />} />
              <Route path="/mypage" element={<MyPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/sake/new" element={<NewSake />} />
              <Route path="/sake/:id" element={<SakeDetail />} />
              <Route path="/sake/:id/review" element={<NewReview />} />
            </Routes>
          </Suspense>
        </MainLayout>
      </BrowserRouter>
    </AuthProvider>
  );
}
