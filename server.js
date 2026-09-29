/**
 * Entry point. Its only jobs are to start the server and report startup state.
 *
 * Everything else lives in src/. If you are looking for behaviour, this file
 * will not have it.
 *
 *   server.js        this file: bind a port
 *   src/app.js       express assembly, routes, error handler
 *   src/config.js    environment and policy constants
 *   src/errors.js    the HttpError contract
 *   src/validate.js  untrusted input in, sanitized data out
 *   src/parse.js     recovering payloads from model replies
 *   src/prompts.js   the two agent prompts
 *   src/groq.js      the only outbound network call
 *   src/routes/      one thin file per endpoint
 */

const { createApp } = require('./src/app');
const { PORT, GROQ_API_KEY } = require('./src/config');

const app = createApp();

app.listen(PORT, () => {
  console.log(`BugForge listening on http://localhost:${PORT}`);

  // Warn at boot rather than letting the first request discover the problem.
  // The key is never printed, only its presence.
  if (!GROQ_API_KEY) {
    console.warn(
      'Warning: GROQ_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }
});
