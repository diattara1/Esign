import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

jest.mock('./AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false })
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn() }
}));

const docUuid = '123e4567-e89b-12d3-a456-426614174000';

const routes = [
  '/login',
  '/register',
  '/password-reset',
  '/verify/uuid',
  `/sign/${docUuid}`,
  '/signature/success',
  '/signature/guest/success',
  '/dashboard',
  '/signature/self-sign',
  '/signature/bulk-same',
  '/signature/saved-signatures',
  '/signature/upload',
  `/signature/detail/${docUuid}`,
  `/signature/workflow/${docUuid}`,
  `/signature/sent/${docUuid}`,
  `/signature/envelopes/${docUuid}/sign`,
  `/signature/sign/${docUuid}`,
  '/settings/notifications',
  '/profile',
  '/signature/envelopes/sent',
  '/signature/envelopes/completed',
  '/signature/envelopes/action-required',
  '/signature/envelopes/drafts',
  '/signature/envelopes/deleted',
  '/unknown'
];

test.each(routes)('displays fallback while loading %s', (route) => {
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
  expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
});
