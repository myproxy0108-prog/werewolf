const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const https = require('https');

const app = express();

// ==========================================
// 1. 設定：Cloudflare Workers クラスター配列
// ==========================================
// 作成した Workers の URL をここに並べます
const CF_WORKER_URLS = [
    "https://wolf.72016.workers.dev/",
    "https://wolf.myproxy0108.workers.dev/"
];

// ユーザーIPに基づくロードバランシング（セッション固定）
function getWorkerForUser(ip) {
    if (CF_WORKER_URLS.length === 0) {
        return "https://www.werewolfgame.jp"; // Worker未登録時のフォールバック
    }
    const cleanIp = (ip || '').split(',')[0].trim() || 'unknown';
    let hash = 0;
    for (let i = 0; i < cleanIp.length; i++) {
        hash = (hash << 5) - hash + cleanIp.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash) % CF_WORKER_URLS.length;
    return CF_WORKER_URLS[index];
}

// 【超重要】HTTP 421 Misdirected Request 防止用エージェント
// 異なる Worker ホスト間で TLS ソケットが不正再利用されるのを防ぎます
const proxyAgent = new https.Agent({ 
    keepAlive: false, 
    timeout: 60000 
});

// ==========================================
// 2. ヘルスチェック (Render モニタリング用)
// ==========================================
app.get('/healthz', (req, res) => res.status(200).send('OK'));

// ==========================================
// 3. メインプロキシ機能
// ==========================================
const proxyMiddleware = createProxyMiddleware({
    router: (req) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        return getWorkerForUser(ip);
    },
    changeOrigin: true, // SNI と Host ヘッダーをWorkerに自動一致させる
    ws: true, // WebSocket リアルタイム通信の有効化
    agent: proxyAgent,
    
    onProxyReq: (proxyReq, req, res) => {
        // Worker 側に Render 側のホスト名を伝え、ドメイン書き換えを行わせる
        const clientHost = req.get('host');
        if (clientHost) {
            proxyReq.setHeader('X-Forwarded-Host', clientHost);
        }
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        
        // 圧縮崩れ防止
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

// ==========================================
// 4. サーバー起動 ＆ WebSocket バインド
// ==========================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Werewolf Master Cluster Proxy running on port ${PORT}`);
});

// WebSocket アップグレードバインド
server.on('upgrade', (req, socket, head) => {
    proxyMiddleware.upgrade(req, socket, head);
});
