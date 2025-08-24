import axios from 'axios';
import { api, setLogoutCallback } from './apiUtils';

describe('refresh failure handling', () => {
  const originalAdapter = api.defaults.adapter;

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  test('redirects to /login when refresh fails', async () => {
    const navigate = jest.fn();
    setLogoutCallback(() => navigate('/login'));

    // Simulate a request returning 401
    api.defaults.adapter = () =>
      Promise.reject({
        response: { status: 401, config: { url: '/protected' } },
      });

    // Simulate refresh token failure
    jest.spyOn(axios, 'post').mockImplementation((url) => {
      if (url.includes('/api/token/refresh/')) {
        return Promise.reject(new Error('Refresh failed'));
      }
      return Promise.resolve({});
    });

    await expect(api.get('/protected')).rejects.toBeDefined();

    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
