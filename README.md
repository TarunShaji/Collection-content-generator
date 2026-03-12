# Collection SEO Generator

An AI-powered SEO content engine designed to automate the generation of high-converting descriptions and titles for e-commerce collection pages. By combining intelligent web crawling with advanced LLM orchestration, it transforms raw product listings into optimized, brand-aligned marketing copy.

## ✨ Core Functionalities

-   **Deep Ingestion Pipeline**: Automatically crawls collection pages to discover product links and extracts deep-level product descriptions using **Playwright**.
-   **SSE Real-time Streaming**: Provides a live, interactive experience by streaming crawling progress and AI generation stages directly to the browser via **Server-Sent Events**.
-   **Brand-Aware Humanization**: Uses an iterative "Humanization" pass to refine raw SEO drafts, ensuring the final content reflects specific **Brand Guidelines** and maintains a natural tone.
-   **Contextual Refinement**: An interactive feedback loop allows users to chat with the AI to refine generated content based on specific critique, incorporating product-level context.
-   **SEO Optimization Engine**: Leverages Claude 3.5/3.7 to strategically place keywords while maintaining high readability and conversion-focused messaging.

## 🏗️ Architecture

The project is built as a unified monorepo for seamless full-stack development.

-   **Backend**: A high-performance [Hono](https://hono.dev/) server running on the [Bun](https://bun.sh/) runtime.
-   **Frontend**: A modern [React 19](https://react.dev/) dashboard powered by [Vite](https://vitejs.dev/) and [Tailwind CSS 4](https://tailwindcss.com/).

> [!NOTE]
> For a detailed breakdown of the project structure, internal clients, and technical implementation, please refer to the **[DEV.md](./DEV.md)**.

## 🛠️ Tech Stack & Dependencies

### Backend
-   **Runtime**: [Bun](https://bun.sh/) - For ultra-fast execution and native TypeScript support.
-   **Framework**: [Hono](https://hono.dev/) - A lightweight, standard-based web framework.
-   **Crawl Engine**: [Playwright](https://playwright.dev/) - Headless browser automation for accurate data extraction.
-   **AI Core**: [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) - Orchestrating Claude for generation and humanization.
-   **Validation**: [Zod](https://zod.dev/) - Type-safe schema validation for all API boundaries.

### Frontend
-   **Library**: [React 19](https://react.dev/) - Utilizing the latest Concurrent Mode and hooks for a fluid UI.
-   **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) - Utilizing zero-runtime CSS with modern variables.
-   **Icons**: [Lucide React](https://lucide.dev/) - Beautiful, consistent iconography.
-   **State Management**: React Hooks + Local Storage for form persistence.

## 🚦 Getting Started

### Prerequisites
-   [Bun](https://bun.sh/) installed.
-   An [Anthropic API Key](https://console.anthropic.com/).

### Setup & Run

1.  **Configure Environment**:
    -   `cp backend/.env.example backend/.env`
    -   Add your `ANTHROPIC_API_KEY` to `backend/.env`.

2.  **Install & Start**:
    ```bash
    bun install
    # Start Backend (Port 8000)
    cd backend && bun run dev
    # Start Frontend (Port 5173)
    cd frontend && bun run dev
    ```

---

*Part of the `collection-seo-generator` internal tools suite.*
