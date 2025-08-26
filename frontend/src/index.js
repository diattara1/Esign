import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { pdfjs } from 'react-pdf';
import ErrorBoundary from './components/ErrorBoundary';
import { ErrorProvider } from './ErrorContext';
import './index.css';


pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <ErrorBoundary>
      <ErrorProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorProvider>
    </ErrorBoundary>
  </BrowserRouter>
);
