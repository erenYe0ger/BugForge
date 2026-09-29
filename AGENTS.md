# AGENTS.md

Instructions for AI agents and contributors working on this repository.

## What this is

A local web tool. User pastes code, two LLM agents process it in sequence: the
Hunter returns a bug list, the Coder returns the rewritten file. Express backend
proxying Groq, vanilla JS frontend, Tailwind from CDN.

## Commands

```bash
npm install                 # install deps
npm start                   # run on http://localhost:3000
npm test                    # 42 unit + integration tests, node:test
```

There is no build step, no bundler, no framework, and no linter. Do not
introduce one without asking.

## Layout

```
server.js                  entry point: bind a port, nothing else
src/
  app.js                   express assembly: middleware, routes, static, errors
  config.js                ALL environment and policy constants
  errors.js                the HttpError contract
  validate.js              untrusted input in, sanitized data out
  parse.js                 recovering payloads from model replies
  prompts.js               the two agent prompts
  groq.js                  the only outbound network call
  routes/hunt.js           POST /api/hunt
  routes/fix.js            POST /api/fix
public/
  index.html               structure, Tailwind classes, Tailwind config
  js/main.js               entry: state, run order, event wiring
  js/api.js                the fetch wrapper
  js/render.js             all DOM construction
test/
  validate.test.js         mirrors src/validate.js
  parse.test.js            mirrors src/parse.js
  groq.test.js             mirrors src/groq.js, fetch stubbed
  routes.test.js           HTTP-level: routing, error contract, static exposure
```

### Why the split stops where it does

`src/` separates by **layer of trust and side effects**, not by file size:

- `config.js` is the only module that reads `process.env`.
- `groq.js` is the only module that does network I/O.
- `validate.js` and `parse.js` are pure, so their tests need no stubs.
- `routes/*` are thin. If one ever grows logic, the logic belongs in a
  neighbouring module, not inline.

On the client, `render.js` never calls the network and `api.js` never touches
the DOM. `main.js` is the only place the two meet.

Do not add a file that does not have a single clear job. Six one-function files
is already the limit of what this app justifies.

## Module systems differ, on purpose

The server is CommonJS. The browser is native ES modules. This is not an
oversight: the browser has no `require`, and CJS cannot be used there without a
bundler. The one real consequence:

**`node --check public/js/*.js` will fail.** Node parses `.js` as CommonJS and
rejects `import`/`export`. That failure is meaningless — do not "fix" it by
adding `"type": "module"`, which would break the entire server. To check client
syntax, load the page in a browser, or copy the file to a `.mjs` temp file first.

## Rules

**The API key stays on the server.** It is read in `src/config.js` and used only
in `src/groq.js`. Never add it to any client-side file, never log it, never
return it in a response, never inline it into HTML.

**Never use `innerHTML` with model output.** Use `textContent` or
`createTextNode`. Bug titles and fixed code are model-generated; a model can
return `<img src=x onerror=...>` and `innerHTML` would execute it. This applies
to `public/js/render.js` and to the `<option>` list in `main.js`.

**Keep the two calls client-orchestrated.** The browser calls `/api/hunt`, then
`/api/fix` with the results. Moving this into one server route would break the
UI's ability to show findings during the second wait. If you add a combined
route, keep the existing two.

**Validate on the server even for data that came from the server.** `/api/fix`
re-validates the bug array because the browser is untrusted. Keep that.

**Parse defensively around the model.** Models ignore "JSON only" instructions
regularly. `src/parse.js` exists for that. Preserve the tolerant behavior:
prefer recovering a result over failing.

**Keep the pure modules pure.** `validate.js`, `parse.js`, and `prompts.js` must
stay free of I/O, `Date`, randomness, and `process.env`. That is what keeps
their tests free of stubs.

**Error contract.** Throw `HttpError(status, message)` for anything the user
should see. Its message is returned verbatim and is not logged. Any other thrown
error becomes a generic 500 and is logged. Do not put internals in an
`HttpError` message. See `src/errors.js`.

## Testing

`npm test` runs 42 tests. Coverage is uneven, and the gaps are deliberate:

| Module          | Covered                                          |
| --------------- | ------------------------------------------------ |
| `validate.js`   | fully                                            |
| `parse.js`      | fully                                            |
| `groq.js`       | error paths, with `fetch` stubbed                |
| `app.js`        | routing, error contract, static exposure         |
| `routes/*`      | **error paths only**                             |
| `prompts.js`    | **not covered**                                  |
| `public/js/*`   | **not covered at all**                           |

Two consequences:

**The success paths of `/api/hunt` and `/api/fix` are untested.** They are the
one thing a test could not cover without either spending real money on a model
call or injecting a fake client into `createApp()`. If you add dependency
injection, start there.

**`public/js/` has no test coverage and `node --check` cannot help** (see the
module systems section). A real shipped bug was a destructuring assignment into
a `const`:

```js
const bugs = [];
({ bugs } = await post('/api/hunt', ...));   // TypeError at runtime
```

That passes every static check, and at runtime it threw, was swallowed by the
`catch`, and showed the user a red status line with both panels empty while the
API worked perfectly.

### Driving the real page

When you change anything in `public/`, verify the rendered DOM, not just that
the file parses. Headless Edge over the DevTools protocol needs no dependency:

- Launch `msedge --headless=new --remote-debugging-port=PORT --user-data-dir=TMP`
- `fetch('http://127.0.0.1:PORT/json')`, find the `type: "page"` target
- Connect with the global `WebSocket`, call `Page.navigate`, then
  `Runtime.evaluate` with `returnByValue: true` to read the DOM back
- Subscribe to `Runtime.exceptionThrown` and `Network.loadingFailed` to catch
  module load failures, which is how a broken `import` shows up
- Assert on `getComputedStyle` and `getBoundingClientRect().height` for
  visibility, and on `innerText` for content

A full run takes two model calls, so allow a couple of minutes of polling.

## Tailwind gotcha that has already caused a bug

`public/index.html` uses `class="grid ..."` together with the `hidden`
attribute. Tailwind's `grid` class sets `display: grid`, and a class rule
outranks the browser's default `[hidden] { display: none }`. The panel rendered
as an empty box on page load and every `el.results.hidden = true` silently did
nothing.

The fix is the `[&[hidden]]:hidden` class on the element.

**Any time you add `display` classes to an element that is also toggled via the
`hidden` property, add `[&[hidden]]:hidden` too.** Otherwise it silently does
not hide. Assert on computed style, not the `hidden` property.

## Tailwind is CDN-loaded

`public/index.html` pulls Tailwind from `cdn.tailwindcss.com`. That is
development-only and prints a console warning. Fine for a local tool.

When this gets deployed, replace it: install the Tailwind CLI, point it at
`public/index.html` to generate a stylesheet, and remove both CDN tags. The
dynamic classes in `public/js/render.js` (`SEVERITY_BORDER`) are literal
strings, so a content-scanning build will pick them up as long as they are not
built by string concatenation at runtime.

## Adding a language

Add the id to `LANGUAGES` in **both** `src/config.js` and `public/js/main.js`.
The lists are duplicated on purpose so first paint needs no round trip, and the
server validates against its own copy. Missing one means either a dropdown the
server rejects, or a language the UI never offers.

## Adding a route

1. Put the handler in `src/routes/<name>.js` and export a single function.
2. Validate at the top with the helpers in `src/validate.js`.
3. Build messages with a builder in `src/prompts.js` rather than inline.
4. Call `callGroq(...)` from `src/groq.js`.
5. Mount it in `src/app.js`.
6. Add error-path cases to `test/routes.test.js`.

## Dependencies

Current: `express`, `dotenv`. That is all.

Before adding a package, check whether Node's standard library covers it. The
repo already uses the built-in `fetch`, `AbortSignal.timeout`, `WebSocket`,
`node:test`, and `os.tmpdir` instead of `node-fetch`, `axios`, `ws`, `jest`, and
`mock-fs`. Prefer the same.
