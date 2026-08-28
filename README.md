# Reflex

**Agentify the web you already use.**

Reflex is a Chrome extension that reads an existing website's forms, buttons and
accessibility metadata, proposes WebMCP tools from what it finds, and — once a
human approves them — registers those tools so an agent can drive the site
through a structured interface instead of by clicking pixels.

> Websites already describe much of their functionality through forms, semantic
> HTML and accessibility metadata. Reflex turns those existing semantics into
> candidate WebMCP tools, lets people review them, and exposes approved
> capabilities to agents.

Reflex is not a replacement for a WebMCP implementation written by a site's own
developers. It is a migration path for the applications that already exist.

---

## What it does

```
Existing website
       ↓  DOM + ARIA + semantic HTML
Capability discovery
       ↓  tool name, description, JSON Schema
Confidence + risk analysis
       ↓
Human review            ← nothing is registered without this
       ↓
WebMCP registration
       ↓
Agent
```

A form like this:

```html
<form aria-label="Search employees" aria-description="Find an employee by name or email">
  <label for="employee-query">Employee name or email</label>
  <input id="employee-query" name="query" type="text" required />
  <button type="submit">Search</button>
</form>
```

becomes this, with the ARIA attributes recorded as the evidence for each part:

```json
{
  "name": "search_employees",
  "title": "Search employees",
  "description": "Find an employee by name or email.",
  "inputSchema": {
    "type": "object",
    "properties": { "query": { "type": "string", "description": "Employee name or email" } },
    "required": ["query"],
    "additionalProperties": false
  },
  "risk": "read",
  "confidence": 100
}
```

Calling the tool sets the field, dispatches `input`/`change`, calls
`form.requestSubmit()`, and returns the text of the region the form updates — so
a read-only tool returns data, not just "submitted".

---

## Try it in five minutes

```bash
npm install
npm run build:extension     # → apps/extension/dist
npm run dev:demo            # → http://localhost:3000/employees
```

Then load the extension:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select `apps/extension/dist`
4. Open <http://localhost:3000/employees> and click the Reflex toolbar button

You should see an **Agent readiness** score and five discovered capabilities.
Click one to inspect its evidence, schema and risk, then **Enable tool**. The
badge on the toolbar button counts active tools, and a small **REFLEX TOOLS**
panel appears in the page.

That panel is a stand-in for a WebMCP client: no shipping browser exposes WebMCP
yet, so it lists exactly what Reflex registered and lets you call it with JSON
arguments. Try `search_employees` with `{"query": "Sarah Chen"}` and watch the
application's own UI respond.

### The demo walkthrough

On <http://localhost:3000/employees/E-482> (Sarah Chen):

| Capability | Risk | What it does |
| --- | --- | --- |
| `list_employee_applications` | read | Lists what she can access |
| `change_department` | write | Moves her to another department |
| `assign_application` | write | Grants an application |
| `revoke_application_access` | destructive | Removes one — asks you first |
| `reset_password` | sensitive | Emails a reset link |
| `deactivate_employee` | destructive | Blocks sign-in |

Enable `list_employee_applications` and `change_department`, then move Sarah to
Finance through the tool. The page updates as if a person had done it, because a
person's interface is exactly what was driven.

### On real websites

Reflex works on production sites, not only the demo. Measured with
`npm run scan -- <url>`:

| Site | Readiness | Discovered |
| --- | --- | --- |
| [GOV.UK search](https://www.gov.uk/search/all) | 95% | `site_wide(keywords)`, plus a 10-parameter filter form |
| [NHS pharmacy finder](https://www.nhs.uk/service-search/pharmacy/find-a-pharmacy) | 90% | `find_a_pharmacy(Location)` |
| [Companies House](https://find-and-update.company-information.service.gov.uk/) | 89% | `search_the_register(q)` |
| [Wikipedia](https://en.wikipedia.org/wiki/Main_Page) | 82% | `searchform(search)` — named from an `id`, so worth renaming |
| [GitHub advanced search](https://github.com/search/advanced) | 72% | `search_form(…)` with **25** parameters |
| [Hacker News](https://news.ycombinator.com/) | 50% | nothing — forms without accessible names |
| [OrangeHRM demo](https://opensource-demo.orangehrmlive.com/) | 39% | nothing — placeholder-only labels |

All three of the top sites were verified end to end: approve the tool, call it
through `navigator.modelContext`, and the site performs the real search. Their
Content-Security-Policy is no obstacle — the extension injects through Chrome's
privileged path rather than a script tag.

The lower scores are the honest half of the story, and they are what the
readiness breakdown is for: it tells you *which* signal is missing (accessible
names, form quality) rather than just that a page did not work.

---

## Repository layout

```
reflex/
├── apps/
│   ├── extension/          Chrome extension (Manifest V3)
│   └── demo-legacy-app/    ACME Employee Manager — the fictional legacy app
├── packages/
│   ├── capability-model/   CapabilityCandidate, schema and message types
│   ├── discovery-engine/   scanners, ARIA/label resolution, risk, confidence
│   ├── schema-generator/   HTML form controls → JSON Schema
│   └── webmcp-adapter/     the only code that touches modelContext, + executor
└── tests/
    ├── unit/               Vitest (jsdom)
    └── e2e/                Playwright, against the real built extension
```

The discovery engine has no extension dependencies, so it can be reused outside
Reflex.

### Commands

| Command | What it does |
| --- | --- |
| `npm run build:extension` | Build the extension into `apps/extension/dist` |
| `npm run dev:demo` | Serve the demo app on port 3000 |
| `npm test` | Unit tests (jsdom) |
| `npm run test:e2e` | End-to-end tests in real Chrome |
| `npm run typecheck` | Typecheck every workspace |
| `npm run scan -- <url>` | Point the discovery engine at any live page and print what it finds |

---

## How it is put together

### Two worlds

A Chrome content script cannot reach the page's own JavaScript, and
`navigator.modelContext` lives there. So Reflex is split:

```
Content script (isolated world)        Page runtime (page world)
  DOM discovery                          WebMCP registration
  user decisions + storage      ⇄        tool execution
  mutation observer                      the tool console
                            window.postMessage
```

Everything crossing between them is a typed message on the `reflex/v1` channel.
The content script never touches WebMCP; the page runtime never decides
anything.

### Discovery

| Signal | Used for |
| --- | --- |
| `aria-label`, `aria-labelledby` | tool name and title |
| `aria-description`, `aria-describedby` | tool description |
| `<label for>`, wrapping `<label>` | parameter descriptions |
| `type`, `required`, `min`/`max`, `pattern`, `<option>` | JSON Schema |
| `aria-controls`, live regions | what the tool returns |
| verb keywords | risk classification |

Names resolve in priority order (`aria-label` → `aria-labelledby` →
heading/legend → visible text → `name` → `id`), and every candidate carries the
evidence that produced it, so a reviewer can see *why* Reflex proposed
something rather than taking its word.

Generic interface mechanics are dropped: "Close", "Toggle sidebar", "Next page"
and friends never become tools. An agent should invoke a business capability,
not operate incidental UI.

### Confidence and risk

Confidence is an additive heuristic over those signals, capped at 100:
`aria-label` +30, `aria-description` +20, labelled fields +15, semantic form
+15, named inputs +10, explicit button text +10, field help text +10, and −20 if
a form declares fields but exposes none. Below 50 a candidate is not shown at
all.

Risk is keyword-based and checked most-dangerous-first, so "Search and revoke
access" is destructive, not read. Unknown verbs default to `write`. Risk is
advisory — you can correct it in the inspector before enabling a tool — but
`destructive` and `sensitive` are never enabled in bulk.

### Execution, and failing closed

Every candidate stores a selector *and* a semantic fingerprint (tag, role,
accessible name, expected field names). Before actuating anything, Reflex
re-locates the element and re-checks the fingerprint. If the form lost a field,
or the button's accessible name changed, execution stops with an error instead
of clicking whatever now sits at that selector.

Values are set through the native property setters and followed by `input` and
`change` events, so frameworks notice; submission prefers
`form.requestSubmit()`.

---

## Safety and privacy

- **Nothing registers itself.** Every tool needs an explicit human approval.
- **Approvals are scoped by origin** and stored in `chrome.storage.local`. A
  tool approved on one site never appears on another — including the same app
  served from a different host.
- **Destructive calls ask again, in the page,** every time an agent invokes them.
- **Password fields are never exposed.** A form containing one has that field
  omitted from the schema and its risk escalated to `sensitive`.
- **Discovery is local.** No page content, DOM, form values or account data
  leaves the browser. Reflex has no backend, and the MVP uses no model at all —
  discovery is deterministic rules over markup.
- **Minimal permissions:** `activeTab`, `scripting`, `storage`. No host
  permissions: Reflex only reads a page when you open it there.

---

## WebMCP hosts

WebMCP is experimental and not in stable Chrome. `packages/webmcp-adapter` is
the only place that knows this: it probes `navigator.modelContext` then
`document.modelContext`, supports both `registerTool` and `provideContext`
styles, and — when the browser offers nothing — installs a local host marked
`__reflexShim: true` so approved tools are still real and callable. The popup
says plainly which of those is in play.

When a browser ships a native host, the adapter uses it and nothing else in the
codebase changes.

---

## Limits

Reflex discovers agent capabilities in *compatible* web applications. It does
not work on every website, and accessibility metadata is not the same thing as
a WebMCP contract — it is evidence for one. Generated tools can be wrong, which
is why human review is part of the product rather than a setting.

**Multi-page applications.** When a tool submits a form that navigates the
page, execution returns promptly with `observed.navigating: true` rather than
waiting for a result it can never read — but the old document takes its
registered tools with it. Because Reflex holds no host permissions, the new page
starts blank until you open Reflex on it again. Single-page applications keep
their tools across in-app navigation.

Out of scope in this MVP: network/API inference, OpenAPI or GraphQL discovery,
framework state reverse-engineering, multi-page workflow recording, canvas
applications, cross-origin iframes, and sites with deliberate anti-automation
controls.

---

## Tests

```bash
npm test          # 149 unit tests (jsdom): naming, ARIA, labels, schema, risk,
                  # ignore rules, selectors, fingerprints, scanners, adapter,
                  # execution, plus discovery against the demo app's own markup
npm run test:e2e  # 16 tests in a real browser, against the built extension
```

The e2e suite needs Playwright's Chromium once:

```bash
npx playwright install chromium
```

Stable Chrome no longer honours `--load-extension`, so these tests use
Chromium. (`REFLEX_E2E_EXECUTABLE=/path/to/Chromium` points them at a build you
already have.)

They stage a copy of the built extension with one change — a host permission for
`localhost:3000`, standing in for the click that would otherwise grant
`activeTab` — then inject Reflex exactly as the popup does, approve capabilities
through the real message protocol, drive the real popup UI, and call the
registered tools the way a WebMCP client would: `navigator.modelContext
.callTool('change_department', { department: 'finance' })`.
