// MUST be first: populates process.env before the api/ modules below are
// evaluated, since several of them read env vars at module scope.
import './api-dev-env.js';

import http from 'http';
import handler from './api/chat.js';
import syncHandler from './api/sync.js';
import confirmHandler from './api/confirm.js';
import declineHandler from './api/decline.js';
import statusHandler from './api/status.js';
import rescheduleRequestHandler from './api/reschedule-request.js';
import rescheduleApproveHandler from './api/reschedule-approve.js';
import rescheduleDeclineHandler from './api/reschedule-decline.js';
import ownerHandler from './api/owner.js';
import rescheduleManualHandler from './api/reschedule-manual.js';
import reviewHandler from './api/review.js';
import bookingHandler from './api/booking.js';

const PORT = 3001;

// Add Express-like res.status().json() helpers to raw http response
function addHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      req.body = JSON.parse(body);
      addHelpers(res);
      handler(req, res);
    });
  } else if (req.url === '/api/sync') {
    // Manual sync trigger for local testing (GET or POST).
    req.headers = req.headers || {};
    addHelpers(res);
    syncHandler(req, res);
  } else if (req.url.startsWith('/api/confirm')) {
    // One-click approve link (GET with query params).
    confirmHandler(req, res);
  } else if (req.url.startsWith('/api/decline')) {
    // One-click decline link (GET with query params).
    declineHandler(req, res);
  } else if (req.url.startsWith('/api/status')) {
    // Client booking status page (GET with query params).
    statusHandler(req, res);
  } else if (req.url.startsWith('/api/reschedule-request')) {
    // Client self-serve reschedule request (POST form; handler reads the body).
    rescheduleRequestHandler(req, res);
  } else if (req.url.startsWith('/api/reschedule-approve')) {
    // Owner one-click: move the event to the requested date (GET).
    rescheduleApproveHandler(req, res);
  } else if (req.url.startsWith('/api/reschedule-decline')) {
    // Owner one-click: keep the current date, clear the request (GET).
    rescheduleDeclineHandler(req, res);
  } else if (req.url.startsWith('/api/reschedule-manual')) {
    // Owner dashboard manual reschedule (POST, cookie-gated).
    rescheduleManualHandler(req, res);
  } else if (req.url.startsWith('/api/owner')) {
    // Password-gated owner dashboard (GET list / POST login).
    ownerHandler(req, res);
  } else if (req.url.startsWith('/api/booking')) {
    // Website booking form: availability (GET) and submit (POST). The handler
    // reads its own body, so don't pre-parse it here.
    bookingHandler(req, res);
  } else if (req.url.startsWith('/api/review')) {
    // Public review form (GET), approved-list JSON (GET ?list=1), submit (POST).
    reviewHandler(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`API dev server running on http://localhost:${PORT}`);
});
