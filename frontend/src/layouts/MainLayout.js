import React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import SignatureNavbar from '../components/SignatureNavbar';

const MainLayout = ({ children }) => {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isGuestSignaturePage =
    location.pathname.startsWith('/sign/') || location.pathname.includes('/sign') && searchParams.get('token');

  return (
    <div>
      {!isGuestSignaturePage && <SignatureNavbar />}
      <div className={isGuestSignaturePage ? '' : 'pt-10'}>
        {children}
      </div>
    </div>
  );
};

export default MainLayout;
