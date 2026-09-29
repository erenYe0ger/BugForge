/**
 * All DOM construction for the results view.
 *
 * Nothing in this file knows about the network or about the run sequence; it is
 * handed already-normalized data and turns it into elements. That split is why
 * it can be reasoned about on its own.
 *
 * SECURITY RULE FOR THIS FILE
 *   Model output is inserted with `textContent` or `createTextNode`, never
 *   `innerHTML`. A bug title is untrusted text: the Coder's input is itself
 *   model-generated, so a model that returned `<img src=x onerror=...>` as a
 *   title would otherwise execute script in the page. Do not "simplify" these
 *   assignments to innerHTML. The same applies to the <option> list in main.js.
 */

// Severity to accent-colour map. Lives here because severity is only known at
// runtime and so cannot live in a static class attribute in index.html. The
// fallback on lookup keeps an unrecognised severity from producing a card with
// no colour at all.
const SEVERITY_BORDER = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-green-500',
};

/**
 * Update the status line under the editor.
 *
 * @param {HTMLElement} statusEl the #status element
 * @param {string} message text to display
 * @param {boolean} [isError] render in red
 */
export function setStatus(statusEl, message, isError = false) {
  statusEl.textContent = message;
  // Both classes are toggled explicitly so the state is never ambiguous. This
  // line is the app's only error surface, so its colour is meaningful data.
  statusEl.classList.toggle('text-red-400', isError);
  statusEl.classList.toggle('text-slate-500', !isError);
}

/**
 * Build the Hunter's bug cards into a list element.
 *
 * Expects the shape the server guarantees (severity, title, line, description).
 * The server coerces every field on the way out, so nothing here has to defend
 * against missing or wrong-typed values.
 *
 * @param {HTMLElement} listEl the #bugs <ul>
 * @param {HTMLElement} countEl the #bug-count chip
 * @param {Array<{severity: string, title: string, line: number|null, description: string}>} bugs
 */
export function renderBugs(listEl, countEl, bugs) {
  listEl.replaceChildren();
  countEl.textContent = `${bugs.length} found`;

  for (const bug of bugs) {
    const li = document.createElement('li');
    li.className = `rounded-md border border-ink-line border-l-[3px] bg-ink-panel px-4 py-3 ${
      SEVERITY_BORDER[bug.severity] ?? SEVERITY_BORDER.medium
    }`;

    // Header row: severity chip, then title, then an optional line number.
    const h3 = document.createElement('h3');
    h3.className =
      'mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold';

    const sev = document.createElement('span');
    sev.className = 'text-[10px] font-bold uppercase tracking-widest text-slate-500';
    sev.textContent = bug.severity;
    h3.append(sev);

    h3.append(document.createTextNode(bug.title));

    // The server sends null when the model could not pin the bug to one line,
    // so the number is optional rather than defaulted to a misleading 0.
    if (bug.line != null) {
      const ln = document.createElement('span');
      ln.className = 'font-mono text-[11px] text-slate-500';
      ln.textContent = `L${bug.line}`;
      h3.append(ln);
    }

    const p = document.createElement('p');
    p.className =
      'whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-300';
    p.textContent = bug.description;

    li.append(h3, p);
    listEl.append(li);
  }
}
