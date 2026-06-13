import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BranchInventory from './pages/BranchInventory';
import Purchase from './pages/Purchase';
import Dispatch from './pages/Dispatch';
import Crushing from './pages/Crushing';
import PmmplRate from './pages/PmmplRate';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import StockAdjustment from './pages/StockAdjustment';

// Route Guard for Protected Pages
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f9f4]">
        <div className="w-8 h-8 border-2 border-indigo-500/35 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Layout for Authenticated Pages
const AppLayout = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f7f9f4]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<BranchInventory />} />
            <Route path="/raw-material" element={<BranchInventory />} />
            <Route path="/finished-good" element={<BranchInventory />} />
            <Route path="/branch/:branchName" element={<BranchInventory />} />
            <Route path="/finish-good/:branchName" element={<BranchInventory />} />
            <Route path="/purchase" element={<Purchase />} />
            <Route path="/dispatch" element={<Dispatch />} />
            <Route path="/crushing" element={<Crushing />} />
            <Route path="/pmmpl-rates" element={<PmmplRate />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/stock-adjustment" element={<StockAdjustment />} />
            <Route path="/settings" element={<Settings />} />
            {/* Fallback to Dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected ERP Application Routes */}
            <Route 
              path="/*" 
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
