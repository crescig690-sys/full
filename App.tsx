import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminDashboard from './components/AdminDashboard';
import CheckoutPage from './components/CheckoutPage';
import LoginForm from './components/LoginForm';
import { AdminSettings } from './types';

const App: React.FC = () => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('admin_session') === 'true';
  });

  const [settings, setSettings] = useState<AdminSettings>(() => {
    const saved = localStorage.getItem('app_settings');
    return saved ? JSON.parse(saved) : { apiKey: '', adminPassword: 'admin' };
  });

  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  }, [settings]);

  const handleLogin = (password: string) => {
    if (password === settings.adminPassword) {
      setIsAdminAuthenticated(true);
      localStorage.setItem('admin_session', 'true');
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAdminAuthenticated(false);
    localStorage.removeItem('admin_session');
  };

  return (
    <HashRouter>
      <div className="min-h-screen bg-slate-50">
        <Routes>
          <Route 
            path="/admin" 
            element={
              isAdminAuthenticated ? (
                <AdminDashboard 
                  settings={settings} 
                  setSettings={setSettings} 
                  onLogout={handleLogout} 
                />
              ) : (
                <LoginForm onLogin={handleLogin} />
              )
            } 
          />
          <Route path="/checkout/:intentId" element={<CheckoutPage settings={settings} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
};

export default App;