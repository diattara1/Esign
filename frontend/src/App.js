
import React, { Suspense } from 'react';
import { useAuth } from './AuthContext';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import LoadingSkeleton from './components/LoadingSkeleton';
import GuestRoute from './GuestRoute';

// Pages chargées directement (légères)
import DashboardSignature from './pages/DashboardSignature';
import SignatureConfirmation from './pages/SignatureConfirmation';
import GuestSignatureConfirmation from './pages/GuestSignatureConfirmation';
import SignatureLayout from './pages/SignatureLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PasswordResetPage from './pages/PasswordResetPage';
import ResetPasswordConfirmPage from './pages/ResetPasswordConfirmPage';
import SentEnvelopes from './components/SentEnvelopes';
import CompletedEnvelopes from './components/CompletedEnvelopes';
import ActionRequiredEnvelopes from './components/ActionRequiredEnvelopes';
import DraftEnvelopes from './components/DraftEnvelopes';
import DeletedEnvelopes from './components/DeletedEnvelopes';
import MainLayout from './layouts/MainLayout';
import QrVerifyPage from './pages/QrVerifyPage';
import NotFound from './pages/NotFound';

// Pages lourdes chargées à la demande
const DocumentDetail = React.lazy(() => import('./pages/DocumentDetail'));
const DocumentSign = React.lazy(() => import('./pages/DocumentSign'));
const DocumentUpload = React.lazy(() => import('./pages/DocumentUpload'));
const DocumentWorkflow = React.lazy(() => import('./pages/DocumentWorkflow'));
const EnvelopeSent = React.lazy(() => import('./pages/EnvelopeSent'));
const NotificationSettings = React.lazy(() => import('./pages/NotificationSettings'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const SelfSignWizard = React.lazy(() => import('./pages/SelfSignWizard'));
const BulkSignSameWizard = React.lazy(() => import('./pages/BulkSignSameWizard'));
const SavedSignaturesPage = React.lazy(() => import('./pages/SavedSignaturesPage'));


const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;

};

const App = () => {
  const { isLoading } = useAuth();
 

  // Afficher le skeleton pendant le chargement de l'authentification
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <Suspense fallback={<LoadingSkeleton />}> 
      <Routes>
      {/* ROUTES PUBLIQUES - À PLACER EN PREMIER ET DANS LE BON ORDRE */}
      
      {/* LOGIN */}
      <Route path="/login" element={<LoginPage />} />
      <Route element={<GuestRoute />}>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/password-reset" element={<PasswordResetPage />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPasswordConfirmPage />} />
      </Route>
      <Route path="/verify/:uuid" element={<QrVerifyPage />} />
      {/* Signature invitée avec token - ROUTE PUBLIQUE */}
      <Route path="/sign/:publicId" element={<DocumentSign />} />
      
      {/* Page de confirmation - PUBLIQUE */}
      <Route path="/signature/success" element={<SignatureConfirmation />} />
      <Route path="/signature/guest/success" element={<GuestSignatureConfirmation />} />


      {/* ROUTES PROTÉGÉES - Toutes les routes nécessitant auth */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout><Outlet /></MainLayout>}>
          <Route path="/dashboard" element={<DashboardSignature />} />
          
          {/* Routes de signature */}
          <Route path="/signature/self-sign" element={<SelfSignWizard />} />
          <Route path="/signature/bulk-same" element={<BulkSignSameWizard />} />
          <Route path="/signature/saved-signatures" element={<SavedSignaturesPage />} />
          
          <Route path="/signature/upload" element={<DocumentUpload />} />
          <Route path="/signature/detail/:id" element={<DocumentDetail />} />
          <Route path="/signature/workflow/:id" element={<DocumentWorkflow />} />
          <Route path="/signature/sent/:id" element={<EnvelopeSent />} />
          <Route path="/signature/envelopes/:publicId/sign" element={<DocumentSign />} />
          <Route path="/signature/sign/:publicId" element={<DocumentSign />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/profile" element={<ProfilePage />} />
          
          {/* SignatureLayout et ses sous-pages */}
          <Route path="signature" element={<SignatureLayout />}>
          <Route index element={<Navigate to="envelopes/sent" replace />} />
            <Route path="envelopes/sent" element={<SentEnvelopes />} />
            <Route path="envelopes/completed" element={<CompletedEnvelopes />} />
            <Route path="envelopes/action-required" element={<ActionRequiredEnvelopes />} />
            <Route path="envelopes/drafts" element={<DraftEnvelopes />} />
            <Route path="envelopes/deleted" element={<DeletedEnvelopes />} />
          </Route>
        </Route>
      </Route>

      {/* Redirection par défaut - À PLACER EN DERNIER */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
       <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

export default App;