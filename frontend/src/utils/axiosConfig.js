/**
 * Axios configuration for API requests
 * Handles base URL, CORS, and common headers
 */

import axios from 'axios';

// Create axios instance with default config
const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1',
  timeout: 300000, // 5 minutes for large file uploads
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies for CORS
});

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    // Log request for debugging
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);

    // Don't set Content-Type for FormData (browser will set it with boundary)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });

    // Handle specific error cases
    if (!error.response) {
      // Network error or CORS issue
      console.error('Network error or CORS issue - check if backend is running');
    } else if (error.response.status === 401) {
      // Unauthorized - redirect to login if needed
      console.warn('Unauthorized request - user may need to login');
    } else if (error.response.status === 500) {
      // Server error
      console.error('Server error:', error.response.data);
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
