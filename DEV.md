# DEV.md — Complete Developer Guide (Beginner-Friendly)

Welcome! This document explains the entire backend of the **Collection SEO Generator** project in plain language — from the high-level idea all the way down to every important line of code. Even if you are completely new to programming, this guide will teach you what everything does and *why*.

---

## TABLE OF CONTENTS

1. [What is this project?](#1-what-is-this-project)
2. [Key terms for beginners](#2-key-terms-for-beginners)
3. [The tech stack explained](#3-the-tech-stack-explained)
4. [How the whole system flows together](#4-how-the-whole-system-flows-together)
5. [File-by-file deep dives](#5-file-by-file-deep-dives)
   - [backend/index.ts](#51-backendindexts--the-entry-point)
   - [routers/collection/router.ts](#52-routerscollectionrouterts--the-traffic-director)
   - [routers/collection/types.ts](#53-routerscollectiontypests--the-data-shapes-for-incoming-requests)
   - [routers/collection/index.ts](#54-routerscollectionindexts--the-barrel-file)
   - [controllers/collection/controller.ts](#55-controllerscollectioncontrollerts--the-brain)
   - [controllers/collection/types.ts](#56-controllerscollectiontypests--the-controller-data-shapes)
   - [scraper/IScraperClient.ts](#57-scrapericraperclientts--the-scraper-contract)
   - [scraper/scraperClient.ts](#58-scraperscrapeerclientts--the-web-crawling-engine)
   - [ai/IAIClient.ts](#59-aiiiaiclientts--the-ai-contract)
   - [ai/anthropicAIClient.ts](#510-aianthropicaiclientts--the-ai-engine)
6. [Supporting files](#6-supporting-files)

---

## 1. What is this project?

This is a **SEO content generator for e-commerce collection pages**.

Imagine you run an online shop selling hoodies. You have a "Hoodies" collection page on your website. That page needs a good title (h1), an intro paragraph, and a couple of body sections — all optimised for Google search (SEO).

Writing that content by hand for dozens of collections is tedious. This tool automates it:

1. You paste the URL of your collection page (e.g. `yourshop.com/collections/hoodies`).
2. You give it a list of keywords (e.g. "premium hoodies, streetwear hoodies") and some brand guidelines (e.g. "our tone is energetic and youthful").
3. The backend visits that page using a real browser, reads every product link, visits each product page, and grabs product descriptions.
4. It sends those descriptions to an AI model (Claude by Anthropic) and asks it to generate structured SEO content.
5. It sends the content through a second AI pass to make it sound more human and brand-authentic.
6. All of this is streamed live to your browser screen so you can watch it happen step by step.

---

## 2. Key terms for beginners

Before diving into the code, here are the most important words you will see everywhere:

| Term | What it means in plain English |
|---|---|
| **Backend** | The server — the code running on a computer you can't see. It does all the heavy lifting (browsing websites, calling AI, etc.). |
| **Frontend** | The browser app — what the user sees and clicks on (React/Vite in this project). |
| **API** | A set of URLs ("endpoints") that the frontend calls to ask the backend to do things. |
| **HTTP request** | A message sent over the internet. Like a phone call — `GET` is "give me data", `POST` is "here is data, do something with it". |
| **JSON** | JavaScript Object Notation — a text format for sending structured data between computers. Looks like `{ "name": "hoodie", "price": 49 }`. |
| **TypeScript** | JavaScript with "types" — you declare what shape your data must be, and the compiler catches mistakes before your code runs. |
| **Interface** | A TypeScript blueprint. It says "any object that claims to be this type MUST have these exact properties/functions." |
| **Class** | A blueprint for creating objects that bundle data and functions together. |
| **async/await** | A way to write code that waits for slow things (network calls, AI responses) without freezing everything. |
| **Promise** | A JavaScript object that says "I will eventually give you a value — wait for me." |
| **SSE (Server-Sent Events)** | A technique where the server pushes live updates to the browser one by one, like a live ticker. Used here to show crawling progress in real time. |
| **Middleware** | Code that runs on every request before it reaches your route handler. Used for logging, authentication, CORS, etc. |
| **CORS** | Cross-Origin Resource Sharing — a browser security rule. The server must explicitly say which other websites are allowed to talk to it. |
| **Environment variable (.env)** | A secret value stored outside the code (like an API key) so it is never hard-coded. |
| **Playwright** | A library that controls a real Chrome browser from your code — like a robot that can click and read websites. |
| **Zod** | A library for validating data shapes at runtime. Like a bouncer that checks the shape of incoming data before it enters your app. |
| **Hono** | A tiny, fast web framework (similar to Express) that runs on Bun. Handles routing, middleware, and responses. |
| **Bun** | A fast JavaScript/TypeScript runtime (similar to Node.js but faster). Used instead of Node here. |
| **Monorepo** | One git repository that contains multiple projects (here: `backend/` and `frontend/`). |

---

## 3. The tech stack explained

### Runtime: Bun
Think of a "runtime" as the engine that actually runs your TypeScript/JavaScript code. Node.js has been the standard for years, but **Bun** is a newer, significantly faster alternative. It also has a built-in test runner and handles TypeScript natively without extra setup.

### Language: TypeScript
The code is written in TypeScript. TypeScript is just JavaScript with types added on top. Types mean you declare: "this variable must be a string", or "this function must return a number". The TypeScript compiler (`tsc`) reads your code and catches type errors before the code runs. In this project, Bun compiles TypeScript on the fly — no build step needed for development.

### Web framework: Hono
Hono is the framework that turns your TypeScript code into a web server. It:
- Listens on a port (8000 by default).
- Routes incoming HTTP requests to the right function based on the URL path.
- Has a middleware system for adding CORS, request IDs, etc.

### Web scraping: Playwright
Playwright lets the backend control a real headless (invisible) Chrome browser. "Headless" just means Chrome runs without a visible window. This is necessary because many e-commerce sites load product descriptions using JavaScript, so a simple HTTP fetch would not see the content. Playwright waits for JavaScript to execute and then reads the full rendered page.

### AI: Anthropic Claude
The backend calls Anthropic's API to use Claude models. Claude reads product descriptions and generates or rewrites SEO content. Two models are used:
- `claude-haiku-4-5-20251001` — faster, cheaper, used for first draft generation.
- `claude-sonnet-4-20250514` — higher quality, used for humanisation and refinement.

### Validation: Zod
Zod validates the JSON body of every incoming API request. If a required field is missing or the wrong type, Zod rejects the request immediately with a clear error message before any business logic runs.

### Linting/Formatting: Biome
Biome is a tool that enforces code style rules (indentation, quotes, unused variables, etc.) across both the backend and frontend.

---

## 4. How the whole system flows together

Here is the full journey of one "Generate" request:

```
Browser (user clicks "Generate")
  │
  │  POST /collection/generate  { collectionUrl, keywords, brandGuidelines }
  ▼
backend/index.ts
  │  CORS middleware checks the request origin is allowed
  │  requestId middleware attaches a unique ID
  ▼
routers/collection/router.ts  ← route handler for POST /generate
  │  Zod validates the request body shape
  │  Splits keyword string into array
  │  Opens an SSE stream back to browser
  ▼
controllers/collection/controller.ts  ← business logic
  │
  ├─ Step 1: scraper.crawlCollectionPage(url)
  │    → Playwright opens Chrome, visits the collection URL
  │    → Finds all /products/ links on the page
  │    → Handles pagination (Next button)
  │    → Returns list of ProductLink objects
  │
  ├─ Step 2: scraper.crawlProductPages(productLinks)
  │    → For each product link (in batches of 4):
  │         Try Shopify API (.json endpoint) first
  │         Fallback → JSON-LD structured data on page
  │         Fallback → Meta tags (og:description etc.)
  │         Fallback → DOM selectors (.product-description etc.)
  │    → Returns list of CrawlResult objects
  │
  ├─ Step 3: ai.generateDraft(descriptions, keywords, brandGuidelines)
  │    → Sends all descriptions + keywords to Claude Haiku
  │    → Claude returns JSON: { h1, intro, section1, section2 }
  │
  ├─ Step 4: ai.humanizeContent(draft, keywords, brandGuidelines)
  │    → Sends draft to Claude Sonnet for a second rewrite
  │    → Makes it sound less robotic
  │    → Returns HumanizedContent (same shape + changes array)
  │
  └─ Step 5: sendEvent("complete", { draft, humanized, crawledProducts })
       → Final SSE event; browser renders the content

```

Throughout steps 1–5, `sendEvent("progress", {...})` is called to push live updates to the browser.

---

## 5. File-by-file deep dives

---

### 5.1 `backend/index.ts` — The Entry Point

This is the **first file Bun runs**. It creates the web server and wires everything together.

```typescript
import { Hono } from "hono";
```
**Line 1** — Imports the `Hono` class from the hono package. `Hono` is the web framework. Think of it as the skeleton of the server.

```typescript
import { cors } from "hono/cors";
```
**Line 2** — Imports the CORS middleware. CORS is a browser security rule. When your frontend (running on `localhost:5173`) tries to call your backend (running on `localhost:8000`), the browser checks whether the backend permits it. This middleware adds the right HTTP headers to say "yes, you're allowed".

```typescript
import { requestId } from "hono/request-id";
```
**Line 3** — Imports the request ID middleware. This attaches a unique identifier (like a ticket number) to every incoming request. Useful for tracing logs — when something goes wrong, you can search logs by that ID.

```typescript
import { HttpError } from "@/common/errors";
```
**Line 4** — Imports a custom error class. The `@/` prefix is an alias for the `backend/` directory (configured in tsconfig). `HttpError` is a special type of error that includes an HTTP status code (like 404 or 500).

```typescript
import { errResponse, successResponse } from "@/common/response/helpers";
```
**Line 5** — Imports two helper functions that format JSON responses consistently. Every successful response will look like `{ success: true, data: {...} }` and every error like `{ success: false, data: { message: "..." } }`.

```typescript
import { settings } from "@/common/config/settings";
```
**Line 6** — Imports the settings/config object which reads environment variables. Keeps all configuration in one place.

```typescript
import collectionRoute from "@/routers/collection";
```
**Line 7** — Imports the collection router (a set of route handlers for URLs starting with `/collection`). This keeps the server entry point clean.

```typescript
const app = new Hono();
```
**Line 9** — Creates the actual Hono application instance. This is the central object that knows about all routes and middleware. Think of it as building a blank web server.

```typescript
app.use(requestId());
```
**Line 11** — Tells the app: "for EVERY request that comes in, run the requestId middleware first". The `()` calls the function to produce the middleware configuration. After this line, every request will have a unique `x-request-id` header.

```typescript
app.use(
  cors({
    origin: settings.server.corsOrigin,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
```
**Lines 12–19** — Applies CORS middleware globally. Let's unpack each option:
- `origin`: Which website is allowed to call this API. In development it is `http://localhost:5173` (the frontend dev server). Comes from the `.env` file.
- `allowMethods`: Which HTTP verbs are allowed (GET fetches data, POST sends data, DELETE removes data, OPTIONS is a browser "preflight" check before sending data).
- `allowHeaders`: Which request headers are allowed. `Content-Type` tells the server the request body is JSON. `Authorization` is for auth tokens (not used yet but allowed for future use).
- `credentials`: Allows cookies/auth headers to be sent with cross-origin requests.

```typescript
app.onError((err, c) => {
  if (err instanceof HttpError) {
    return errResponse(c, { message: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return errResponse(c, { message: "Internal server error" }, 500);
});
```
**Lines 21–27** — This is a **global error handler**. Normally, if your code throws an error deep in a route handler and nothing catches it, the server would crash or send a confusing response. This handler catches ALL unhandled errors.
- If the error is an `HttpError` (something we explicitly threw, like "this URL is invalid"), it sends the specific message and status code.
- If it is any other unexpected error (a bug), it logs it and returns a generic "Internal server error" with HTTP status 500. This prevents leaking internal error details to the user.

```typescript
app.get("/health", (c) => successResponse(c, { status: "ok" }));
```
**Line 29** — Registers a simple `GET /health` endpoint. This is a "health check" — services like load balancers and Docker periodically ping this URL. If it returns 200 OK, the server is alive. `c` is the Context object — it contains the request and lets you send a response.

```typescript
app.route("/collection", collectionRoute);
```
**Line 30** — Mounts the collection router at the `/collection` path prefix. This means: "any URL that starts with `/collection` should be handled by the `collectionRoute` router." So a request to `/collection/generate` will be handled by the `generate` route inside that router.

```typescript
console.log(`Server running on port ${settings.server.port}`);
```
**Line 32** — A simple log message printed when the server starts. The backtick syntax (template literal) lets you embed variables directly in a string using `${}`.

```typescript
export default {
  port: settings.server.port,
  fetch: app.fetch,
  idleTimeout: 255,
};
```
**Lines 34–38** — This is Bun's server configuration format. Instead of calling `app.listen()`, Bun reads this exported default object:
- `port`: The port number to listen on (8000 by default).
- `fetch`: The function Bun calls for every incoming HTTP request. `app.fetch` is Hono's built-in handler that routes requests through all your middleware and route handlers.
- `idleTimeout: 255`: Maximum seconds a connection can sit idle. Set to the maximum (255) because SSE streams for crawling + AI generation can take a long time and must not be killed early.

---

### 5.2 `routers/collection/router.ts` — The Traffic Director

A router defines which URL paths map to which code. Think of it like a menu that says "if the customer orders X, the kitchen does Y".

```typescript
import { Hono } from "hono";
```
**Line 1** — Imports Hono to create a sub-router (a mini-app that handles only `/collection/*` routes).

```typescript
import { zValidator } from "@hono/zod-validator";
```
**Line 2** — Imports a Hono integration for Zod. This makes it easy to attach a Zod schema to a route so Hono validates the request body automatically.

```typescript
import { streamSSE } from "hono/streaming";
```
**Line 3** — Imports Hono's SSE helper. SSE (Server-Sent Events) is how the server sends a continuous stream of updates to the browser — like a live feed. The browser keeps the connection open and the server pushes "events" (small JSON messages) as things happen.

```typescript
import type { ZodSchema } from "zod";
```
**Line 4** — Imports only the TypeScript *type* `ZodSchema`. The `import type` syntax means this import is erased at runtime — it only exists for type-checking during development. `ZodSchema` is the base type for any Zod validation schema.

```typescript
import { generateCollectionContent, regenerateHumanized, refineContent } from "@/controllers/collection/controller";
```
**Line 5** — Imports the actual business logic functions from the controller. The router's job is only routing — it delegates real work to the controller.

```typescript
import { successResponse, errResponse } from "@/common/response/helpers";
```
**Line 6** — Imports the response formatters.

```typescript
import { GenerateSchema, RegenerateSchema, RefineSchema } from "./types";
```
**Line 7** — Imports Zod schemas defined in the sibling `types.ts` file. These schemas describe the exact shape that request bodies must have.

```typescript
const validate = (schema: ZodSchema) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return errResponse(c, { message: firstIssue?.message || "Validation failed" }, 400);
    }
  });
```
**Lines 9–15** — Defines a reusable `validate` helper function. Let's break it down:
- `validate` takes a Zod schema and returns a Hono middleware function.
- `zValidator("json", schema, callback)` tells Hono to validate the request's JSON body against `schema` before the route handler runs.
- If validation fails (`!result.success`), the callback fires. It grabs the first error message from `result.error.issues[0]` and returns a 400 (Bad Request) error response.
- The `?.` is "optional chaining" — if `firstIssue` is undefined, it falls back to the string `"Validation failed"` instead of crashing.
- HTTP 400 means "the client sent a bad request". It is the correct code for validation errors.

```typescript
const router = new Hono();
```
**Line 17** — Creates a new Hono instance that acts as a sub-router. It will only know about routes under `/collection/`.

```typescript
router.post("/generate", validate(GenerateSchema), async (c) => {
```
**Line 19** — Registers a POST route at `/generate` (which becomes `/collection/generate` once mounted). The `validate(GenerateSchema)` middleware runs first and validates the body. If it passes, `async (c) => { ... }` runs.

```typescript
  const { collectionUrl, keywords, brandGuidelines } = c.req.valid("json");
```
**Line 20** — Reads the validated request body. `c.req.valid("json")` returns the parsed + validated JSON body. Destructuring `{ collectionUrl, keywords, brandGuidelines }` pulls out the three fields we need.

```typescript
  const keywordList = keywords.split(",").map((k) => k.trim()).filter(Boolean);
```
**Line 21** — Converts the keyword string `"premium hoodies, streetwear hoodies"` into an array `["premium hoodies", "streetwear hoodies"]`:
- `.split(",")` — splits the string at every comma.
- `.map((k) => k.trim())` — removes leading/trailing spaces from each keyword.
- `.filter(Boolean)` — removes any empty strings (e.g. if the user typed a trailing comma).

```typescript
  return streamSSE(c, async (stream) => {
```
**Line 23** — Opens an SSE stream. `streamSSE` tells Hono to keep the HTTP connection open and stream events. The `stream` object is used to write events. Everything inside the async callback runs while the connection stays open.

```typescript
    const sendEvent = async (type: string, data: unknown) => {
      await stream.writeSSE({
        event: type,
        data: JSON.stringify(data),
      });
    };
```
**Lines 24–29** — Defines a helper `sendEvent` function that sends a single SSE event.
- `event: type` sets the event name (e.g. `"progress"`, `"draft"`, `"complete"`).
- `data: JSON.stringify(data)` converts whatever JavaScript object/value into a JSON string because SSE only transmits text.
- The browser's `EventSource` API can listen to these named events separately.

```typescript
    try {
      await generateCollectionContent(collectionUrl, keywordList, brandGuidelines, sendEvent);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("SSE stream error:", message);
      await sendEvent("error", { message: `Unexpected error: ${message}` });
    }
```
**Lines 31–37** — Calls the main controller function, passing `sendEvent` so the controller can push live updates. If anything throws an uncaught error, it is caught here, logged, and sent as an `"error"` SSE event to the browser rather than silently disappearing.

```typescript
router.post("/regenerate", validate(RegenerateSchema), async (c) => {
  const { draft, keywords, brandGuidelines } = c.req.valid("json");
  const keywordList = keywords.split(",").map((k) => k.trim()).filter(Boolean);
  try {
    const humanized = await regenerateHumanized(draft, keywordList, brandGuidelines);
    return successResponse(c, { humanized });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errResponse(c, { message: `Humanization failed: ${message}` }, 500);
  }
});
```
**Lines 41–52** — The `/regenerate` endpoint. This is a simple (non-streaming) POST that takes an existing `draft` and runs it through the AI humaniser again. No SSE needed here — it just waits for the AI response and returns it as regular JSON. HTTP 500 is returned if something goes wrong on the server side.

```typescript
router.post("/refine", validate(RefineSchema), async (c) => {
  const { currentContent, feedback, keywords, brandGuidelines, productDescriptions } = c.req.valid("json");
  const keywordList = keywords.split(",").map((k) => k.trim()).filter(Boolean);
  try {
    const refined = await refineContent(currentContent, feedback, keywordList, brandGuidelines, productDescriptions);
    return successResponse(c, { refined });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errResponse(c, { message: `Refinement failed: ${message}` }, 500);
  }
});
```
**Lines 54–65** — The `/refine` endpoint. The user can look at the generated content, type feedback like "make the intro shorter and more punchy", and this endpoint sends that feedback to Claude for targeted edits.

```typescript
export default router;
```
**Line 67** — Exports this router so `index.ts` can import and mount it.

---

### 5.3 `routers/collection/types.ts` — The Data Shapes for Incoming Requests

This file defines exactly what shape of data each API endpoint expects from the client, using Zod schemas.

```typescript
import { z } from "zod";
```
**Line 1** — Imports `z`, the main Zod object. You use `z.string()`, `z.object()`, etc. to build schemas.

```typescript
const CollectionSeoContentSchema = z.object({
  h1: z.string().min(1, "h1 is required"),
  intro: z.string().min(1, "intro is required"),
  section1: z.object({
    h2: z.string().min(1, "section1.h2 is required"),
    content: z.string().min(1, "section1.content is required"),
  }),
  section2: z.object({
    h2: z.string().min(1, "section2.h2 is required"),
    content: z.string().min(1, "section2.content is required"),
  }),
});
```
**Lines 3–14** — Defines the shape of an SEO content object:
- `z.object({...})` means "this must be a JavaScript object with these specific keys".
- `z.string().min(1, "h1 is required")` means "must be a string AND at least 1 character long; if not, show this error message".
- The nested `z.object()` for `section1` and `section2` means each section is itself an object with `h2` and `content` string fields.
- This schema is not exported — it is a private building block used inside this file.

```typescript
export const GenerateSchema = z.object({
  collectionUrl: z.string().url("Must be a valid URL"),
  keywords: z.string().min(1, "At least one keyword is required"),
  brandGuidelines: z.string().min(1, "Brand guidelines are required"),
});
```
**Lines 16–20** — The schema for the `/generate` endpoint body:
- `z.string().url(...)` validates both that it is a string AND that it looks like a real URL (has `https://` etc.).
- `z.string().min(1, ...)` ensures the field is non-empty.
- Exporting with `export const` makes it available in other files.

```typescript
export const RegenerateSchema = z.object({
  draft: CollectionSeoContentSchema,
  keywords: z.string(),
  brandGuidelines: z.string(),
});
```
**Lines 22–26** — The schema for `/regenerate`. Notice `draft` is typed with `CollectionSeoContentSchema` — meaning the client must send a complete SEO content object (the previously generated draft). `keywords` and `brandGuidelines` here do NOT have `.min(1)` so they can be empty strings.

```typescript
export const RefineSchema = z.object({
  currentContent: CollectionSeoContentSchema,
  feedback: z.string().min(1, "Feedback is required"),
  keywords: z.string(),
  brandGuidelines: z.string(),
  productDescriptions: z.array(z.string()).optional().default([]),
});
```
**Lines 28–34** — The schema for `/refine`:
- `feedback` must be non-empty (you must provide a direction for refinement).
- `productDescriptions: z.array(z.string()).optional().default([])` — this field is an array of strings. `.optional()` means it can be omitted from the request entirely. `.default([])` means if it is missing, Zod automatically fills it in as an empty array `[]`.

---

### 5.4 `routers/collection/index.ts` — The Barrel File

```typescript
export { default } from "./router";
```
**Line 1** — This one-line file re-exports the default export from `router.ts`. This is called a "barrel file" or "index file". It exists so other files can import from the *directory* (`@/routers/collection`) rather than a specific file (`@/routers/collection/router`). It is a clean code organisation pattern — the public API of this folder is just its `index.ts`.

---

### 5.5 `controllers/collection/controller.ts` — The Brain

The controller contains the **business logic** — the step-by-step pipeline that actually makes the product work. Routes are thin (just routing); controllers are fat (actual work).

```typescript
import { createAIClient } from "@/common/clients/ai/anthropicAIClient";
import { createScraperClient } from "@/common/clients/scraper/scraperClient";
import type { GeneratedContent, HumanizedContent } from "@/common/clients/ai/IAIClient";
```
**Lines 1–3** — Imports the factory functions for creating AI and scraper client instances, plus TypeScript types for the content shapes.

```typescript
type SendEvent = (type: string, data: unknown) => Promise<void>;
```
**Line 5** — Defines a TypeScript type alias. `SendEvent` is the type of the `sendEvent` function passed from the router. It takes an event type string and arbitrary data, and returns a Promise (because writing to an SSE stream is async). Using a type alias makes function signatures cleaner.

```typescript
function contentTotalLength(content: GeneratedContent): number {
  return [
    content.h1,
    content.intro,
    content.section1.h2,
    content.section1.content,
    content.section2.h2,
    content.section2.content,
  ]
    .map((v) => v.length)
    .reduce((a, b) => a + b, 0);
}
```
**Lines 7–18** — A utility function that counts the total character length of all content fields combined. Used in logging to track how much text was generated.
- Creates an array of all the string fields.
- `.map((v) => v.length)` converts each string to its length (a number).
- `.reduce((a, b) => a + b, 0)` sums all those numbers together, starting from 0.

```typescript
export async function generateCollectionContent(
  collectionUrl: string,
  keywords: string[],
  brandGuidelines: string,
  sendEvent: SendEvent,
): Promise<void> {
```
**Lines 20–25** — The main exported function. It is `async` because it does many slow operations (browser automation, network calls, AI). It returns `Promise<void>` — it does not return a value; instead it sends SSE events throughout its execution.

```typescript
  const startTime = performance.now();
```
**Line 26** — Records the start time for performance measurement. `performance.now()` returns milliseconds since the process started, with sub-millisecond precision.

```typescript
  console.info("[CollectionController] Generate request started", {
    collectionUrl,
    keywordsCount: keywords.length,
    hasBrandGuidelines: Boolean(brandGuidelines?.trim()),
  });
```
**Lines 27–31** — Structured logging. Square bracket prefix `[CollectionController]` makes logs easy to filter. `Boolean(brandGuidelines?.trim())` converts the string to true/false — useful for quickly seeing in logs whether the user provided guidelines.

```typescript
  const scraper = createScraperClient();
  const ai = createAIClient();
```
**Lines 33–34** — Creates fresh instances of the scraper (Playwright browser) and AI client (Anthropic). Factory functions (`createX()`) are used instead of `new X()` directly to make the code more testable and flexible.

```typescript
  try {
    await sendEvent("progress", { stage: "crawling_collection", message: "Loading collection page..." });
```
**Lines 36–38** — Sends the first SSE progress event to the browser. The frontend receives `{ stage: "crawling_collection", message: "Loading collection page..." }` and updates the progress UI. The `stage` field lets the frontend show different icons/colours for different phases.

```typescript
    let productLinks;
    try {
      productLinks = await scraper.crawlCollectionPage(collectionUrl, async (msg) => {
        await sendEvent("progress", { stage: "crawling_collection", message: msg });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await sendEvent("error", { message: `Failed to load collection page: ${message}. Check the URL and try again.` });
      return;
    }
```
**Lines 40–49** — Step 1: Crawl the collection page. Notice the nested try/catch — if scraping fails here (bad URL, site is down), we send a user-friendly error event and `return` early, ending the SSE stream gracefully. The callback `async (msg) => await sendEvent(...)` is a live progress reporter — as Playwright navigates the page it calls this callback with status messages.

```typescript
    if (productLinks.length === 0) {
      await sendEvent("error", {
        message: "No product links found on this page...",
      });
      return;
    }
```
**Lines 51–56** — If no product links were found (maybe the URL was a blog post, not a collection page), we send an error and stop. `return` exits the function, which closes the SSE stream.

```typescript
    const crawlResults = await scraper.crawlProductPages(productLinks, async (msg) => {
      await sendEvent("progress", { stage: "crawling_products", message: msg });
    });
```
**Lines 70–72** — Step 2: Visit each product page. The scraper handles concurrency internally (visits multiple pages at the same time for speed).

```typescript
    const successful = crawlResults.filter((r) => r.success && r.description);
    const failed = crawlResults.filter((r) => !r.success);
    const sourceDistribution = crawlResults.reduce<Record<string, number>>((acc, result) => {
      const key = result.source ?? "none";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
```
**Lines 74–80** — Post-processing crawl results:
- `successful` — products where a description was successfully extracted.
- `failed` — products that failed.
- `sourceDistribution` — counts how many products were extracted via each method (`shopify_api`, `json_ld`, `meta`, `dom`). The `reduce` accumulates these into an object like `{ shopify_api: 12, meta: 3, dom: 1 }`. `result.source ?? "none"` uses the "nullish coalescing" operator — if `source` is null or undefined, use `"none"`.

```typescript
    let draft: GeneratedContent;
    try {
      draft = await ai.generateDraft(
        successful.map((r) => r.description),
        keywords,
        brandGuidelines,
      );
    } catch (err) { ... }
```
**Lines 107–118** — Step 3: Generate an AI draft. Passes only the `description` strings from successful crawl results. `.map((r) => r.description)` extracts just the description from each CrawlResult object.

```typescript
    await sendEvent("draft", { draft });
```
**Line 127** — Sends the raw AI draft to the browser via SSE. The frontend can display it while the humanisation step runs in the background.

```typescript
    let humanized: HumanizedContent;
    try {
      humanized = await ai.humanizeContent(draft, keywords, brandGuidelines);
    } catch (_err) {
      const fallbackHumanized = { ...draft, changes: ["Humanization failed — showing original draft"] };
      await sendEvent("humanized", { humanized: fallbackHumanized, fallback: true });
      ...
      return;
    }
```
**Lines 132–148** — Step 4: Humanise. Notice the fallback: if humanisation fails, the code uses the spread operator (`{ ...draft, changes: [...] }`) to copy the draft object and add a `changes` array with a failure note. The browser still gets usable content — it just shows the unhumanised draft with a warning.

```typescript
    await sendEvent("complete", {
      draft,
      humanized,
      crawledProducts: crawlResults,
      failedUrls: failed.map((f) => f.url),
      totalFound: productLinks.length,
    });
```
**Lines 159–165** — The final `"complete"` event bundles everything: both content versions and all crawl metadata. The frontend uses this to show the final result and any failed-product warnings.

```typescript
  } finally {
    await scraper.close();
  }
```
**Lines 173–175** — The `finally` block runs no matter what — whether the code succeeded, errored, or returned early. It ensures the Playwright browser is always closed to free memory. Without this, the browser process would leak.

```typescript
export async function regenerateHumanized(
  draft: GeneratedContent,
  keywords: string[],
  brandGuidelines: string,
): Promise<HumanizedContent> {
  const ai = createAIClient();
  return ai.humanizeContent(draft, keywords, brandGuidelines);
}
```
**Lines 178–185** — A simple wrapper function for the `/regenerate` endpoint. It creates an AI client and calls humanise directly on a provided draft. Returns the result directly (no streaming).

```typescript
export async function refineContent(
  currentContent: GeneratedContent,
  feedback: string,
  keywords: string[],
  brandGuidelines: string,
  productDescriptions: string[],
): Promise<GeneratedContent> {
  const ai = createAIClient();
  return ai.refineContent(currentContent, feedback, keywords, brandGuidelines, productDescriptions);
}
```
**Lines 187–196** — Another simple wrapper for the `/refine` endpoint.

---

### 5.6 `controllers/collection/types.ts` — The Controller Data Shapes

This file defines TypeScript interfaces describing the shapes of data that flow through the controller.

```typescript
import type { GeneratedContent, HumanizedContent } from "@/common/clients/ai/IAIClient";
import type { CrawlResult } from "@/common/clients/scraper/IScraperClient";
```
**Lines 1–2** — Imports types from the AI and scraper interfaces. Using `import type` means these are purely compile-time types — zero runtime cost.

```typescript
export interface GenerateRequest {
  collectionUrl: string;
  keywords: string;
  brandGuidelines: string;
}
```
**Lines 4–8** — Describes the shape of a generate request body. An `interface` in TypeScript is like a promise: "any object of this type will have exactly these fields with these types". These match exactly what the Zod schema validates.

```typescript
export interface RegenerateRequest {
  draft: GeneratedContent;
  keywords: string;
  brandGuidelines: string;
}
```
**Lines 10–14** — The regenerate request shape. `draft` is typed as `GeneratedContent` (the full SEO content object from the AI interface).

```typescript
export interface GenerateResult {
  draft: GeneratedContent;
  humanized: HumanizedContent;
  crawledProducts: CrawlResult[];
  failedUrls: string[];
  totalFound: number;
}
```
**Lines 16–22** — The shape of the final result sent in the `"complete"` SSE event. `CrawlResult[]` means "an array of CrawlResult objects".

```typescript
export interface SSEEvent {
  type: "progress" | "draft" | "humanized" | "complete" | "error";
  data: unknown;
}
```
**Lines 24–27** — Describes an SSE event. The `type` field uses a **union type** (`"progress" | "draft" | ...`) — it can only be one of those exact string values, nothing else. `data: unknown` means the data payload can be anything.

---

### 5.7 `scraper/IScraperClient.ts` — The Scraper Contract

The `I` prefix stands for "Interface". This file defines the *contract* (the shape) that any scraper must implement. The actual implementation lives in `scraperClient.ts`. Separating contract from implementation is a software design pattern that makes code more flexible and testable.

```typescript
export interface ProductLink {
  url: string;
  title?: string;
}
```
**Lines 1–4** — Represents a single product link found on a collection page:
- `url` — the full URL of the product page (required).
- `title?` — the text of the link (optional — the `?` makes it optional).

```typescript
export type CrawlSource = "shopify_api" | "json_ld" | "meta" | "dom";
```
**Line 6** — A union type representing the four methods the scraper can use to extract a product description, in priority order:
1. `shopify_api` — hit the Shopify JSON API endpoint directly (fastest, most reliable).
2. `json_ld` — read structured data embedded in the page's `<script>` tags.
3. `meta` — read meta description tags in the page's `<head>`.
4. `dom` — search the visible HTML for known CSS class patterns.

```typescript
export interface CrawlResult {
  url: string;
  description: string;
  success: boolean;
  error?: string;
  source?: CrawlSource;
}
```
**Lines 8–14** — The result of crawling one product page:
- `url` — which product page this is for.
- `description` — the extracted text (empty string if failed).
- `success` — true/false flag.
- `error?` — optional error message if it failed.
- `source?` — which extraction method succeeded.

```typescript
export type ProgressCallback = (message: string) => void | Promise<void>;
```
**Line 23** — A type alias for the callback function passed to scraper methods. The scraper calls this as it progresses, and the caller uses it to send SSE events to the browser. `void | Promise<void>` means the callback can be either a normal function or an async function.

```typescript
export interface IScraperClient {
  crawlCollectionPage(
    url: string,
    onProgress: ProgressCallback,
  ): Promise<ProductLink[]>;

  crawlProductPages(
    links: ProductLink[],
    onProgress: ProgressCallback,
  ): Promise<CrawlResult[]>;

  close(): Promise<void>;
}
```
**Lines 25–37** — The scraper interface contract. Any class that says `implements IScraperClient` must provide all three methods:
- `crawlCollectionPage` — visits the collection URL and returns an array of product links found.
- `crawlProductPages` — visits each product link and returns crawl results.
- `close` — closes the browser and frees resources.

---

### 5.8 `scraper/scraperClient.ts` — The Web Crawling Engine

This is the largest and most complex file. It implements `IScraperClient` using Playwright to control a real browser.

```typescript
import { type Browser, type Page, chromium } from "playwright";
```
**Line 1** — Imports `Browser` and `Page` as TypeScript types only (the `type` keyword) plus `chromium` as a real value. `chromium` is Playwright's Chromium (Chrome) launcher.

```typescript
class ScraperClient implements IScraperClient {
  private browser: Browser | null = null;
```
**Lines 11–12** — Declares the class and its one private property:
- `private` means this property cannot be accessed from outside the class.
- `Browser | null` means it can be either a Browser object or null (a "nullable" type).
- `= null` initialises it to null — the browser has not been launched yet.

```typescript
  private readonly blockedDescriptionPatterns = [
    "shipping calculated at checkout",
    "tax included",
    ...
  ];
```
**Lines 14–21** — A list of strings that should disqualify a description candidate. If a product page's description contains "shipping calculated at checkout", it is probably shipping policy text, not a product description. `readonly` means this array cannot be reassigned, though its contents can still be read.

```typescript
  private log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, unknown>): void {
    const payload = context ? ` ${JSON.stringify(context)}` : "";
    const line = `[ScraperClient] ${message}${payload}`;
    switch (level) { ... }
  }
```
**Lines 23–40** — A private logging helper. `Record<string, unknown>` means "an object where keys are strings and values can be anything." The `context ?` syntax checks if `context` was passed — if yes, stringify it as JSON and append it to the log line. Using a switch-case routes the message to the right console method.

```typescript
  private normalizeText(input: string): string {
    return input.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }
```
**Lines 42–44** — Cleans whitespace from text:
- `/\u00A0/g` is a regular expression matching the Unicode non-breaking space character (common in HTML). Replaces it with a regular space.
- `/\s+/g` matches one or more whitespace characters (spaces, tabs, newlines). Replaces any run of whitespace with a single space.
- `.trim()` removes leading and trailing whitespace.

```typescript
  private decodeHtmlEntities(input: string): string {
    return input
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      ...
  }
```
**Lines 46–55** — Converts HTML escape sequences back to their real characters. HTML stores `&` as `&amp;`, `"` as `&quot;`, etc. The `/gi` flag makes the regex case-insensitive (`g` = global, replace all occurrences).

```typescript
  private stripHtml(input: string): string {
    const noScripts = input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
    const noTags = noScripts.replace(/<[^>]+>/g, " ");
    return this.normalizeText(this.decodeHtmlEntities(noTags));
  }
```
**Lines 57–63** — Strips all HTML markup from a string:
- First removes entire `<script>` and `<style>` blocks (they contain code/CSS, not product text).
- Then removes all remaining HTML tags using `/<[^>]+>/g` (matches any `<...>` sequence).
- Then normalises whitespace and decodes HTML entities.

```typescript
  private isStructuralBoundary(text: string): boolean {
    const boundaries = [
      /^(product[\s-]details|standard\s+faqs...)/i,
      ...
    ];
    return boundaries.some((b) => b.test(text));
  }
```
**Lines 79–94** — Checks if a piece of text marks a "structural boundary" — a section heading like "Shipping Policy" or "Size Chart" that signals the end of the product description. If found, the `extractLeadDescription` function stops collecting text. `.some()` returns true if any regex in the array matches.

```typescript
  private extractLeadDescription(bodyHtml: string): string | null {
    const blocks = this.parseHtmlBlocks(bodyHtml);
    const collected: string[] = [];

    for (const block of blocks) {
      if (block.tag.match(/^h[1-6]$/)) continue;
      const text = block.text;
      if (!text || text.length < 5) continue;
      if (this.isStructuralBoundary(text)) break;
      collected.push(text);
      if (collected.join(" ").length > 600) break;
    }
    ...
  }
```
**Lines 96–123** — Extracts the "lead" description from a Shopify product's HTML body:
- `parseHtmlBlocks` splits the HTML into structured blocks (paragraphs, headings, list items).
- Skips heading tags (`h1`–`h6`) since they are labels, not body copy.
- Skips blocks shorter than 5 characters (likely noise).
- Stops at structural boundaries (shipping policy etc.).
- Hard-caps at 600 characters to avoid collecting too much text.
- Returns `null` if the result is less than 20 characters (too short to be useful).

```typescript
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.log("info", "Launching Playwright browser", { headless: true });
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }
```
**Lines 139–145** — A lazy browser launcher. "Lazy" means the browser is only started the first time it is needed, not when the `ScraperClient` is created. Subsequent calls return the already-running browser. `headless: true` means Chrome runs without a visible window (important for server environments).

```typescript
  async crawlCollectionPage(url: string, onProgress: ProgressCallback): Promise<ProductLink[]> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh...) Chrome/131...",
    });
    const page = await context.newPage();
```
**Lines 147–154** — Opens a new browser session:
- `browser.newContext()` creates an isolated browsing session (like opening a private window). Each context has its own cookies, storage, etc.
- `userAgent` makes the browser pretend to be a regular Mac/Chrome user to avoid bot detection by websites.
- `context.newPage()` opens a new tab within that session.

```typescript
    while (true) {
      await onProgress(`Scanning page ${pageNum} for product links...`);
      const links = await this.extractProductLinks(page, url);
      allLinks.push(...links);
      const hasNextPage = await this.goToNextPage(page);
      if (!hasNextPage) break;
      pageNum++;
    }
```
**Lines 167–181** — A pagination loop. It keeps extracting product links from the current page, then tries to click the "Next" pagination button. If there is no next page, the loop breaks. `...links` is the spread operator — it "unpacks" the array and adds each element to `allLinks` individually.

```typescript
  private async extractProductLinks(page: Page, collectionUrl: string): Promise<ProductLink[]> {
    const baseUrl = new URL(collectionUrl).origin;
    return page.evaluate((base: string) => {
      const anchors = document.querySelectorAll("a[href]");
      for (const anchor of anchors) {
        const href = anchor.getAttribute("href");
        ...
        const isProduct = /\/products\//.test(fullUrl) || ...;
        if (isProduct) links.push({ url: fullUrl, title });
      }
      return links;
    }, baseUrl);
  }
```
**Lines 196–228** — Uses `page.evaluate()` to run code inside the browser's JavaScript environment (not in Node.js/Bun). Inside the browser, it uses `document.querySelectorAll` to find all `<a>` tags with `href` attributes, then filters those whose URL contains `/products/` or other product URL patterns. `page.evaluate` bridges the browser world and the Node.js world.

```typescript
  private async goToNextPage(page: Page): Promise<boolean> {
    const nextSelectors = [
      'a[rel="next"]',
      'a:has-text("Next")',
      ".pagination a:last-child",
      ...
    ];
    for (const selector of nextSelectors) {
      const el = await page.$(selector);
      if (!el) continue;
      const isVisible = await el.isVisible();
      if (!isVisible) continue;
      await el.click();
      await page.waitForLoadState("domcontentloaded");
      return true;
    }
    return false;
  }
```
**Lines 230–259** — Tries many different CSS selectors to find a "Next page" button/link. Different e-commerce platforms use different HTML patterns. The function tries each selector in turn, checks if the element exists and is visible, clicks it, waits for the page to load, and returns `true`. If none work, returns `false` (no more pages).

```typescript
  private deduplicateLinks(links: ProductLink[]): ProductLink[] {
    const seen = new Set<string>();
    return links.filter((link) => {
      const normalized = link.url.split("?")[0].replace(/\/$/, "");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }
```
**Lines 261–277** — Removes duplicate product links. A `Set` is a data structure that only stores unique values. For each link:
- `.split("?")[0]` removes query parameters (`?color=red`).
- `.replace(/\/$/, "")` removes trailing slashes.
- If `seen` already has this normalised URL, return `false` (filter it out). Otherwise add it and return `true` (keep it).

```typescript
  async crawlProductPages(links: ProductLink[], onProgress: ProgressCallback): Promise<CrawlResult[]> {
    const concurrency = settings.scraper.concurrency;
    for (let i = 0; i < links.length; i += concurrency) {
      const batch = links.slice(i, i + concurrency);
      const batchPromises = batch.map(async (link, batchIdx) => {
        return this.crawlSingleProduct(browser, link, idx, links.length);
      });
      const batchResults = await Promise.all(batchPromises);
      ...
      await new Promise((r) => setTimeout(r, settings.scraper.delayBetweenRequests));
    }
  }
```
**Lines 279–328** — Crawls all product pages in batches:
- `concurrency` is how many pages to visit simultaneously (default 4). Too many and the target server might rate-limit or block you.
- `links.slice(i, i + concurrency)` cuts a chunk of 4 links at a time.
- `.map(async (link) => ...)` creates a promise for each link in the batch.
- `Promise.all(batchPromises)` runs all promises in the batch in parallel and waits for all to finish.
- `await new Promise((r) => setTimeout(r, delay))` pauses between batches to be polite to the server.

```typescript
  private async fetchShopifyProductDescription(productUrl: string): Promise<string | null> {
    const handle = this.extractShopifyHandle(productUrl);
    const jsonUrl = `${origin}/products/${encodeURIComponent(handle)}.json`;
    const response = await fetch(jsonUrl, { headers: { ... } });
    const data = await response.json() as { product?: { body_html?: string | null } };
    const bodyHtml = data.product?.body_html;
    const lead = this.extractLeadDescription(bodyHtml);
    return lead;
  }
```
**Lines 349–404** — Tries Shopify's undocumented public product JSON endpoint. Any Shopify product at `shop.com/products/my-product` also has a JSON version at `shop.com/products/my-product.json`. This endpoint returns the full product data including `body_html` (the description HTML). This is faster and more reliable than browser scraping when available. The `?.` optional chaining safely navigates possibly-undefined nested properties.

```typescript
  private async crawlSingleProduct(browser, link, index, total): Promise<CrawlResult> {
    // Tier 1: Shopify API
    if (this.isLikelyShopifyProductUrl(link.url)) {
      const shopifyDescription = await this.fetchShopifyProductDescription(link.url);
      if (shopifyDescription) return { url, description: shopifyDescription, success: true, source: "shopify_api" };
    }
    // Tiers 2-4: browser-based
    const page = await context.newPage();
    await page.goto(link.url, { waitUntil: "domcontentloaded", timeout: ... });
    const jsonLdDescription = await this.extractFromJsonLd(page, link.url);
    if (jsonLdDescription) return this.successResult(link.url, jsonLdDescription, "json_ld");
    const metaDescription = await this.extractFromMetaTags(page, link.url);
    if (metaDescription) return this.successResult(link.url, metaDescription, "meta");
    const domDescription = await this.extractFromDom(page, link.url);
    if (domDescription) return this.successResult(link.url, domDescription, "dom");
    return { url: link.url, description: "", success: false, error: "All tiers failed" };
  }
```
**Lines 648–723** — The core product extraction logic with a 4-tier fallback strategy:
1. **Shopify API** (no browser needed — just a JSON fetch).
2. **JSON-LD** (structured `<script>` tags embedded in the page — reliable when present).
3. **Meta tags** (`og:description`, `twitter:description`, `meta[name=description]`).
4. **DOM selectors** (searching for known CSS class patterns used by major e-commerce platforms).

Each tier only runs if the previous one failed. This maximises success rate while minimising the time spent on pages that have easy-to-access data.

```typescript
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
```
**Lines 739–745** — Shuts down the Playwright browser. Setting `this.browser = null` after closing ensures the object is garbage collected and the `getBrowser()` lazy check works correctly if somehow called again.

```typescript
export const createScraperClient = (): IScraperClient => new ScraperClient();
```
**Line 748** — The factory function. Returns a new `ScraperClient` instance typed as `IScraperClient` (the interface). Callers only see the interface, not the concrete class — this means you could swap `ScraperClient` for a different implementation (e.g. a mock for testing) without changing any calling code.

---

### 5.9 `ai/IAIClient.ts` — The AI Contract

Like the scraper interface, this defines the shape any AI client must implement.

```typescript
export interface CollectionSEOSection {
  h2: string;
  content: string;
}
```
**Lines 1–4** — One SEO section: a subheading (`h2`) and a body paragraph (`content`).

```typescript
export interface CollectionSEOContent {
  h1: string;
  intro: string;
  section1: CollectionSEOSection;
  section2: CollectionSEOSection;
}
```
**Lines 6–11** — The full SEO content structure. This is the shape Claude is asked to produce: one main heading, one intro, and two body sections.

```typescript
export interface GeneratedContent extends CollectionSEOContent {}
```
**Line 13** — `GeneratedContent` extends `CollectionSEOContent` — it inherits all fields. The empty `{}` body means no additional fields. This separate interface exists to give the type a distinct semantic name even though its shape is identical. Keeping them separate means you can add fields to one without affecting the other in the future.

```typescript
export interface HumanizedContent extends CollectionSEOContent {
  changes: string[];
}
```
**Lines 15–17** — `HumanizedContent` extends `CollectionSEOContent` and adds a `changes` array. This array contains a list of the specific edits Claude made during humanisation (e.g. "Made the intro more conversational").

```typescript
export interface IAIClient {
  generateDraft(productDescriptions: string[], keywords: string[], brandGuidelines: string): Promise<GeneratedContent>;
  humanizeContent(draft: GeneratedContent, keywords: string[], brandGuidelines: string): Promise<HumanizedContent>;
  refineContent(currentContent: GeneratedContent, feedback: string, keywords: string[], brandGuidelines: string, productDescriptions: string[]): Promise<GeneratedContent>;
}
```
**Lines 19–39** — The AI client contract with three methods:
- `generateDraft` — first-pass generation from product descriptions.
- `humanizeContent` — second-pass rewriting to sound less robotic.
- `refineContent` — targeted edits based on user feedback.

---

### 5.10 `ai/anthropicAIClient.ts` — The AI Engine

This implements `IAIClient` using Anthropic's Claude API.

```typescript
import Anthropic from "@anthropic-ai/sdk";
```
**Line 1** — Imports Anthropic's official JavaScript SDK. This SDK wraps the raw HTTP API calls into clean TypeScript functions.

```typescript
class AnthropicAIClient implements IAIClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: settings.anthropic.apiKey });
  }
```
**Lines 5–10** — Creates the class and connects to Anthropic in the constructor. The constructor runs once when `new AnthropicAIClient()` is called. `settings.anthropic.apiKey` reads the API key from the `.env` file via `settings.ts`.

```typescript
  private parseJSON<T>(text: string): T {
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned) as T;
  }
```
**Lines 44–50** — A JSON parser that handles AI output quirks. AI models sometimes wrap their JSON in markdown code fences (` ```json ... ``` `). This strips those out before parsing. `<T>` makes the function generic — the caller specifies what type to expect.

```typescript
  private assertGeneratedContentShape(value: unknown): asserts value is GeneratedContent {
    if (!value || typeof value !== "object") throw new Error("AI response is not an object");
    const obj = value as Record<string, unknown>;
    const hasString = (key: string) => typeof obj[key] === "string" && (obj[key] as string).trim().length > 0;
    if (!hasString("h1")) throw new Error("AI response missing non-empty h1");
    ...
  }
```
**Lines 52–79** — A runtime type guard that verifies Claude's JSON response has the expected shape. `asserts value is GeneratedContent` is a TypeScript type predicate — if the function does not throw, TypeScript knows that `value` is `GeneratedContent`. This is critical because Claude's output is just text — we must validate it before treating it as structured data.

```typescript
  async generateDraft(productDescriptions: string[], keywords: string[], brandGuidelines: string): Promise<GeneratedContent> {
    const descriptionsText = productDescriptions
      .map((d, i) => `Product ${i + 1}:\n${d}`)
      .join("\n\n---\n\n");

    const prompt = `You are an expert ecommerce SEO strategist...
## Product Descriptions:
${descriptionsText}
...
## Output Format:
Respond with ONLY valid JSON...`;
```
**Lines 89–129** — Builds the prompt to send to Claude. Template literals (backticks) allow multi-line strings. The descriptions are formatted as numbered products separated by `---` dividers for clarity. The prompt instructs Claude to respond with only JSON in a specific shape.

```typescript
    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
```
**Lines 137–141** — Sends the prompt to Anthropic's API:
- `model` — which Claude model to use. Haiku is the fastest, cheapest option.
- `max_tokens` — maximum length of Claude's response in tokens (roughly 4 chars each). 1200 tokens ≈ ~900 words.
- `messages` — an array of conversation turns. Here there is just one user message.

```typescript
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = this.parseJSON<unknown>(text);
    this.assertGeneratedContentShape(parsed);
    return parsed;
```
**Lines 144–147** — Extracts the text from the response (content[0] is the first content block), parses it as JSON, validates the shape, and returns it. The ternary `condition ? valueIfTrue : valueIfFalse` safely handles the (unlikely) case where the response isn't text.

```typescript
  async humanizeContent(draft: GeneratedContent, keywords: string[], brandGuidelines: string): Promise<HumanizedContent> {
    const prompt = `You are a senior ecommerce copywriter...
## Draft to Humanize (JSON):
${JSON.stringify(draft, null, 2)}
...`;
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      ...
    });
    ...
    this.assertHumanizedContentShape(parsed);
    return parsed;
  }
```
**Lines 159–212** — Similar to `generateDraft` but:
- Uses a different model (`claude-sonnet-4`) — higher quality, better at nuanced rewriting.
- Sends the full draft JSON to Claude for rewriting.
- Validates the response shape with `assertHumanizedContentShape` (which checks for the extra `changes` array).

```typescript
  async refineContent(currentContent, feedback, keywords, brandGuidelines, productDescriptions): Promise<GeneratedContent> {
    const descriptionsContext = productDescriptions.length > 0
      ? `\n\n## Product Descriptions for Reference:\n${...}`
      : "";
    const prompt = `...
## Current Structured Content (JSON):
${JSON.stringify(currentContent, null, 2)}
## User Feedback:
${feedback}
...`;
```
**Lines 214–275** — The refinement method. Key differences:
- Includes the user's `feedback` verbatim in the prompt.
- Conditionally includes product descriptions for reference context (using a ternary: `condition ? valueIfTrue : ""`).
- Returns `GeneratedContent` (no `changes` array — the user can see their own feedback).

```typescript
export const createAIClient = (): IAIClient => new AnthropicAIClient();
```
**Line 278** — Same factory pattern as the scraper. Returns the concrete class typed as the interface.

---

## 6. Supporting files

### `common/config/settings.ts`

Reads all configuration from environment variables:
- `readFileSync` reads the `.env` file from disk on startup.
- Parses `KEY=VALUE` lines manually (splitting on `=`).
- Always overrides — `.env` is the source of truth.
- `required(key)` throws at startup if a critical variable (like `ANTHROPIC_API_KEY`) is missing, preventing confusing runtime failures later.
- `settings.anthropic.apiKey` uses a `get` accessor so it is evaluated lazily — only when first accessed, not at import time. This prevents the "missing key" error during testing before a real server starts.

### `common/errors/index.ts`

```typescript
export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
```
A custom error class. `extends Error` means it inherits all JavaScript Error behaviour (stack traces, `instanceof` checks). It adds a `status` field so the global error handler in `index.ts` knows which HTTP status code to send.

### `common/response/helpers.ts`

Two simple functions that standardise all API responses:
- `successResponse(c, data, status = 200)` — always returns `{ success: true, data: ... }`.
- `errResponse(c, data, status = 400)` — always returns `{ success: false, data: { message: ... } }`.

Consistent response shapes make the frontend's job simpler — it always knows what to expect.

### `common/response/types.ts`

TypeScript interfaces mirroring the response helper shapes (`ApiSuccessResponse<T>` and `ApiErrorResponse`). The `<T>` generic makes `ApiSuccessResponse` work for any data type.

---

## Summary: How it all fits together

```
index.ts
  registers middleware (CORS, requestId)
  registers routes via routers/collection/index.ts
  exports Bun server config

routers/collection/router.ts
  POST /generate  → validates with GenerateSchema → calls controller.generateCollectionContent → SSE stream
  POST /regenerate → validates with RegenerateSchema → calls controller.regenerateHumanized → JSON
  POST /refine    → validates with RefineSchema → calls controller.refineContent → JSON

controllers/collection/controller.ts
  generateCollectionContent()
    createScraperClient() → crawlCollectionPage() → crawlProductPages()
    createAIClient()      → generateDraft() → humanizeContent()
    sends SSE events throughout via sendEvent()

scraper/scraperClient.ts (implements IScraperClient)
  crawlCollectionPage()  → Playwright → pagination loop → returns ProductLink[]
  crawlProductPages()    → batch processing → 4-tier extraction → returns CrawlResult[]
  close()                → shuts down browser

ai/anthropicAIClient.ts (implements IAIClient)
  generateDraft()        → Claude Haiku  → returns GeneratedContent
  humanizeContent()      → Claude Sonnet → returns HumanizedContent
  refineContent()        → Claude Sonnet → returns GeneratedContent
```

Every layer only knows about the layer immediately below it through an **interface**. The router talks to the controller. The controller talks to `IScraperClient` and `IAIClient`. The real implementations (`ScraperClient`, `AnthropicAIClient`) are hidden behind those interfaces. This is called **dependency inversion** — a core principle of good software design.
