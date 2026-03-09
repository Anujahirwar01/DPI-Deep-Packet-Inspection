const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      // Extended timeouts so large PCAP uploads don't get cut off
      proxyTimeout: 120000,  // 2 minutes
      timeout: 120000,
      onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Backend unreachable. Is the server running on port 5000?' });
        }
      },
    })
  );
};
