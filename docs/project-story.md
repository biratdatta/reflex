# Project story

Written for the WebMCP Challenge submission. Every number here is reproducible from this
repository — the commands are in [`devpost/submission.md`](devpost/submission.md).

## Inspiration

WebMCP gives a website a way to hand an agent real tools instead of making it guess at pixels. The
catch is that every website that already exists was built before it. Adapting each one by hand means
a developer identifying capabilities, naming tools, writing descriptions, authoring JSON Schemas,
implementing handlers and maintaining registrations — which is exactly the adoption barrier that
keeps agents stuck clicking through user interfaces: fragile, slow, and ambiguous.

Then I noticed something. Those sites are not silent about what they do. A form that carries
`aria-label="Search claims"`, an `aria-description` explaining itself, and `<label>`s on every field
has *already* declared everything a tool definition needs — a name, a description, and a typed
parameter list. That metadata exists on millions of pages because accessibility law required it, not
because anyone was thinking about agents.

**Accessibility metadata is already a capability contract. Nobody was reading it as one.**

## What it does

Reflex is a Chrome extension. Open it on a page and it reads the DOM's forms, buttons, labels and
ARIA attributes, then proposes WebMCP tools from what it finds — generating the tool name, a
description, a full JSON Schema, a risk classification and a confidence score, and recording the
exact attributes that produced each one as evidence.

You review that evidence and approve what you want. Approved capabilities are registered through
WebMCP:

```js
document.modelContext.registerTool({
  name: "search_claims",
  description: "Find a claim by reference number, claimant name or policy number.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", maxLength: 60 } },
    required: ["query"]
  },
  annotations: { readOnlyHint: true },
  execute: async (input) => executeCandidate(document, candidate, input)
});
```

The point is that Reflex *writes that object for you*, from markup the page already had. When an
agent calls the tool, Reflex fills the site's own form, dispatches `input`/`change` so frameworks
notice, submits with `requestSubmit()` so the page's own validation runs, and returns the text of the
region the page updated — so a read-only tool returns real data, not "submitted".

It ships with a fictional government claims service to demonstrate against, and a scanner that runs
the discovery engine against any live URL.

## How we built it

A TypeScript monorepo where the discovery engine has no extension dependencies, so it can be pointed
at any page:

- **capability-model** — the `CapabilityCandidate` type, schemas, and the typed message protocol
- **discovery-engine** — form and button scanners, ARIA and label resolution, tool naming, ignore
  rules, keyword risk classification, confidence scoring, stable selectors and semantic fingerprints
- **schema-generator** — HTML controls to JSON Schema: enums from `<option>`, radio groups, checkbox
  groups, `min`/`max`, formats, `required`
- **webmcp-adapter** — the only file that touches `modelContext`, plus the DOM executor

The extension is split across the two JavaScript worlds Chrome gives you, because a content script
cannot reach the page's own `modelContext`. The content script (isolated world) does discovery and
holds the user's decisions; a page runtime (main world) registers tools and executes them. Everything
between them is a typed message on a private channel. The content script never touches WebMCP; the
page runtime decides nothing.

Testing was the backbone: **183 unit tests** in jsdom and **25 end-to-end tests** that load the real
built extension into a browser, approve capabilities through the real message protocol, and call the
registered tools the way a WebMCP client would. CI runs all of it on every push.

## Challenges we ran into

**The 242-row wall.** Pointed at YouTube, Reflex found 242 candidates, all scoring 55%, named
`1_reply`, `150_replies`, `166_replies` — the button on every comment. Discovery wasn't the hard
part; *review* was. A list that long is worth exactly what an empty one is.

The obvious fix — raise the confidence floor — was wrong, and I nearly shipped it. Real working
capabilities on well-built government forms also score 50–60%, because those pages never wrote an
`aria-description`. Companies House and the NHS pharmacy finder both score 50%, and both work. What
separates them from noise isn't the score, it's the **source**: a form arrives with a typed schema,
which is evidence in itself; a button is an unparameterised action inferred from two words of label.
Two floors — 50% for forms, 70% for buttons — cut YouTube from 57 candidates to 0 while keeping every
real one.

**Risk classification kept lying.** Three separate false positives, each found by pointing the engine
at something real: "Find an employee by name or **email**" was flagged sensitive because *email* was
a keyword; "Search **pay**ments" was flagged sensitive because prefix-matching `pay` hit `payments`;
and "View claim **record**" was classified as a write because *record* is also a write verb. Fixes:
separate consequential *actions* (authorise, send, grant) from sensitive *subjects* (password, bank,
role), match short verbs as whole words only, and resolve read-versus-write **by position**, since
these labels are imperative phrases and the leading verb is the action.

**Two JavaScript worlds racing.** The content script's handshake could arrive before the page runtime
was listening, leaving the panel convinced the page had no WebMCP host. And when the popup
re-injected, a *second* runtime appeared with its own registry — so one approved tool registered
twice and executed twice. Fixed with a readiness announcement, a retry, and making injection
idempotent.

**Reloads dropped everything.** `activeTab` is revoked the moment a page navigates, so refreshing
took the registered tools with it. Approvals were never lost — they are stored per origin — but
nothing re-attached. Rather than requesting blanket host permissions, a site can now be granted
individually, registering a dynamic content script for that origin alone.

**Tooling fought back.** Stable Chrome 151 refuses `--load-extension`, so the end-to-end suite runs
on Playwright's Chromium. Playwright's Chromium ships without H.264, so a video check hung for two
minutes and looked like a broken page. GitHub strips `<video>` from READMEs entirely — all four embed
forms were verified through their API before settling on an animated GIF.

## Accomplishments that we're proud of

**It works on sites nobody built for it.** GOV.UK search scores 95% and yields a ten-parameter filter
form; the NHS pharmacy finder 90%; Companies House 89%; GitHub's advanced search produces a tool with
**25 typed parameters** from one form. All three of the top sites were verified end to end — approve
the tool, call it through `navigator.modelContext`, and the site performs the real search. Their
Content-Security-Policy is no obstacle, because Chrome injects the runtime through a privileged path.

**It fails closed.** Every candidate stores a semantic fingerprint — tag, role, accessible name,
expected field names — re-verified before anything actuates. Relabel a form while keeping its `id`
and execution refuses with *"accessible name changed"* rather than driving the wrong control.

**It refuses to be glib.** On a page with nothing worth reviewing, the panel says so and explains
why, instead of showing thirteen rows of noise. Password fields are never exposed. Destructive tools
ask a human, in the page, on every single call.

**Five panel designs over one component tree** — every row renders each design's parts and the
stylesheet decides which are visible, so the review logic cannot drift between looks.

## What we learned

**Discovery is the easy half.** Generating tool definitions from markup turned out to be
straightforward. Making a human able to *review* them was the actual product, and it is where most of
the engineering went.

**Measure, don't guess.** The highest-leverage thing built here was a small scanner that runs the
engine against a live URL. Every significant design decision — the two floors, the classifier
rewrites, the ignore rules — came from pointing it at a real page and being wrong.

**A warning that fires wrongly is worse than no warning.** Flagging `search_payments` as sensitive
teaches people to click past the flag that matters, `authorise_payment`.

**Accessibility quality is bimodal.** Public services are excellent, because they were made to be.
Consumer apps with 227 interactive controls can yield nothing at all. The readiness score exists to
say *which* signal is missing rather than just "didn't work".

## What's next for Reflex

- **Teach mode** — record a human performing a multi-step workflow and propose a single higher-level
  capability from it, moving from UI operations to domain actions.
- **Network correlation** — observe the request behind a click and execute against that instead of
  the DOM, for a far more robust executor.
- **A capability graph** — lift discovered operations into entity-level capabilities (a claim can be
  searched, viewed, progressed, withdrawn) and then into workflows.
- **Optional model assistance** for naming genuinely ambiguous candidates — suggesting metadata only,
  never touching execution, which stays deterministic.
- **Native host support.** WebMCP is not in stable Chrome, so Reflex installs a clearly-marked local
  host. All of that lives behind one adapter interface; when a browser ships a real host, it gets
  used and nothing else changes.
