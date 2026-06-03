// local-server.js  —  serves index.html + /api/chat on your local network
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { networkInterfaces } = require('os');

/* Reuse the serverless proxy as a plain Node module */
const chatHandler = require('./api/chat.js');

const server = http.createServer((req, res) => {
  /* Let any device on your network talk to this server */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  /* ---- Gemini proxy endpoint ---- */
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { req.body = JSON.parse(body); } catch { req.body = {}; }
      // Add Express-like helpers so api/chat.js works in vanilla Node
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(obj));
      };
      chatHandler(req, res);
    });
    return;
  }

  /* ---- Static file server ---- */
  const filePath = req.url === '/' ? './index.html' : '.' + req.url;
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html'
               : ext === '.js'  ? 'application/javascript'
               : 'text/plain';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const name of Object.keys(networkInterfaces())) {
    for (const net of networkInterfaces()[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log(`\n  Local server running:`);
  console.log(`    On this computer:  http://localhost:${PORT}`);
  console.log(`    On your network:   http://${ips[0] || 'YOUR_IP'}:${PORT}`);
  console.log(`  (same Wi-Fi → open that network URL on your phone)\n`);
});