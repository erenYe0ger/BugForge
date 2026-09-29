/**
 * Express app assembly: middleware, route mounting, static files, and the error
 * handler that implements the contract described in src/errors.js.
 *
 * This module builds and exports the app. It does not listen on a port, so
 * tests and future scripts can import it without holding a socket open. The
 * entry point that calls listen() is server.js at the repo root.
 */

const path = require('node:path');
const express = require('express');

const hunt = require('./routes/hunt');
const fix = require('./routes/fix');
const { HttpError } = require('./errors');

/**
 * The public directory, resolved relative to this file rather than the working
 * directory, so `npm start` behaves the same no matter where it is launched from.
 */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createApp() {
  const app = express();

  // 2 MB body cap sits comfortably above the 200k character source limit plus a
  // bug list. The character check in validate.js is the real limit; this exists
  // to stop an absurd body being buffered in memory first.
  app.use(express.json({ limit: '2mb' }));

  app.post('/api/hunt', hunt);
  app.post('/api/fix', fix);

  // Serves ./public. `dotfiles: 'deny'` blocks .env and any other dotfile, and
  // because the root is ./public the project-level .env is not even inside this
  // directory. Two independent reasons the key cannot be fetched over HTTP.
  app.use(
    express.static(PUBLIC_DIR, {
      extensions: ['html'],
      index: 'index.html',
      dotfiles: 'deny',
    })
  );

  // Terminal error middleware. Must keep all four parameters including the
  // unused _next, or Express will not recognise it as an error handler.
  app.use((err, _req, res, _next) => {
    const status = err instanceof HttpError ? err.status : 500;
    const message =
      err instanceof HttpError ? err.message : 'Unexpected server error.';

    // Only unexpected failures are logged. HttpError messages are shown to the
    // user deliberately, so logging them would be pure noise.
    if (status === 500) console.error(err);

    res.status(status).json({ error: message });
  });

  return app;
}

module.exports = { createApp, PUBLIC_DIR };
