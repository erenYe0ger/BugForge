# BugForge

Paste buggy code, two AI agents take it in turn. **The Hunter** reads the code
and reports bugs, security flaws, and unhandled edge cases. **The Coder** takes
that bug list and rewrites the code with the fixes applied.

The result is a bug list on the left and a clean, copyable file on the right.

## Requirements

- Node.js 21 or newer. The app uses the global `fetch`, which stopped needing a
  flag in Node 21. Developed and tested on Node 24.
- A Groq API key. Get one at <https://console.groq.com/keys>.

## Setup

```bash
npm install
cp .env.example .env
```

Open `.env` and paste your key:

```
GROQ_API_KEY=gsk_your_actual_key_here
```

The file must be named exactly `.env`. Not `.env.local`, not `.env.txt`. On
Windows the copy works in PowerShell with `Copy-Item .env.example .env`.

## Run

```bash
npm start
```

Open <http://localhost:3000>, paste code, pick a language, press **Forge**.

First run takes a few seconds. Each press makes two model calls, so expect a
noticeable pause while the Coder works.

## Configuration

All optional, all read from `.env` at startup.

| Variable             | Default                                            | Purpose                                  |
| -------------------- | -------------------------------------------------- | ---------------------------------------- |
| `GROQ_API_KEY`       | none                                               | Required. Your Groq key.                 |
| `HUNTER_MODEL`       | `openai/gpt-oss-120b`                              | Model for the Hunter.                    |
| `CODER_MODEL`        | `HUNTER_MODEL`                                     | Model for the Coder.                    |
| `PORT`               | `3000`                                             | HTTP port.                               |
| `GROQ_URL`           | Groq chat completions endpoint                     | Override to point at a proxy or mock.    |
| `UPSTREAM_TIMEOUT_MS`| `120000`                                           | Ceiling on a single model call.          |

### About the model names

A Groq key is only entitled to the models on its own plan. `openai/gpt-oss-120b`
is the default because it is the strongest coding model broadly available, but
it is **not** on every key. If you see:

```
Groq API 404: model_not_found
```

your key cannot reach the configured model. List what it can:

```bash
curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
```

Then set `HUNTER_MODEL` and `CODER_MODEL` to something from that list.

## How it works

```
browser                server                 Groq
   |                      |                     |
   |-- POST /api/hunt --->|-- chat completions ->|  Hunter: code -> bug list
   |<-- { bugs: [...] } --|<-- JSON array -------|
   |                      |                     |
   |-- POST /api/fix ---->|-- chat completions ->|  Coder: code + bugs -> fixed code
   |<-- { code: "..." } --|<-- full file --------|
```

The browser makes the two calls in sequence, not the server. The Coder needs the
Hunter's output, so the second call cannot start until the first returns. Doing
this client-side also means Hunter's findings appear on screen during the second
wait instead of behind a blank panel.

### API

`POST /api/hunt` — request `{ "code": string, "language": string }`,
response `{ "bugs": [{ "severity", "title", "line", "description" }] }`.

`POST /api/fix` — request `{ "code", "language", "bugs" }`,
response `{ "code": "<the whole corrected file>" }`.

`severity` is one of `critical`, `high`, `medium`, `low`. `line` is an integer
or `null` when the model could not pin the bug to one line.

Errors return `{ "error": string }` with a 400 (bad input), 500 (missing key),
or 502 (upstream refused or replied with something unparseable).

## Layout

```
server.js            entry point: starts the server, nothing else
src/
  app.js             express assembly, route mounting, error handling
  config.js          all environment and policy constants
  errors.js          the HttpError contract
  validate.js        input validation, pure
  parse.js           recovering payloads from model replies, pure
  prompts.js         the two agent prompts, pure
  groq.js            the only outbound network call
  routes/hunt.js     POST /api/hunt
  routes/fix.js      POST /api/fix
public/
  index.html         page structure, Tailwind classes, theme config
  js/main.js         state, run order, event wiring
  js/api.js          the fetch wrapper
  js/render.js       all DOM construction
test/                one file per src module, plus HTTP-level route tests
```

The split is by concern, not by size. `src/config.js` is the only module that
reads environment variables, `src/groq.js` is the only one that does network
I/O, and `validate.js`, `parse.js`, and `prompts.js` are pure functions, which
is why their tests need no stubs at all.

The API key is read in `src/config.js` and used only in `src/groq.js`, so the key
never reaches the browser. The browser only ever talks to `/api/hunt` and
`/api/fix`. Both sides are deliberately dependency-light: the server uses
CommonJS `require`, and the client uses native ES modules via
`<script type="module">`, so the browser code splits into `public/js/` with no
bundler and no build step.

## Tests

```bash
npm test
```

42 tests covering the validators, the model-reply parsers, the upstream error
handling, and the HTTP surface (routing, error contract, and that `.env` and
`server.js` are not reachable over HTTP).

Two things are not covered, both deliberately:

- The **success** paths of `/api/hunt` and `/api/fix`. Covering them needs either
  a real model call or an injected fake client, so every test in the suite is
  built to return before any model request is made.
- **`public/js/`** entirely. Node cannot syntax-check it (it is ES modules,
  Node parses `.js` as CommonJS), and it has no test coverage.

Because of that second gap, changes to the client should be verified by loading
the page in a browser and checking the rendered DOM. Two real bugs in this repo
passed every static check and failed only at runtime: a destructuring assignment
into a `const`, and a Tailwind `display` class silently defeating the `hidden`
attribute.

## Troubleshooting

**Red error under the editor, both panels empty.** Read the message. Common
ones: `GROQ_API_KEY is not set`, a model id your key cannot reach, or
`Field "code" exceeds the 200000 character limit`.

**`model_not_found`.** See "About the model names" above.

**`Groq API 429`.** Rate limited. Wait and retry.

**Panels look unstyled.** Tailwind loads from a CDN, so the page needs internet
on first load. A content blocker can block it. Hard-refresh.

**Both panels are empty but the status line says "Done."** Check the browser
console for a JavaScript error. The status line only reports network failures;
anything thrown in page code shows up in the console, not on screen.

**Copy button does nothing.** The Clipboard API needs a secure context. It works
on `http://localhost`, but not over a LAN IP or a plain-HTTP host. Select the
code manually.

## Security notes

- The API key is read from `.env`, which `.gitignore` excludes. Never commit it.
- `.env` is not inside `public/`, and `dotfiles: 'deny'` blocks dotfiles from
  being served, so the key cannot be fetched over HTTP.
- Model output is rendered with `textContent` only, never `innerHTML`, so a
  malicious bug title cannot execute script in the page.
- Submitted code is capped at 200,000 characters and the request body at 2 MB.
- There is no authentication and no rate limiting. This is a local tool. Do not
  expose it to the internet as-is; you would be proxying model calls for anyone
  who found the URL, at your key's cost.
