"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ctProxy = void 0;
const functions = require("firebase-functions/v1");
// Only proxy requests to official ChurchTools SaaS hostnames.
const CT_HOSTNAME_SUFFIX = '.church.tools';
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CT-Base-URL',
};
exports.ctProxy = functions
    .region('europe-west1')
    .runWith({ timeoutSeconds: 30 })
    .https.onRequest(async (req, res) => {
    // CORS preflight
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    // Validate target
    const ctBaseUrl = req.headers['x-ct-base-url']?.trim();
    if (!ctBaseUrl) {
        res.status(400).json({ error: 'Missing X-CT-Base-URL header' });
        return;
    }
    let targetHost;
    try {
        targetHost = new URL(ctBaseUrl).hostname;
    }
    catch {
        res.status(400).json({ error: 'Invalid X-CT-Base-URL' });
        return;
    }
    if (!targetHost.endsWith(CT_HOSTNAME_SUFFIX)) {
        res.status(403).json({ error: 'Target must be a *.church.tools host' });
        return;
    }
    // Build target URL — strip the /ct-api prefix the Hosting rewrite preserves
    const path = req.path.replace(/^\/ct-api/, '') || '/';
    const qs = req.url.includes('?') ? `?${req.url.split('?')[1]}` : '';
    const targetUrl = `${ctBaseUrl.replace(/\/+$/, '')}/api${path}${qs}`;
    // Proxy
    try {
        const ctRes = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization || '',
            },
            body: ['POST', 'PUT', 'PATCH'].includes(req.method)
                ? JSON.stringify(req.body)
                : undefined,
        });
        const text = await ctRes.text();
        res.status(ctRes.status).set('Content-Type', 'application/json').send(text);
    }
    catch (err) {
        res.status(502).json({ error: 'Proxy error', detail: String(err) });
    }
});
//# sourceMappingURL=index.js.map