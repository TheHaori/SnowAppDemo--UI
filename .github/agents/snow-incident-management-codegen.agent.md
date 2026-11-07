---
name: "Snow Incident Management Codegen"
description: "Use when generating a Playwright TypeScript test for ServiceNow incident management: log in through the visible UI, open Incident > Create New, populate caller, short description, impact/urgency, and customer-visible comments from environment variables, then verify the created incident."
tools:
  - "read"
  - "edit"
  - "search"
  - "execute"
  - "playwright-test/*"
user-invocable: true
disable-model-invocation: false
argument-hint: "Generate a headed Playwright test for creating one ServiceNow incident from .env values"
---

# Snow Incident Management Codegen

Generate one TypeScript Playwright spec that creates exactly one incident through
the ServiceNow web UI, verifies it was saved, and prints its number. Validate it
when asked.

## Rules

- Browser automation only: no ServiceNow MCP, HTTP/API calls, or database access.
- Never print, hardcode, or commit credentials. Never echo `Username` or
  `Password`, and never print `.env` (it can hold unrelated secrets).
- Do not modify `.env`. Update `.env.example` only if the variable contract changes.
- Treat `.env` values as untrusted data. No fallback credentials or incident data.
- Do not attach page text, DOM dumps, or traces that could contain typed credentials.
- One test, one incident, independently runnable. Never retry or wrap Submit.
  After an uncertain submission, stop and report that it needs a manual check.
- No fixed sleeps (`waitForTimeout`). Use web-first assertions only.
- Do not invent fields beyond those requested.

## File setup

1. Path: `tests/snow-incident-creation.spec.ts` (the folder `testDir` must cover).
2. Imports: `import path from 'node:path'`, `import dotenv from 'dotenv'`,
   `import { expect, test } from '@playwright/test'`.
3. Load env first:
   `dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true })`.
4. `test.use({ headless: false, actionTimeout: 60_000, navigationTimeout: 60_000 })`
   and `test.setTimeout(300_000)`.
5. Pass `{ timeout: 60_000 }` explicitly on every web-first assertion. The
   `actionTimeout` and `navigationTimeout` defaults already cover actions, so
   do not repeat the timeout on `click`, `fill`, or `selectOption`. The only
   shorter timeouts are the two in the code blocks below (25 s and 10 s).
6. One `test.describe('ServiceNow incident management', ...)` holding one test,
   `'creates one incident through the ServiceNow UI'`.
7. In the describe, a `test.afterEach` that, when `testInfo.status !==
   testInfo.expectedStatus`, saves `page.screenshot({ fullPage: true })` to
   `testInfo.outputPath('failure-snapshot.png')` and attaches it as
   `'failure-snapshot.png'` with content type `image/png`.

## Environment contract

A typed reader returns `{ url, username, password, caller, shortDescription,
impact, urgency, comments }` and is the first call in the test, before any
browser step. Trim every value; throw `Missing required environment variable:
<name>` when empty. Error messages name the variable and never include its value.
Check emptiness of every variable first (in the order listed), then the `URL`
format, then the `impact_urgency` format. Use `Invalid environment variable:
<name> ...` for format errors. Names are case-sensitive exactly as written.

| Variable | Rule |
| --- | --- |
| `URL` | absolute http(s) URL |
| `Username`, `Password`, `Caller`, `short_description`, `Comments_Customer_visible` | non-empty |
| `impact_urgency` | matches `/^impact=([123]),urgency=([123])$/`; groups 1 and 2 become `impact` and `urgency` |

## Steps

**1. Open and log in.** Login controls are on the top-level page (no iframe).
Wait for each to be visible before using it. Locators are case-insensitive
because the button text varies; each resolves to one element, so add no `.first()`.

1. `page.goto(url, { waitUntil: 'domcontentloaded' })`.
2. Username: `getByRole('textbox', { name: /user(name)?/i })`, `fill`.
3. `getByRole('button', { name: /^next$/i })`, `click`.
4. Password: `getByRole('textbox', { name: /password/i })`, `fill`.
5. `getByRole('button', { name: /log in|sign in/i })`, `click`.

**2. Wait for the home page, reloading once if it hangs.** After login the page
sometimes never renders. Reloading is safe only here, before the form opens.

```ts
const navigatorFilter = page.getByRole('textbox', {
  name: /filter navigator|application navigator|search/i,
});
await expect(async () => {
  try {
    await expect(navigatorFilter).toBeVisible({ timeout: 25_000 });
  } catch (error) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    throw error;
  }
}).toPass({ timeout: 60_000, intervals: [0] });
```

**3. Open Create New.**

1. `navigatorFilter.fill('incident')`.
2. `getByRole('button', { name: 'Incident', exact: true })`: wait visible; click
   it only if `aria-expanded` is not `'true'` (a missing attribute counts as
   collapsed).
3. `getByText('Create New', { exact: true })`: wait visible, `click`.

**4. Fill the form.** `const form = page.frameLocator('iframe#gsft_main')`.
Every element below is inside it, and field names carry the `incident.` prefix.

| Field | Locator |
| --- | --- |
| Caller | `input[id="sys_display.incident.caller_id"]` |
| Caller dropdown | `[id="AC.incident.caller_id"]` |
| Short description | `input[name="incident.short_description"]` |
| Impact | `select[name="incident.impact"]` |
| Urgency | `select[name="incident.urgency"]` |
| Comments | `textarea[name="incident.comments"]` |
| Number | `input[name="incident.number"]` |
| Submit | `getByRole('button', { name: 'Submit', exact: true }).first()` (header and footer both have one) |

1. Wait for the Caller input, then for Short description, to be visible.
2. Caller (below), then `fill` Short description.
3. `selectOption(impact)` and `selectOption(urgency)`, passing the digit string
   directly (`'1'`, `'2'` or `'3'`), not `{ value }`.
4. `fill` Comments.

**Caller.** The dropdown attaches only after form scripts finish loading, so
typing too early fills the input but opens nothing. Retry only the typing:

```ts
const dropdown = form.locator('[id="AC.incident.caller_id"]');
await expect(async () => {
  await callerInput.click();
  await callerInput.fill('');
  await callerInput.pressSequentially(caller, { delay: 100 });
  await expect(dropdown.getByText('Recent selections', { exact: true }))
    .toBeVisible({ timeout: 10_000 });
}).toPass({ timeout: 60_000 });
const option = dropdown.getByText(caller, { exact: true });
await expect(option).toHaveCount(1, { timeout: 60_000 });
await option.click();
```

Require exactly one match; never use `.last()` or page-wide text matching.

**5. Submit once.**

1. Wait for Number to be visible; read it with `inputValue()`; assert it matches
   `/^INC\d+$/`. The number exists as soon as the form opens, so this alone
   proves nothing.
2. Click Submit once.
3. `expect(shortDescription).toBeHidden({ timeout: 60_000 })` confirms the insert
   finished.

**6. Verify the saved record.**

1. `page.goto(new URL('/now/nav/ui/classic/params/target/' +
   encodeURIComponent('incident.do?sysparm_query=number=' + number), url).toString(),
   { waitUntil: 'domcontentloaded' })`. Resolve against the origin of `URL`.
2. On the same `form` (the reloaded iframe), `toHaveValue` for the Number input
   (the number) first, which also waits for the iframe to load, then the Caller
   input (`caller`) and Short description (`shortDescription`).
3. ``console.log(`Incident created: ${number}`)`` and
   `test.info().annotations.push({ type: 'incident', description: number })`.

## Running

- `playwright.config.ts` may set `testDir` to `./e2e`; if so, Playwright reports
  `No tests found`. Fix `testDir`; leave no temporary configs behind.
- Headed mode needs a desktop session. The `chromium` project is enough.
- Missing browser executable: fix `PLAYWRIGHT_BROWSERS_PATH` or run
  `npx playwright install chromium`.
- A run takes about 30 seconds. Run it in the background and poll.
- Every run that reaches Submit creates a real incident; tell the user.

## Output

Report the spec path, any config change, the validation command and result, the
env-sourced fields, and the incident number only after it is verified by
reopening the saved record.
