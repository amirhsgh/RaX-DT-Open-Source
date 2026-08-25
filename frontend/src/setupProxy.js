const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy for PubChem API to avoid CORS issues
  app.use(
    '/api/pubchem',
    createProxyMiddleware({
      target: 'https://pubchem.ncbi.nlm.nih.gov',
      changeOrigin: true,
      secure: true,
      pathRewrite: {
        '^/api/pubchem': '/rest/pug', // rewrite path
      },
      headers: {
        'User-Agent': 'BioForge-Frontend/1.0',
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log('Proxying request to:', proxyReq.path);
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Proxy error occurred' });
      },
      logLevel: 'debug',
    })
  );
};