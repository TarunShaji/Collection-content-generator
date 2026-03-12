# Collection SEO Generator

An AI-powered SEO content generator designed specifically for e-commerce collection pages. This tool automates the process of crawling product information and generating high-quality, SEO-optimized descriptions and titles using advanced AI.

## 🚀 Key Features

-   **Deep Product Crawling**: Automatically extracts product descriptions from collection pages using Playwright.
-   **AI-Powered SEO Generation**: Leverages Anthropic's Claude to create compelling, keyword-rich content.
-   **Content Humanization**: Refines AI-generated text to ensure it sounds natural and aligns with brand guidelines.
-   **Real-time Progress Tracking**: Uses Server-Sent Events (SSE) to provide live updates during the crawling and generation process.
-   **Interactive Refinement**: Allows users to provide feedback and refine generated content iteratively.

## 🏗️ Architecture

The project is organized as a monorepo:

-   **/backend**: A Hono-based server running on Bun. It handles web scraping, AI communication, and content logic.
-   **/frontend**: A Vite + React application styled with Tailwind CSS, providing a modern dashboard for content generation.

## 🛠️ Tech Stack

### Backend
-   **Runtime**: [Bun](https://bun.sh/)
-   **Web Framework**: [Hono](https://hono.dev/)
-   **Web Scraping**: [Playwright](https://playwright.dev/)
-   **AI Integration**: [Anthropic Claude SDK](https://github.com/anthropics/anthropic-sdk-typescript)
-   **Validation**: [Zod](https://zod.dev/)

### Frontend
-   **Framework**: [React 19](https://react.dev/)
-   **Build Tool**: [Vite](https://vitejs.dev/)
-   **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
-   **Icons**: [Lucide React](https://lucide.dev/)

## 🚦 Getting Started

### Prerequisites
-   [Bun](https://bun.sh/) installed locally.
-   An Anthropic API Key.

### Setup

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd collection-page-content
    ```

2.  **Configure Environment Variables**:
    -   Copy `backend/.env.example` to `backend/.env` and add your `ANTHROPIC_API_KEY`.

3.  **Install Dependencies**:
    ```bash
    # Install root dependencies
    bun install
    ```

4.  **Run the Application**:
    -   **Backend**: 
        ```bash
        cd backend
        bun run dev
        ```
    -   **Frontend**:
        ```bash
        cd frontend
        bun run dev
        ```

## 📄 License

[Insert License Information Here]
