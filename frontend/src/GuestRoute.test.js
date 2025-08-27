import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GuestRoute from './GuestRoute';
import { useAuth } from './AuthContext';

jest.mock('./AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('GuestRoute', () => {
  const routes = [
    { path: '/register', text: 'Register' },
    { path: '/password-reset', text: 'Password Reset' },
    { path: '/reset-password/uid/token', text: 'Reset Password' },
  ];

  const Dashboard = () => <div>Dashboard</div>;
  const Register = () => <div>Register</div>;
  const PasswordReset = () => <div>Password Reset</div>;
  const ResetPassword = () => <div>Reset Password</div>;

  test.each(routes)('redirects authenticated users from %s to /dashboard', ({ path }) => {
    useAuth.mockReturnValue({ isAuthenticated: true });
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/register" element={<Register />} />
            <Route path="/password-reset" element={<PasswordReset />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
          </Route>
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  test.each(routes)('allows guests to access %s', ({ path, text }) => {
    useAuth.mockReturnValue({ isAuthenticated: false });
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/register" element={<Register />} />
            <Route path="/password-reset" element={<PasswordReset />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
          </Route>
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
