import React, { useEffect, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';

const DashboardSignature = React.lazy(() => import('./pages/DashboardSignature'));
const DocumentDetail = React.lazy(() => import('./pages/DocumentDetail'));
const DocumentSign = React.lazy(() => import('./pages/DocumentSign'));
const DocumentUpload = React.lazy(() => import('./pages/DocumentUpload'));
const DocumentWorkflow = React.lazy(() => import('./pages/DocumentWorkflow'));
const EnvelopeSent = React.lazy(() => import('./pages/EnvelopeSent'));
const SignatureConfirmation = React.lazy(() => import('./pages/SignatureConfirmation'));
const GuestSignatureConfirmation = React.lazy(() => import('./pages/GuestSignatureConfirmation'));
const SignatureLayout = React.lazy(() => import('./pages/SignatureLayout'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const PasswordResetPage = React.lazy(() => import('./pages/PasswordResetPage'));
const NotificationSettings = React.lazy(() => import('./pages/NotificationSettings'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const SelfSignWizard = React.lazy(() => import('./pages/SelfSignWizard'));
const BulkSignSameWizard = React.lazy(() => import('./pages/BulkSignSameWizard'));
const SavedSignaturesPage = React.lazy(() => import('./pages/SavedSignaturesPage'));
const SentEnvelopes = React.lazy(() => import('./components/SentEnvelopes'));
const CompletedEnvelopes = React.lazy(() => import('./components/CompletedEnvelopes'));
const ActionRequiredEnvelopes = React.lazy(() => import('./components/ActionRequiredEnvelopes'));
const DraftEnvelopes = React.lazy(() => import('./components/DraftEnvelopes'));
const DeletedEnvelopes = React.lazy(() => import('./components/DeletedEnvelopes'));
const MainLayout = React.lazy(() => import('./layouts/MainLayout'));
const QrVerifyPage = React.lazy(() => import('./pages/QrVerifyPage'));
const NotFound = React.lazy(() => import('./pages/NotFound'));
import { useAuth } from './AuthContext';
import { toast } from 'react-toastify';

const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center" data-testid="loading-spinner">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

const App = () => {
  const { isLoading } = useAuth();
  useEffect(() => {
    toast.success('Toast de test');
  }, []);

  // Afficher le spinner pendant le chargement de l'authentification
  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
      {/* ROUTES PUBLIQUES - À PLACER EN PREMIER ET DANS LE BON ORDRE */}
      
      {/* LOGIN */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/password-reset" element={<PasswordResetPage />} />
      <Route path="/verify/:uuid" element={<QrVerifyPage />} />
      {/* Signature invitée avec token - ROUTE PUBLIQUE */}
      <Route path="/sign/:id" element={<DocumentSign />} />
      
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
          <Route path="/signature/envelopes/:id/sign" element={<DocumentSign />} />
          <Route path="/signature/sign/:id" element={<DocumentSign />} />
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