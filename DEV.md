# Developer Documentation (DEV.md)

This document provides an in-depth look at the technical architecture, directory structure, and implementation details of the Collection SEO Generator.

## 🏗️ Architectural Overview

The project follows a **Content Generation Pipeline** orchestrated through a monorepo structure. The core flow is:
`Collection Page URL` -> `Product Scraper (Playwright)` -> `AI Drafter (Anthropic)` -> `Humanizer (Anthropic)` -> `Final SEO Content`.

### Key Technical Patterns
- **Monorepo**: Shared TypeScript configurations and a unified workspace for backend and frontend.
- **SSE (Server-Sent Events)**: Used for real-time streaming of crawling and generation progress from the backend to the frontend.
- **Abstracted AI Clients**: The backend uses an interface-based approach (`IAIClient.ts`) to allow for easy switching or upgrading of AI models.
- **Resilient Scraping**: Implements concurrency limits and delays to avoid rate-limiting while crawling product pages.

---

## 📂 Project Structure

### Root Directory
- `backend/`: Core logic, API, and scraping engine.
- `frontend/`: React-based user dashboard.
- `package.json`: Workspace configuration.
- `biome.json`: Unified linting and formatting rules.

---

### Backend (`/backend`)

The backend is a **Hono** application running on **Bun**.

- **`common/`**: Shared utilities and clients.
    - **`clients/`**:
        - `ai/`: Contains `anthropicAIClient.ts` (Claude integration) and `IAIClient.ts` (Interface).
        - `scraper/`: Contains `scraperClient.ts` (Playwright implementation) and `IScraperClient.ts`.
    - **`config/`**: `settings.ts` handles environment variable loading and typed configuration.
    - **`errors/`**: Custom HTTP error classes for consistent error handling.
    - **`response/`**: Helper functions for API response formatting.
- **`controllers/`**:
    - `collection/`: Main business logic for the generation pipeline (`controller.ts`).
- **`routers/`**:
    - `collection/`: Route definitions for generation, regeneration, and refinement.
- **`index.ts`**: Application entry point, CORS setup, and SSE stream handling.

---

### Frontend (`/frontend`)

A **Vite + React** application using **Tailwind CSS**.

- **`src/`**:
    - **`common/`**: Global reusable logic.
        - `api/`: API constants and base URLs.
        - `utils/`: UI-related utilities (e.g., Tailwind class merging).
    - **`features/`**: Domain-driven feature modules.
        - `generator/`: The primary feature of the app.
            - **`components/`**: Atomic UI parts (InputForm, ProgressIndicator, ContentOutput, etc.).
            - **`pages/`**: `GeneratorPage.tsx` - The main orchestrator of the frontend state and SSE stream.
            - **`types/`**: Shared TypeScript interfaces for the generator domain.
    - **`App.tsx`**: Main component layout.
    - **`main.tsx`**: React DOM entry point.

---

## 🚀 Technical Implementation Details

### Real-time Streaming (SSE)
The `/collection/generate` endpoint returns a `ReadableStream`. The backend sends `event: progress`, `event: draft`, `event: humanized`, and `event: complete`. The frontend's `GeneratorPage.tsx` uses the `ReadableStream` API to decode and react to these events in real-time.

### Scraper Strategy
The scraper visits the collection page, identifies product links using CSS selector heuristics, and then visits each link concurrently (up to a limit defined in `settings.ts`). It extracts descriptions specifically optimized for SEO relevance.

### AI Humanization
After a draft is generated, a second AI pass ("Humanization") is performed. This pass takes the raw SEO-optimized draft and re-tones it based on user-provided **Brand Guidelines**, ensuring the final output doesn't sound "AI-generated."

## 🛠️ Development Standards
- **Linting**: Biome is used for both backend and frontend.
- **Validation**: Zod is used for all incoming API request validation.
- **Runtime**: Bun is required for the backend to leverage its native test runner and fast execution.
