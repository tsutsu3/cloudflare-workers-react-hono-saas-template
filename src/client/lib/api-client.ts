import axios from 'axios';

const API_BASE_URL = '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to sign-in for 401 errors on non-auth endpoints
    // Auth endpoints handle their own error display
    const isAuthEndpoint = error.config?.url?.startsWith('/auth/');
    const isAlreadyOnAuthPage = window.location.pathname.startsWith('/sign-in') ||
      window.location.pathname.startsWith('/sign-up') ||
      window.location.pathname.startsWith('/forgot-password') ||
      window.location.pathname.startsWith('/reset-password');

    if (error.response?.status === 401 && !isAuthEndpoint && !isAlreadyOnAuthPage) {
      window.location.href = '/sign-in';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
