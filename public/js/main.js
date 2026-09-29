/**
 * Client entry point: element lookups, the language dropdown, the two-step run,
 * and event wiring.
 *
 * Loaded as a module from index.html with <script type="module">. That is what
 * makes the split into public/js/ possible with no bundler and no build step:
 * browsers have supported ES module imports natively for years.
 *
 * Responsibilities kept here and nowhere else:
 *   - holding the current run's state
 *   - the ORDER of the two agent calls
 *   - what the user sees while waiting
 *
 * Networking lives in api.js. DOM construction lives in render.js.
 */

import { post } from './api.js';
import { renderBugs, setStatus } from './render.js';

// Must match the LANGUAGES list in src/config.js. Duplicated rather than fetched
// on purpose: it keeps first paint free of a round trip, and the server
// independently rejects anything outside its own list, so the two cannot disagree
// in a way that reaches a model prompt. Add a language to both, never one.
const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'go',
  'java',
  'csharp',
  'php',
  'ruby',
  'rust',
];

// Cached element references, looked up once at load rather than per interaction.
const el = {
  language: document.getElementById('language'),
  code: document.getElementById('code'),
  forge: document.getElementById('forge'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  bugs: document.getElementById('bugs'),
  bugCount: document.getElementById('bug-count'),
  fixed: document.getElementById('fixed'),
  copy: document.getElementById('copy'),
};

// Fill the language dropdown. Options are built with the DOM API rather than
// assigned via innerHTML, matching the rule at the top of render.js.
for (const lang of LANGUAGES) {
  const opt = document.createElement('option');
  opt.value = lang;
  opt.textContent = lang;
  el.language.append(opt);
}
el.language.value = 'javascript';

/**
 * The main run. Called by the Forge button.
 *
 * The two agent calls are sequential and dependent: the Coder is given the
 * Hunter's output, so the second cannot start until the first returns. Hunter's
 * cards are rendered before the Coder call begins so the user sees findings
 * during the second wait instead of staring at a blank panel.
 *
 * The UI is reset at the top so a second run never shows stale results, and
 * both buttons are restored in `finally` so a failed run does not leave the app
 * stuck disabled.
 */
async function forge() {
  // Read inputs up front. Reading them after an await would risk picking up
  // values the user has since typed.
  const code = el.code.value;
  const language = el.language.value;

  el.forge.disabled = true;
  el.copy.disabled = true;
  el.results.hidden = true;
  el.bugs.replaceChildren();
  el.bugCount.textContent = '';
  el.fixed.textContent = '';

  try {
    setStatus(el.status, 'The Hunter is reading your code...');

    // `const { bugs }` scopes the binding to this block. It must not be a
    // top-level `let bugs = []` that is later reassigned by destructuring:
    // assigning to a const binding throws "Assignment to constant variable",
    // and the catch below turns that into a red status line with no results,
    // while the API calls themselves all succeed. That bug shipped once.
    const { bugs } = await post('/api/hunt', { code, language });
    renderBugs(el.bugs, el.bugCount, bugs);

    // A clean bill of health is a valid outcome, not an error. Show the empty
    // column and skip the Coder entirely rather than asking it to rewrite
    // working code.
    if (bugs.length === 0) {
      setStatus(el.status, 'No bugs found. Nothing to fix.');
      el.results.hidden = false;
      return;
    }

    setStatus(el.status, `Found ${bugs.length}. The Coder is applying fixes...`);

    // Renamed on destructure: the outgoing `code` is the original source and the
    // response `code` is the fixed file. Overwriting the original would be
    // harmless here but reads as a bug, so the names stay distinct.
    const { code: fixedCode } = await post('/api/fix', { code, language, bugs });

    el.fixed.textContent = fixedCode;
    el.results.hidden = false;
    setStatus(el.status, 'Done.');
  } catch (err) {
    // One catch covers both requests. The server's own error text (model not
    // found, bad key, bad request) is already user-readable and shown as-is.
    setStatus(el.status, err.message, true);
  } finally {
    el.forge.disabled = false;
    el.copy.disabled = false;
  }
}

el.forge.addEventListener('click', forge);

/**
 * Copy the fixed code to the clipboard.
 *
 * The Clipboard API requires a secure context. It works on http://localhost but
 * is blocked over a LAN IP or any plain-HTTP host, hence the explicit failure
 * path with a manual-copy instruction rather than a silent no-op.
 */
el.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.fixed.textContent);
    el.copy.textContent = 'Copied';
    // Brief confirmation, then restore the label.
    setTimeout(() => {
      el.copy.textContent = 'Copy';
    }, 1200);
  } catch {
    setStatus(
      el.status,
      'Clipboard blocked by the browser. Select the code manually.',
      true
    );
  }
});
