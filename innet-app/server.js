// server.js (CommonJS)
const https = require("https");
const fs = require("fs");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const httpsOptions = {
  key: fs.readFileSync("./192.168.7.28+3-key.pem"),
  cert: fs.readFileSync("./192.168.7.28+3.pem"),
};



app.prepare().then(() => {
  https.createServer(httpsOptions, (req, res) => {
    handle(req, res);
  }).listen(3000, '0.0.0.0', err => {
  if (err) throw err;
  console.log("HTTPS server running at https://192.168.7.28:3000");
});

});
