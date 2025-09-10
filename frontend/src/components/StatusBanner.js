import React from 'react';
import { useLocation } from 'react-router-dom';
import Alert from './Alert';

const StatusBanner = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const activated = params.get('activated');
  const reset = params.get('reset');

  if (activated === '1') {
    return (
      <Alert type="success">
        Compte activé avec succès. Vous pouvez maintenant vous connecter.
      </Alert>
    );
  }

  if (activated === '0') {
    return (
      <Alert type="error">
        Lien d'activation invalide. Veuillez vérifier votre lien ou en demander un nouveau.
      </Alert>
    );
  }

  if (reset === '1') {
    return (
      <Alert type="success">
        Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.
      </Alert>
    );
  }

  return null;
};

export default StatusBanner;
