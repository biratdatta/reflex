# Devpost submission pack

Everything the submission form asks for, ready to paste. The thumbnail is `thumbnail.png`
(1200×675 at 2×). The project story is `../project-story.md`.

## Project name

```
Reflex
```

## Elevator pitch (200 characters max — this is 187)

```
Reflex reads a website's existing forms and accessibility metadata, proposes WebMCP tools from them, and — once you approve — lets an agent drive the real site instead of clicking pixels.
```

## Built with

```
typescript, javascript, chrome-extension, manifest-v3, webmcp, model-context-protocol, react,
vite, vitest, playwright, json-schema, aria, html, css, node.js, github-actions, vercel
```

## Try it out links

| Label | URL |
| --- | --- |
| Product page | https://reflex-three-cyan.vercel.app |
| Source code | https://github.com/biratdatta/reflex |
| Install (latest release) | https://github.com/biratdatta/reflex/releases/latest |

## Image gallery, in order

1. `thumbnail.png` — the cover image
2. `../screenshots/popup-capabilities.png` — capabilities discovered, grouped by risk
3. `../screenshots/popup-inspector.png` — the evidence behind one generated tool
4. `../screenshots/demo-tool-call.png` — an agent calling a tool, the service responding
5. `../screenshots/popup-triage.png` — the honest answer on a page with nothing worth reviewing
6. `../screenshots/popup-dark.png` — light and dark
7. `../screenshots/demo-register.png` — the bundled demo service

## Video

Upload `../reflex-demo-silent.mp4` (or the narrated cut from the
[release](https://github.com/biratdatta/reflex/releases/latest)) to YouTube and paste the link —
Devpost's video field accepts YouTube or Vimeo URLs only, not a file.

Suggested title and description:

```
Reflex — turning a government service into WebMCP tools in 47 seconds
```

```
Reflex is a Chrome extension that reads a website's existing forms and accessibility metadata,
proposes WebMCP tools from what it finds, and registers the ones a human approves. Here it runs
against a fictional government claims service: discovery, approval, an agent calling
search_claims through document.modelContext, and a destructive tool stopping to ask a human.

Source: https://github.com/biratdatta/reflex
```

## The WebMCP API used

```js
document.modelContext.registerTool({
  name: "search_claims",
  description: "Find a claim by reference number, claimant name or policy number.",
  inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 60 } }, required: ["query"] },
  annotations: { readOnlyHint: true },
  execute: async (input) => executeCandidate(document, candidate, input)
});
```

Reflex generates every field of that object from markup the page already had. See
`packages/webmcp-adapter/src/adapter.ts`, the only file in the codebase that touches
`modelContext`.

## Facts worth quoting, all verifiable from the repository

| Claim | Where to check |
| --- | --- |
| GOV.UK search scores 95% readiness; a 10-parameter filter form | `npm run scan -- https://www.gov.uk/search/all` |
| GitHub advanced search yields 25 typed parameters from one form | `npm run scan -- https://github.com/search/advanced` |
| One YouTube page: 57 candidates found, 0 worth reviewing | `npm run scan -- "https://www.youtube.com/watch?v=aircAruvnKk"` |
| Companies House and NHS finders work at 50% confidence | verified end to end, see README |
| 183 unit tests, 25 end-to-end in a real browser | `npm test`, `npm run test:e2e`, and CI |
| Functional from a cold clone | CI runs install → typecheck → tests → builds → package |
