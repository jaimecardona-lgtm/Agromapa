import axios from 'axios';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  health: {
    check: () => apiClient.get('/api/health'),
  },
};
