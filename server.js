const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');

const app = express();
const TARGET_HOST = "www.werewolfgame.jp";
const TARGET_BASE = "https://" + TARGET_HOST;

// 421 エラー防止のためソケット再利用をオフ
const proxyAgent = new https.Agent({ 
    keepAlive: false, 
    timeout: 60000 
});

// ヘルスチェック
app.get('/healthz', (req, res) => res.status(200).send('OK'));

const proxyMiddleware = createProxyMiddleware({
    target: TARGET_BASE,
    changeOrigin: true,
    ws: true, // WebSocket 有効化
    agent: proxyAgent,
    
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('Host', TARGET_HOST);
        proxyReq.setHeader('Origin', TARGET_BASE);
        proxyReq.setHeader('Referer', TARGET_BASE + '/');
        
        const host = req.get('host');
        if (host) proxyReq.setHeader('X-Forwarded-Host', host);
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        proxyReq.setHeader('Accept-Encoding', 'identity');
    },
    
    onProxyRes: (proxyRes, req, res) => {
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-frame-options'];
        proxyRes.headers['access-control-allow-origin'] = '*';
        
        delete proxyRes.headers['content-length'];
        delete proxyRes.headers['content-encoding'];
    },
    
    logLevel: 'error'
});

app.use('/', proxyMiddleware);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`=== Werewolf Game Master Proxy running on port ${PORT} ===`);
});

// WebSocket バインド
server.on('upgrade', (req, socket, head) => {
    proxyMiddleware.upgrade(req, socket, head);
});
