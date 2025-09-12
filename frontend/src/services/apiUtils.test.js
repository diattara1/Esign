import axios from 'axios';
import { api, setLogoutCallback, setErrorCallback, clearCSRFToken } from './apiUtils';

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

describe('network error handling', () => {
  const originalAdapter = api.defaults.adapter;

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  test('invokes global error callback on network error', async () => {
    const errorCb = jest.fn();
    setErrorCallback(errorCb);

    api.defaults.adapter = () => Promise.reject({ request: {} });

    await expect(api.get('/whatever')).rejects.toBeDefined();
    expect(errorCb).toHaveBeenCalled();
  });
});

describe('CSRF token handling', () => {
  const originalAdapter = api.defaults.adapter;

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    clearCSRFToken();
  });

  test('retrieves new CSRF token after clearing', async () => {
    document.cookie = 'csrftoken=old';
    let capturedConfig;
    api.defaults.adapter = config => {
      capturedConfig = config;
      return Promise.resolve({ data: {}, status: 200, config });
    };

    await api.post('/test');
    expect(capturedConfig.headers['X-CSRFToken']).toBe('old');

    document.cookie = 'csrftoken=new';
    clearCSRFToken();

    await api.post('/test');
    expect(capturedConfig.headers['X-CSRFToken']).toBe('new');
  });
});
