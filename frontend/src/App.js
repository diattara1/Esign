import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';

import DashboardSignature from './pages/DashboardSignature';
import DocumentDetail from './pages/DocumentDetail';
import DocumentSign from './pages/DocumentSign';
import DocumentUpload from './pages/DocumentUpload';
import DocumentWorkflow from './pages/DocumentWorkflow';
import EnvelopeSent from './pages/EnvelopeSent';
import SignatureConfirmation from './pages/SignatureConfirmation';
import SignatureLayout from './pages/SignatureLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PasswordResetPage from './pages/PasswordResetPage';
import NotificationSettings from './pages/NotificationSettings';
import ProfilePage from './pages/ProfilePage';
import SelfSignWizard from './pages/SelfSignWizard';
import BulkSignSameWizard from './pages/BulkSignSameWizard';
import SentEnvelopes from './components/SentEnvelopes';
import CompletedEnvelopes from './components/CompletedEnvelopes';
import ActionRequiredEnvelopes from './components/ActionRequiredEnvelopes';
import DraftEnvelopes from './components/DraftEnvelopes';
import DeletedEnvelopes from './components/DeletedEnvelopes';
import MainLayout from './layouts/MainLayout';

import { useAuth } from './AuthContext';
import { setLogoutCallback } from './services/apiUtils';

const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

const App = () => {
  const { isLoading, handleTokenExpiry } = useAuth();

  // Configurer le callback de déconnexion pour apiUtils
  useEffect(() => {
    setLogoutCallback(handleTokenExpiry);
  }, [handleTokenExpiry]);

  // Afficher le spinner pendant le chargement de l'authentification
  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Routes>
      {/* ROUTES PUBLIQUES - À PLACER EN PREMIER ET DANS LE BON ORDRE */}
      
      {/* LOGIN */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/password-reset" element={<PasswordResetPage />} />
      {/* Signature invitée avec token - ROUTE PUBLIQUE */}
      <Route path="/sign/:id" element={<DocumentSign />} />
      
      {/* Page de confirmation - PUBLIQUE */}
      <Route path="/signature/success" element={<SignatureConfirmation />} />

      {/* ROUTES PROTÉGÉES - Toutes les routes nécessitant auth */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout><Outlet /></MainLayout>}>
          <Route path="/dashboard" element={<DashboardSignature />} />
          
          {/* Routes de signature */}
          <Route path="/signature/self-sign" element={<SelfSignWizard />} />
          <Route path="/signature/bulk-same" element={<BulkSignSameWizard />} />
          
          <Route path="/signature/upload" element={<DocumentUpload />} />
          <Route path="/signature/detail/:id" element={<DocumentDetail />} />
          <Route path="/signature/workflow/:id" element={<DocumentWorkflow />} />
          <Route path="/signature/sent/:id" element={<EnvelopeSent />} />
          <Route path="/signature/envelopes/:id/sign" element={<DocumentSign />} />
          <Route path="/signature/sign/:id" element={<DocumentSign />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/profile" element={<ProfilePage />} />
          
          {/* SignatureLayout et ses sous-pages */}
          <Route path="signature" element={<SignatureLayout />}>
            <Route path="envelopes/sent" element={<SentEnvelopes />} />
            <Route path="envelopes/completed" element={<CompletedEnvelopes />} />
            <Route path="envelopes/action-required" element={<ActionRequiredEnvelopes />} />
            <Route path="envelopes/drafts" element={<DraftEnvelopes />} />
            <Route path="envelopes/deleted" element={<DeletedEnvelopes />} />
          </Route>
        </Route>
      </Route>

      {/* Redirection par défaut - À PLACER EN DERNIER */}
      <Route path="/" element={<Navigate to="/signature" replace />} />
      <Route path="*" element={<Navigate to="/signature" replace />} />
    </Routes>
  );
};

export default App;