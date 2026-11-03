/**
 * CLIMAWELL ORDERSENDER & COMMERCIAL HUB - LOCAL DEV SERVER
 * Server HTTP leggero senza dipendenze esterne per test su rete locale (LAN / Wi-Fi).
 * Supporta rewrite URL puliti (/commercial-hub, /offerta, ecc.) e accesso da tablet/smartphone.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SITE_DIR = path.resolve(__dirname, '../site');

// Caricamento opzionale da .env locale (senza esporre segreti su git)
for (const envPath of [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../.env')]) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const l of lines) {
      const match = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

// Usiamo 3000 come porta primaria (evita il conflitto con EDB Postgres su 8080)
const INITIAL_PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function createServer() {
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);

    // Gestione Endpoints API Brevo (Locale & Test)
    if (pathname.startsWith('/api/brevo/')) {
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', async () => {
        try {
          const body = bodyData ? JSON.parse(bodyData) : {};
          const apiKey = (body.apiKey || '').trim() || process.env.BREVO_API_KEY || '';

          if (pathname === '/api/brevo/test-connection') {
            console.log('[Brevo] Test connessione account con API Key...');
            const resp = await fetch('https://api.brevo.com/v3/account', {
              headers: {
                'api-key': apiKey,
                'accept': 'application/json'
              }
            });
            const data = await resp.json().catch(() => ({}));

            let senders = [];
            if (resp.ok) {
              const sendersResp = await fetch('https://api.brevo.com/v3/senders', {
                headers: { 'api-key': apiKey, 'accept': 'application/json' }
              });
              const sendersData = await sendersResp.json().catch(() => ({}));
              senders = sendersData.senders || [];
            }

            console.log('[Brevo] Risposta account:', resp.status, data?.email);
            res.writeHead(resp.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: resp.ok, status: resp.status, data, senders }));
            return;
          }

          if (pathname === '/api/brevo/templates') {
            console.log('[Brevo] Caricamento template da Brevo...');
            const resp = await fetch('https://api.brevo.com/v3/smtp/templates', {
              headers: {
                'api-key': apiKey,
                'accept': 'application/json'
              }
            });
            const data = await resp.json().catch(() => ({}));
            res.writeHead(resp.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: resp.ok, status: resp.status, templates: data.templates || [] }));
            return;
          }

          if (pathname === '/api/brevo/send-email') {
            const senderEmail = body.senderEmail || 'sales@climawell.it';
            const senderName = body.senderName || 'Climawell S.r.l.';
            console.log(`[Brevo] Invio email a:`, body.to);

            let payload;
            if (body.templateId) {
              payload = {
                to: body.to,
                templateId: Number(body.templateId),
                params: body.params || {}
              };
              if (body.subject) payload.subject = body.subject;
            } else {
              const plainText = (body.textContent || '').trim() ||
                (body.htmlContent ? body.htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : 'Conferma Ordine Climawell B2B');

              payload = {
                sender: { name: senderName, email: senderEmail },
                to: body.to,
                subject: body.subject,
                htmlContent: body.htmlContent || `<p>${plainText}</p>`,
                textContent: plainText
              };
            }

            const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: {
                'api-key': apiKey,
                'content-type': 'application/json',
                'accept': 'application/json'
              },
              body: JSON.stringify(payload)
            });

            const data = await resp.json().catch(() => ({}));
            console.log('[Brevo] Risposta invio email:', resp.status, data);
            res.writeHead(resp.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: resp.ok, status: resp.status, data }));
            return;
          }

          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Endpoint non trovato' }));
        } catch (e) {
          console.error('[Brevo] Errore proxy:', e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    let targetPath = path.join(SITE_DIR, pathname);

    if (pathname === '/' || pathname === '') {
      targetPath = path.join(SITE_DIR, 'index.html');
    } else if (pathname === '/commercial-hub' || pathname === '/commercial-hub/') {
      targetPath = path.join(SITE_DIR, 'commercial-hub', 'index.html');
    } else if (pathname === '/e-com' || pathname === '/e-com/') {
      targetPath = path.join(SITE_DIR, 'e-com', 'index.html');
    } else if (!path.extname(pathname)) {
      if (fs.existsSync(targetPath + '.html')) {
        targetPath += '.html';
      } else if (fs.existsSync(path.join(targetPath, 'index.html'))) {
        targetPath = path.join(targetPath, 'index.html');
      }
    }

    if (!targetPath.startsWith(SITE_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Accesso Negato');
      return;
    }

    fs.stat(targetPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>404 Non Trovato</h1><p>Risorsa non trovata: <code>${pathname}</code></p><a href="/">Torna a OrderSender</a>`);
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(targetPath).pipe(res);
    });
  });
}

function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function startServer(port) {
  const server = createServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Porta ${port} occupata da un altro servizio, provo con ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Errore avvio server:', err);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const localIps = getLocalIps();
    console.log('\n===============================================================');
    console.log('🚀 CLIMAWELL - SERVER LOCALE AVVIATO CON SUCCESSO!');
    console.log('===============================================================');
    console.log(`\n💻 Su questo computer (PC locale):`);
    console.log(`   👉 Commercial Hub: http://localhost:${port}/commercial-hub/`);
    console.log(`   👉 OrderSender:    http://localhost:${port}/`);

    if (localIps.length > 0) {
      console.log(`\n📱 Da altri dispositivi in LAN / Wi-Fi (Smartphone, Tablet, colleghi):`);
      localIps.forEach(ip => {
        console.log(`   👉 Commercial Hub: http://${ip}:${port}/commercial-hub/`);
        console.log(`   👉 OrderSender:    http://${ip}:${port}/`);
      });
    }

    console.log('\nPremere CTRL + C in questa finestra per arrestare il server.');
    console.log('===============================================================\n');

    // Apertura automatica del browser predefinito sul Commercial Hub
    const openCmd = process.platform === 'win32' ? `start http://localhost:${port}/commercial-hub/` : `xdg-open http://localhost:${port}/commercial-hub/`;
    exec(openCmd, () => {});
  });
}

startServer(INITIAL_PORT);
