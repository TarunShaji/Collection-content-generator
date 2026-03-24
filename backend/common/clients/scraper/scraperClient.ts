import { type Browser, type BrowserContext, type Page, chromium } from "playwright";
import { settings } from "@/common/config/settings";
import type { CrawlResult, CrawlSource, IScraperClient, ProductLink, ProgressCallback } from "./IScraperClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Extra headers that match a real Mac/Chrome session to reduce bot detection. */
const EXTRA_HEADERS: Record<string, string> = {
	"Accept-Language": "en-US,en;q=0.9",
	"Accept-Encoding": "gzip, deflate, br",
	"sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
	"sec-ch-ua-mobile": "?0",
	"sec-ch-ua-platform": '"macOS"',
};

/**
 * Ordered list of CSS selectors used to find the product grid container on a
 * collection page.  Scoping link extraction to this container prevents nav,
 * footer, and recommendation widgets from polluting the product list.
 */
const COLLECTION_GRID_SELECTORS = [
	'[data-section-type="collection-template"]',
	'[data-section-type="collection"]',
	"#collection-grid",
	".collection-grid",
	".product-grid",
	".products-grid",
	".collection__products",
	"ul.products",
	"#product-list",
	".product-list",
	"[data-products-grid]",
	'main [class*="product-grid"]',
	'main [class*="collection-grid"]',
	"main",
];

/**
 * Pagination selectors ordered from most-specific to least-specific.
 * Text-based selectors are kept at the bottom to avoid matching nav links.
 */
const NEXT_PAGE_SELECTORS = [
	'a[rel="next"]',
	'a[aria-label="Next page"]',
	'a[aria-label="Next Page"]',
	'a[aria-label="next page"]',
	".pagination__next a",
	".pagination__item--next a",
	'nav[aria-label="pagination"] a:last-child',
	".pagination a.next",
	"a.next",
	".next a",
	'a:has-text("Next page")',
	'a:has-text("Next Page")',
];

/**
 * Accordion / tab trigger selectors tried to expose hidden description content.
 * Description-specific selectors come first.
 */
const ACCORDION_TRIGGER_SELECTORS = [
	'button[aria-expanded="false"][aria-controls*="description"]',
	'button[aria-expanded="false"][aria-controls*="detail"]',
	'[data-accordion-trigger][aria-expanded="false"][aria-controls*="description"]',
	'[data-accordion-trigger][aria-expanded="false"][aria-controls*="detail"]',
	'.accordion__title[aria-expanded="false"]',
	'.accordion-trigger[aria-expanded="false"]',
	'.tabs__tab[aria-selected="false"]:has-text("Description")',
	'.tabs__tab[aria-selected="false"]:has-text("Details")',
	'button[aria-expanded="false"][aria-controls*="product"]',
];

/**
 * CSS selectors for product description containers — most-specific first.
 * All valid matches are collected and the longest is returned.
 * ".description" intentionally excluded — too generic, causes false positives.
 */
const DESCRIPTION_SELECTORS = [
	"[itemprop='description']",
	"[data-product-description]",
	"[data-description]",
	".product__description",
	".product-single__description",
	".product-details__description",
	".product-info__description",
	".product-detail__description",
	".product_description",
	".product-description",
	"#product-description",
	".pdp-description",
	".accordion-panel-inner",
	".accordion__content",
	"[data-accordion-content]",
	"[data-tab-content]",
	".product__description .rte",
	".accordion-panel-inner .rte",
	".product-body .rte",
	".tab-content .rte",
	".product-body",
	'[class*="product-description"]',
	'[class*="ProductDescription"]',
	'[class*="product_description"]',
	'[class*="pdp-description"]',
];

/**
 * Blocked description patterns.  Text is only rejected when the ratio of
 * blocked-phrase characters to total text length exceeds this threshold —
 * a single incidental mention inside a real description will not disqualify it.
 */
const BLOCKED_PATTERNS = [
	"shipping calculated at checkout",
	"free shipping on orders",
	"taxes included",
	"tax included",
	"return policy",
	"returns policy",
];
const BLOCK_RATIO_THRESHOLD = 0.4;

/** Maximum characters to extract from any text source before truncating. */
const MAX_TEXT_LENGTH = 1200;

// ─── ScraperClient ────────────────────────────────────────────────────────────

class ScraperClient implements IScraperClient {
	private browser: Browser | null = null;

	// ── Logging ────────────────────────────────────────────────────────────────

	private log(level: "info" | "warn" | "error" | "debug", message: string, ctx?: Record<string, unknown>): void {
		const line = `[ScraperClient] ${message}${ctx ? ` ${JSON.stringify(ctx)}` : ""}`;
		if (level === "warn") console.warn(line);
		else if (level === "error") console.error(line);
		else if (level === "debug") console.debug(line);
		else console.info(line);
	}

	// ── Text utilities ─────────────────────────────────────────────────────────

	private normalizeText(input: string): string {
		return input.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
	}

	private decodeHtmlEntities(input: string): string {
		return input
			.replace(/&nbsp;/gi, " ")
			.replace(/&amp;/gi, "&")
			.replace(/&quot;/gi, '"')
			.replace(/&#39;/gi, "'")
			.replace(/&apos;/gi, "'")
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">")
			.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
	}

	private stripHtml(input: string): string {
		const noScripts = input
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
			.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
		return this.normalizeText(this.decodeHtmlEntities(noScripts.replace(/<[^>]+>/g, " ")));
	}

	/**
	 * Validate a description candidate.
	 * Only rejects when blocked phrases make up more than BLOCK_RATIO_THRESHOLD
	 * of the total text — a single mention inside a real description passes.
	 */
	private validateDescription(text: string): { valid: boolean; reason?: string } {
		if (!text) return { valid: false, reason: "empty" };
		if (text.length < 20) return { valid: false, reason: "too_short" };

		const lower = text.toLowerCase();
		const blockedChars = BLOCKED_PATTERNS.reduce((sum, p) => (lower.includes(p) ? sum + p.length : sum), 0);
		const ratio = blockedChars / text.length;
		if (ratio > BLOCK_RATIO_THRESHOLD) {
			return { valid: false, reason: `high_block_ratio:${ratio.toFixed(2)}` };
		}
		return { valid: true };
	}

	private truncate(text: string): string {
		return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
	}

	// ── Browser management ─────────────────────────────────────────────────────

	private async getBrowser(): Promise<Browser> {
		if (!this.browser) {
			this.log("info", "Launching Playwright browser");
			this.browser = await chromium.launch({ headless: true });
		}
		return this.browser;
	}

	/** Create a browser context with a realistic fingerprint. */
	private async newContext(): Promise<BrowserContext> {
		const browser = await this.getBrowser();
		return browser.newContext({
			userAgent: USER_AGENT,
			extraHTTPHeaders: EXTRA_HEADERS,
			locale: "en-US",
			timezoneId: "America/New_York",
		});
	}

	/**
	 * Navigate to a URL, preferring networkidle so JS-rendered content has time
	 * to paint.  Falls back to domcontentloaded if the site never fully settles.
	 */
	private async navigate(page: Page, url: string): Promise<void> {
		await page
			.goto(url, { waitUntil: "networkidle", timeout: settings.scraper.pageTimeout })
			.catch(() => page.goto(url, { waitUntil: "domcontentloaded", timeout: settings.scraper.pageTimeout }));
	}

	// ── Shopify fast-paths ─────────────────────────────────────────────────────

	private extractShopifyHandle(url: string, segment: "collections" | "products"): string | null {
		try {
			const match = new URL(url).pathname.match(new RegExp(`\\/${segment}\\/([^/?#]+)`));
			return match?.[1] ? decodeURIComponent(match[1]) : null;
		} catch {
			return null;
		}
	}

	/**
	 * Try the Shopify collection products JSON API to get all product links
	 * without opening a browser.  Returns null if not a Shopify store or if
	 * the endpoint is inaccessible.
	 */
	private async fetchShopifyCollectionLinks(collectionUrl: string): Promise<ProductLink[] | null> {
		const handle = this.extractShopifyHandle(collectionUrl, "collections");
		if (!handle) return null;

		const origin = new URL(collectionUrl).origin;
		const links: ProductLink[] = [];
		let page = 1;

		this.log("info", "Trying Shopify collection API fast-path", { origin, handle });

		try {
			while (true) {
				const apiUrl = `${origin}/collections/${encodeURIComponent(handle)}/products.json?limit=250&page=${page}`;
				const res = await fetch(apiUrl, {
					headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
					signal: AbortSignal.timeout(15000),
				});

				if (!res.ok) {
					this.log("warn", "Shopify collection API non-OK — falling back to browser", { status: res.status });
					return null;
				}

				const data = (await res.json()) as { products?: Array<{ handle?: string; title?: string }> };
				const products = data.products ?? [];
				if (products.length === 0) break;

				for (const p of products) {
					if (p.handle) links.push({ url: `${origin}/products/${p.handle}`, title: p.title });
				}

				this.log("info", "Shopify collection API page fetched", { page, count: products.length });
				if (products.length < 250) break;
				page++;
			}

			if (links.length === 0) return null;
			this.log("info", "Shopify collection API fast-path complete", { total: links.length });
			return links;
		} catch (err) {
			this.log("warn", "Shopify collection API fast-path error", { error: err instanceof Error ? err.message : "Unknown" });
			return null;
		}
	}

	/**
	 * Fetch a product description from Shopify's product JSON endpoint.
	 * body_html is raw HTML — we strip it before validating.
	 */
	private async fetchShopifyProductDescription(productUrl: string): Promise<string | null> {
		const handle = this.extractShopifyHandle(productUrl, "products");
		if (!handle) return null;

		const origin = new URL(productUrl).origin;
		const apiUrl = `${origin}/products/${encodeURIComponent(handle)}.json`;
		this.log("info", "Trying Shopify product API", { apiUrl });

		try {
			const res = await fetch(apiUrl, {
				headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
				signal: AbortSignal.timeout(Math.min(settings.scraper.pageTimeout, 15000)),
			});

			if (!res.ok) return null;

			const data = (await res.json()) as { product?: { body_html?: string | null } };
			const bodyHtml = data.product?.body_html;
			if (!bodyHtml) return null;

			const text = this.truncate(this.stripHtml(bodyHtml));
			const validation = this.validateDescription(text);
			if (!validation.valid) {
				this.log("warn", "Shopify product body_html failed validation", { reason: validation.reason });
				return null;
			}

			this.log("info", "Shopify product API succeeded", { apiUrl, length: text.length });
			return text;
		} catch (err) {
			this.log("warn", "Shopify product API error", { apiUrl, error: err instanceof Error ? err.message : "Unknown" });
			return null;
		}
	}

	// ── Collection crawl ───────────────────────────────────────────────────────

	async crawlCollectionPage(url: string, onProgress: ProgressCallback): Promise<ProductLink[]> {
		this.log("info", "Starting collection crawl", { url });
		await onProgress("Loading collection page...");

		// Fast-path: Shopify collection API — no browser needed
		const shopifyLinks = await this.fetchShopifyCollectionLinks(url);
		if (shopifyLinks) {
			await onProgress(`Found ${shopifyLinks.length} products via Shopify API`);
			return this.deduplicateLinks(shopifyLinks);
		}

		// Browser-based fallback
		const context = await this.newContext();
		const page = await context.newPage();

		try {
			await this.navigate(page, url);
			await page.waitForTimeout(2000);

			const allLinks: ProductLink[] = [];
			let pageNum = 1;
			let previousUrl = page.url();

			while (true) {
				await onProgress(`Scanning page ${pageNum} for product links...`);
				const links = await this.extractProductLinks(page, url);
				this.log("info", "Links found on page", { pageNum, count: links.length });
				allLinks.push(...links);

				const advanced = await this.goToNextPage(page, previousUrl);
				if (!advanced) break;

				previousUrl = page.url();
				pageNum++;
				await page.waitForTimeout(2000);
			}

			const unique = this.deduplicateLinks(allLinks);
			this.log("info", "Collection crawl complete", { pagesScanned: pageNum, unique: unique.length });
			await onProgress(`Found ${unique.length} product links`);
			return unique;
		} finally {
			await context.close();
		}
	}

	/**
	 * Extract product links from the current page.
	 * Scopes extraction to the product grid container to avoid nav/footer noise.
	 * Only same-origin links with a valid product URL shape are returned.
	 */
	private async extractProductLinks(page: Page, collectionUrl: string): Promise<ProductLink[]> {
		const origin = new URL(collectionUrl).origin;

		// Find the tightest container that holds the product grid
		let containerSelector: string | null = null;
		for (const sel of COLLECTION_GRID_SELECTORS) {
			const found = await page.$(sel).then((el) => !!el).catch(() => false);
			if (found) { containerSelector = sel; break; }
		}

		this.log("debug", "Product link extraction scope", { container: containerSelector ?? "full-page" });

		return page.evaluate(
			({ base, container }: { base: string; container: string | null }) => {
				const root = (container ? document.querySelector(container) : document.body) ?? document.body;
				const seen = new Set<string>();
				const results: { url: string; title?: string }[] = [];

				for (const anchor of root.querySelectorAll("a[href]")) {
					const href = anchor.getAttribute("href");
					if (!href) continue;

					let fullUrl: string;
					try {
						fullUrl = href.startsWith("http") ? href : new URL(href, base).href;
					} catch { continue; }

					// Same-origin only
					if (!fullUrl.startsWith(base)) continue;

					// Must look like a product URL with a handle segment after the keyword
					const { pathname } = new URL(fullUrl);
					const isProduct =
						/\/products\/[^/]+/.test(pathname) ||
						/\/product\/[^/]+/.test(pathname) ||
						/\/item\/[^/]+/.test(pathname) ||
						/\/goods\/[^/]+/.test(pathname);

					if (!isProduct) continue;

					// Deduplicate within this page
					const key = fullUrl.split("?")[0].replace(/\/$/, "").toLowerCase();
					if (seen.has(key)) continue;
					seen.add(key);

					// Prefer aria-label or img alt over full card textContent (which includes price/buttons)
					const ariaLabel = anchor.getAttribute("aria-label")?.trim();
					const imgAlt = (anchor.querySelector("img") as HTMLImageElement | null)?.alt?.trim();
					const firstTextNode = Array.from(anchor.childNodes)
						.filter((n) => n.nodeType === Node.TEXT_NODE)
						.map((n) => n.textContent?.trim())
						.find((t) => t && t.length > 2);

					results.push({ url: fullUrl, title: ariaLabel || firstTextNode || imgAlt || undefined });
				}

				return results;
			},
			{ base: origin, container: containerSelector },
		);
	}

	/**
	 * Click the next-page link if one exists.
	 * Verifies the URL actually changed after clicking to prevent infinite loops
	 * on themes where a disabled "Next" button navigates back to the same page.
	 */
	private async goToNextPage(page: Page, previousUrl: string): Promise<boolean> {
		for (const selector of NEXT_PAGE_SELECTORS) {
			try {
				const el = await page.$(selector);
				if (!el || !(await el.isVisible())) continue;

				// Pre-check: skip if the href points at the current page
				const href = await el.getAttribute("href").catch(() => null);
				if (href) {
					try {
						const target = new URL(href, page.url()).href.split("?")[0];
						if (target === page.url().split("?")[0]) continue;
					} catch { /* unparseable href — let Playwright try */ }
				}

				await el.click();
				await page.waitForLoadState("domcontentloaded");
				await page.waitForTimeout(1000);

				// Confirm URL changed
				if (page.url().split("?")[0] === previousUrl.split("?")[0]) {
					this.log("debug", "URL unchanged after next-page click — no more pages", { selector });
					return false;
				}

				this.log("debug", "Paginated to next page", { selector });
				return true;
			} catch { continue; }
		}
		return false;
	}

	private deduplicateLinks(links: ProductLink[]): ProductLink[] {
		const seen = new Set<string>();
		const deduped = links.filter((link) => {
			const key = link.url.split("?")[0].replace(/\/$/, "").toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		this.log("info", "Deduplication complete", { before: links.length, after: deduped.length });
		return deduped;
	}

	// ── Product crawl ──────────────────────────────────────────────────────────

	async crawlProductPages(links: ProductLink[], onProgress: ProgressCallback): Promise<CrawlResult[]> {
		await this.getBrowser();
		const results: CrawlResult[] = [];
		const concurrency = settings.scraper.concurrency;

		this.log("info", "Starting product crawl", { total: links.length, concurrency });

		for (let i = 0; i < links.length; i += concurrency) {
			const batch = links.slice(i, i + concurrency);
			const batchNo = Math.floor(i / concurrency) + 1;
			this.log("info", "Processing batch", { batchNumber: batchNo, size: batch.length });

			const batchResults = await Promise.all(
				batch.map(async (link, batchIdx) => {
					const idx = i + batchIdx + 1;
					await onProgress(`Crawling product ${idx} of ${links.length}: ${link.title || link.url}`);
					return this.crawlSingleProduct(link, idx, links.length);
				}),
			);

			results.push(...batchResults);
			this.log("info", "Batch complete", {
				batchNumber: batchNo,
				success: batchResults.filter((r) => r.success).length,
				failed: batchResults.filter((r) => !r.success).length,
			});

			if (i + concurrency < links.length) {
				await new Promise((r) => setTimeout(r, settings.scraper.delayBetweenRequests));
			}
		}

		this.log("info", "Product crawl complete", {
			total: results.length,
			success: results.filter((r) => r.success).length,
			failed: results.filter((r) => !r.success).length,
		});
		return results;
	}

	private async crawlSingleProduct(link: ProductLink, index: number, total: number): Promise<CrawlResult> {
		this.log("info", "Extracting product", { index, total, url: link.url });

		// Tier 1 — Shopify product JSON API (no browser needed)
		if (/\/products\/[^/]+/.test(new URL(link.url).pathname)) {
			const desc = await this.fetchShopifyProductDescription(link.url);
			if (desc) return this.successResult(link.url, desc, "shopify_api");
			this.log("warn", "Shopify product API failed — falling back to browser", { url: link.url });
		}

		// Tiers 2–4 via browser, with one retry on transient failure
		return this.crawlWithBrowser(link, false);
	}

	private async crawlWithBrowser(link: ProductLink, isRetry: boolean): Promise<CrawlResult> {
		const context = await this.newContext();
		const page = await context.newPage();

		try {
			await this.navigate(page, link.url);
			await page.waitForTimeout(2000);

			// Tier 2 — JSON-LD
			const jsonLd = await this.extractFromJsonLd(page, link.url);
			if (jsonLd) return this.successResult(link.url, jsonLd, "json_ld");

			// Tier 3 — Meta tags
			const meta = await this.extractFromMetaTags(page, link.url);
			if (meta) return this.successResult(link.url, meta, "meta");

			// Tier 4 — DOM
			const dom = await this.extractFromDom(page, link.url);
			if (dom) return this.successResult(link.url, dom, "dom");

			this.log("warn", "All tiers failed", { url: link.url });
			return { url: link.url, description: "", success: false, error: "No description found" };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			this.log("error", "Browser crawl crashed", { url: link.url, error: message, isRetry });

			// One retry on transient failure
			if (!isRetry) {
				this.log("info", "Retrying after crash", { url: link.url });
				await context.close().catch(() => undefined);
				await new Promise((r) => setTimeout(r, 2000));
				return this.crawlWithBrowser(link, true);
			}

			return { url: link.url, description: "", success: false, error: message };
		} finally {
			await context.close().catch(() => undefined);
		}
	}

	// ── Extraction tiers ───────────────────────────────────────────────────────

	/**
	 * Tier 2: JSON-LD structured data.
	 * Strips HTML from the description field before validating — Shopify
	 * frequently stores raw markup in the JSON-LD description.
	 */
	private async extractFromJsonLd(page: Page, url: string): Promise<string | null> {
		this.log("debug", "Trying JSON-LD tier", { url });
		try {
			const blocks = await page.$$eval("script[type='application/ld+json']", (els) =>
				els.map((el) => el.textContent || ""),
			);

			for (let i = 0; i < blocks.length; i++) {
				if (!blocks[i].trim()) continue;
				try {
					const items = this.flattenJsonLd(JSON.parse(blocks[i]));
					for (const item of items) {
						if (!item || typeof item !== "object") continue;
						const node = item as Record<string, unknown>;
						if (!this.isProductNode(node)) continue;

						const raw = typeof node.description === "string" ? node.description : "";
						if (!raw) continue;

						const text = this.truncate(this.stripHtml(raw));
						const v = this.validateDescription(text);
						if (!v.valid) { this.log("debug", "JSON-LD rejected", { url, reason: v.reason }); continue; }

						this.log("info", "JSON-LD tier succeeded", { url, block: i, length: text.length });
						return text;
					}
				} catch { /* malformed block — skip */ }
			}
		} catch (err) {
			this.log("warn", "JSON-LD tier error", { url, error: err instanceof Error ? err.message : "Unknown" });
		}
		return null;
	}

	private flattenJsonLd(parsed: unknown): unknown[] {
		if (!parsed) return [];
		if (Array.isArray(parsed)) return parsed.flatMap((i) => this.flattenJsonLd(i));
		if (typeof parsed !== "object") return [];
		const record = parsed as Record<string, unknown>;
		const graph = record["@graph"];
		return Array.isArray(graph) ? [record, ...graph.flatMap((i) => this.flattenJsonLd(i))] : [record];
	}

	private isProductNode(node: Record<string, unknown>): boolean {
		const t = node["@type"];
		if (typeof t === "string") return t.toLowerCase() === "product";
		if (Array.isArray(t)) return t.some((e) => typeof e === "string" && e.toLowerCase() === "product");
		return false;
	}

	/** Tier 3: Meta tags — og:description, twitter:description, meta[name=description]. */
	private async extractFromMetaTags(page: Page, url: string): Promise<string | null> {
		this.log("debug", "Trying meta tier", { url });
		try {
			const { og, twitter, meta } = await page.evaluate(() => {
				const get = (sel: string) => document.querySelector(sel)?.getAttribute("content")?.trim() || "";
				return {
					og: get('meta[property="og:description"]'),
					twitter: get('meta[name="twitter:description"]'),
					meta: get('meta[name="description"]'),
				};
			});

			for (const [source, raw] of [["og:description", og], ["twitter:description", twitter], ["meta:description", meta]] as [string, string][]) {
				const text = this.normalizeText(raw);
				const v = this.validateDescription(text);
				if (!v.valid) continue;
				this.log("info", "Meta tier succeeded", { url, source, length: text.length });
				return text;
			}
		} catch (err) {
			this.log("warn", "Meta tier error", { url, error: err instanceof Error ? err.message : "Unknown" });
		}
		return null;
	}

	/**
	 * Tier 4: DOM selector scan.
	 * Expands ALL accordion/tab panels first, then collects every valid
	 * candidate across all selectors and returns the longest one.
	 */
	private async extractFromDom(page: Page, url: string): Promise<string | null> {
		this.log("debug", "Trying DOM tier", { url });

		await this.expandDescriptionPanels(page, url);

		const candidates: { selector: string; text: string }[] = [];

		for (const selector of DESCRIPTION_SELECTORS) {
			try {
				for (const el of await page.$$(selector)) {
					if (!(await el.isVisible().catch(() => false))) continue;

					const raw = this.normalizeText(await el.innerText());
					const text = this.truncate(raw);
					const v = this.validateDescription(text);
					if (!v.valid) {
						this.log("debug", "DOM candidate rejected", { url, selector, reason: v.reason });
						continue;
					}
					candidates.push({ selector, text });
				}
			} catch { /* selector evaluation failed — skip */ }
		}

		if (candidates.length === 0) return null;

		// Return the longest valid candidate — more content is more useful for the AI
		candidates.sort((a, b) => b.text.length - a.text.length);
		const best = candidates[0];
		this.log("info", "DOM tier succeeded", { url, selector: best.selector, length: best.text.length, totalCandidates: candidates.length });
		return best.text;
	}

	/**
	 * Click open ALL accordion/tab panels that may be hiding description content.
	 * Old code returned after the first expansion — this tries every panel.
	 */
	private async expandDescriptionPanels(page: Page, url: string): Promise<void> {
		let expanded = 0;
		for (const selector of ACCORDION_TRIGGER_SELECTORS) {
			try {
				for (const trigger of await page.$$(selector)) {
					if (!(await trigger.isVisible().catch(() => false))) continue;
					await trigger.click({ timeout: 1000 }).catch(() => undefined);
					await page.waitForTimeout(200);
					expanded++;
				}
			} catch { /* continue */ }
		}
		if (expanded > 0) {
			this.log("debug", "Expanded panels", { url, count: expanded });
			await page.waitForTimeout(300);
		}
	}

	// ── Helpers ────────────────────────────────────────────────────────────────

	private successResult(url: string, description: string, source: CrawlSource): CrawlResult {
		this.log("info", "Extraction complete", { url, source, length: description.length });
		return { url, description, success: true, source };
	}

	async close(): Promise<void> {
		if (this.browser) {
			this.log("info", "Closing browser");
			await this.browser.close();
			this.browser = null;
		}
	}
}

export const createScraperClient = (): IScraperClient => new ScraperClient();
