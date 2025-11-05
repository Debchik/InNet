// server.js (CommonJS)
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const certDir = process.cwd();
const certBase = process.env.DEV_CERT_BASE || 'localhost+2';
const keyPath = path.join(certDir, `${certBase}-key.pem`);
const certPath = path.join(certDir, `${certBase}.pem`);

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  throw new Error(
    `Developer TLS certificates not found. Expected ${keyPath} and ${certPath}. ` +
      'Set DEV_CERT_BASE to the base filename (without extension) of your certificate pair.'
  );
}

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

const listenHost = process.env.DEV_HOST || 'localhost';
const listenPort = Number(process.env.DEV_PORT || 3000);
const publicHost =
  process.env.DEV_PUBLIC_HOST ||
  (listenHost === '0.0.0.0' ? 'localhost' : listenHost);

app.prepare().then(() => {
  https
    .createServer(httpsOptions, (req, res) => {
      handle(req, res);
    })
    .listen(listenPort, listenHost, (err) => {
      if (err) throw err;
      console.log(`HTTPS server running at https://${publicHost}:${listenPort}`);
    });
});
