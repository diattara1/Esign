import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

jest.mock('./AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false })
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn() }
}));

const routes = [
  '/login',
  '/register',
  '/password-reset',
  '/verify/uuid',
  '/sign/1',
  '/signature/success',
  '/signature/guest/success',
  '/dashboard',
  '/signature/self-sign',
  '/signature/bulk-same',
  '/signature/saved-signatures',
  '/signature/upload',
  '/signature/detail/1',
  '/signature/workflow/1',
  '/signature/sent/1',
  '/signature/envelopes/1/sign',
  '/signature/sign/1',
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
