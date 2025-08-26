import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { setErrorCallback } from './services/apiUtils';

const ErrorContext = createContext({ notifyError: () => {} });

export const ErrorProvider = ({ children }) => {
  const throttled = useRef(false);

  const notifyError = useCallback((message) => {
    if (throttled.current) return;
    toast.error(message);
    throttled.current = true;
    setTimeout(() => {
      throttled.current = false;
    }, 3000);
  }, []);

  useEffect(() => {
    setErrorCallback(notifyError);
  }, [notifyError]);

  return (
    <ErrorContext.Provider value={{ notifyError }}>
      {children}
    </ErrorContext.Provider>
  );
};

export const useError = () => useContext(ErrorContext);

export default ErrorContext;
