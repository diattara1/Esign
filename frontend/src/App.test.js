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
  '/sign/123e4567-e89b-12d3-a456-426614174000',
  '/signature/success',
  '/signature/guest/success',
  '/dashboard',
  '/signature/self-sign',
  '/signature/bulk-same',
  '/signature/saved-signatures',
  '/signature/upload',
  '/signature/detail/123e4567-e89b-12d3-a456-426614174000',
  '/signature/workflow/123e4567-e89b-12d3-a456-426614174000',
  '/signature/sent/123e4567-e89b-12d3-a456-426614174000',
  '/signature/envelopes/123e4567-e89b-12d3-a456-426614174000/sign',
  '/signature/sign/123e4567-e89b-12d3-a456-426614174000',
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
