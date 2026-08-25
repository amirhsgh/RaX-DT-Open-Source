// Must be the first import: ES imports run in source order, and this
// installs the error handlers that stop the dev-server overlay escalating a
// benign ResizeObserver notice into a full-screen fatal error.
import './suppressResizeObserverError';

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Debug NGL
console.log('Starting NGL debug...');
import('./debug-ngl.js');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);