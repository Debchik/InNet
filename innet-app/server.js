// server.js (CommonJS)
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const certDir = process.cwd();
const httpsOptions = {
  key: fs.readFileSync(path.join(certDir, '192.168.7.28+3-key.pem')),
  cert: fs.readFileSync(path.join(certDir, '192.168.7.28+3.pem')),
};

app.prepare().then(() => {
  https
    .createServer(httpsOptions, (req, res) => {
      handle(req, res);
    })
    .listen(3000, '0.0.0.0', (err) => {
      if (err) throw err;
      console.log('HTTPS server running at https://192.168.7.28:3000');
    });
});
