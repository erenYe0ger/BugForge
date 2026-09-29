/**
 * The error contract for the whole app.
 *
 * One rule, enforced by src/app.js's error middleware:
 *
 *   Throw HttpError for anything the user should see. Its message is returned
 *   to the browser verbatim and is NOT logged.
 *
 *   Anything else thrown becomes a generic 500 and IS logged server-side.
 *
 * The split exists so that a deliberate, user-facing message ("GROQ_API_KEY is
 * not set") is not drowned in a log, while an unexpected crash still leaves a
 * stack trace for debugging but never leaks internals to the page.
 *
 * Never put internal detail in an HttpError message. A Groq error body does get
 * forwarded (see src/groq.js) because those messages are actionable and contain
 * no secrets, but nothing internal to this codebase should.
 */
class HttpError extends Error {
  /**
   * @param {number} status HTTP status code to send
   * @param {string} message user-facing text, returned verbatim
   */
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

module.exports = { HttpError };
