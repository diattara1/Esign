// src/pages/NotFound.js

import React from 'react';
import usePageTitleFocus from '../utils/usePageTitleFocus';
import { Link } from 'react-router-dom';

const NotFound = () => {
  const titleRef = usePageTitleFocus();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <h1 ref={titleRef} tabIndex={-1} className="text-4xl font-bold text-gray-800 mb-4">404 - Page non trouvée</h1>
      <p className="text-gray-600 mb-6">La page que vous cherchez n'existe pas.</p>
      <Link to="/" className="text-blue-600 hover:text-blue-800 underline">
        Retour à l'accueil
      </Link>
    </div>
  );
};

export default NotFound;
