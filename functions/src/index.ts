import { onRequest } from 'firebase-functions/v2/https'

// Only proxy requests to official ChurchTools SaaS hostnames.
// Self-hosted CT installations end in any domain, but SaaS always uses .church.tools.
const CT_HOSTNAME_SUFFIX = '.church.tools'

export const ctProxy = onRequest(
  {
    cors: true,           // firebase-functions handles CORS preflight automatically
    region: 'europe-west1',
    timeoutSeconds: 30,
    minInstances: 0,
    maxInstances: 10,
  },
  async (req, res) => {
    // --- Validate target -------------------------------------------------------
    const ctBaseUrl = (req.headers['x-ct-base-url'] as string | undefined)?.trim()
    if (!ctBaseUrl) {
      res.status(400).json({ error: 'Missing X-CT-Base-URL header' })
      return
    }
    let targetHost: string
    try {
      targetHost = new URL(ctBaseUrl).hostname
    } catch {
      res.status(400).json({ error: 'Invalid X-CT-Base-URL' })
      return
    }
    if (!targetHost.endsWith(CT_HOSTNAME_SUFFIX)) {
      res.status(403).json({ error: 'Target must be a *.church.tools host' })
      return
    }

    // --- Build target URL -------------------------------------------------------
    // Firebase Hosting rewrite: /ct-api/songs → function receives path /ct-api/songs
    const path = req.path.replace(/^\/ct-api/, '') || '/'
    const qs = req.url.includes('?') ? `?${req.url.split('?')[1]}` : ''
    const targetUrl = `${ctBaseUrl.replace(/\/+$/, '')}/api${path}${qs}`

    // --- Proxy ------------------------------------------------------------------
    try {
      const ctRes = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': (req.headers.authorization as string) || '',
        },
        // Body only for mutating methods; req.body is already parsed by express
        body: ['POST', 'PUT', 'PATCH'].includes(req.method)
          ? JSON.stringify(req.body)
          : undefined,
      })

      const text = await ctRes.text()
      res.status(ctRes.status).set('Content-Type', 'application/json').send(text)
    } catch (err) {
      res.status(502).json({ error: 'Proxy error', detail: String(err) })
    }
  },
)
