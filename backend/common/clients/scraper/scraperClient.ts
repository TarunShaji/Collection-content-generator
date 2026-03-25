import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { settings } from "@/common/config/settings";
import type { CrawlResult, CrawlSource, IScraperClient, ProductLink, ProgressCallback } from "./IScraperClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Headers sent with every HTML page fetch to mimic a real browser. */
const HTML_HEADERS: Record<string, string> = {
	"User-Agent": USER_AGENT,
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9",
	"Accept-Encoding": "gzip, deflate, br",
	"Cache-Control": "no-cache",
	"sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
	"sec-ch-ua-mobile": "?0",
	"sec-ch-ua-platform": '"macOS"',
	"sec-fetch-dest": "document",
	"sec-fetch-mode": "navigate",
	"sec-fetch-site": "none",
};

/** Headers for JSON API calls. */
const JSON_HEADERS: Record<string, string> = {
	"User-Agent": USER_AGENT,
	Accept: "application/json",
};

/**
 * Attribute patterns used to locate product description elements in raw HTML.
 * Ordered most-specific to least-specific.
 * All matching elements are collected; the longest valid one is returned.
 */
const DESCRIPTION_ATTR_PATTERNS: RegExp[] = [
	/itemprop=["']description["']/i,
	/data-product-description/i,
	/data-description(?!=s)/i,
	/class=["'][^"']*\bproduct__description\b[^"']*["']/i,
	/class=["'][^"']*\bproduct-single__description\b[^"']*["']/i,
	/class=["'][^"']*\bproduct-details__description\b[^"']*["']/i,
	/class=["'][^"']*\bproduct-info__description\b[^"']*["']/i,
	/class=["'][^"']*\bproduct-detail__description\b[^"']*["']/i,
	/class=["'][^"']*\bproduct_description\b[^"']*["']/i,
	/class=["'][^"']*\bproduct-description\b[^"']*["']/i,
	/id=["']product-description["']/i,
	/class=["'][^"']*\bpdp-description\b[^"']*["']/i,
	/class=["'][^"']*\bProductDescription\b[^"']*["']/i,
	/class=["'][^"']*\bproduct-body\b[^"']*["']/i,
];

/**
 * Text is only rejected when blocked phrases make up more than this ratio
 * of the total text — a single incidental mention inside a real description passes.
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

/** Maximum characters extracted from any source before truncating. */
const MAX_TEXT_LENGTH = 1200;

// ─── Debug output types ───────────────────────────────────────────────────────

interface DebugCandidate {
	source: CrawlSource;
	text: string;
	length: number;
	chosen: boolean;
}

interface ProductDebugEntry {
	url: string;
	title: string | null;
	success: boolean;
	error?: string;
	winner: { source: CrawlSource; length: number } | null;
	titlePrepended: boolean;
	finalLength: number;
	candidates: DebugCandidate[];
}

interface DebugRunOutput {
	timestamp: string;
	durationMs: number;
	totalProducts: number;
	successCount: number;
	failCount: number;
	sourceDistribution: Partial<Record<CrawlSource, number>>;
	products: ProductDebugEntry[];
}

// ─── ScraperClient ────────────────────────────────────────────────────────────

class ScraperClient implements IScraperClient {

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
		return input
			.replace(/\u00A0/g, " ")
			.replace(/\s+/g, " ")
			// Rejoin single consonants split from their word by a stray tag
			// e.g. "f lavor" → "flavor" (caused by <span>f</span>lavor in source HTML)
			.replace(/ ([b-df-hj-np-tv-z]) ([a-z])/g, " $1$2")
			.trim();
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

	private truncate(text: string): string {
		return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
	}

	private validateDescription(text: string): { valid: boolean; reason?: string } {
		if (!text) return { valid: false, reason: "empty" };
		if (text.length < 20) return { valid: false, reason: "too_short" };
		const lower = text.toLowerCase();
		const blockedChars = BLOCKED_PATTERNS.reduce((sum, p) => (lower.includes(p) ? sum + p.length : sum), 0);
		const ratio = blockedChars / text.length;
		if (ratio > BLOCK_RATIO_THRESHOLD) return { valid: false, reason: `high_block_ratio:${ratio.toFixed(2)}` };
		return { valid: true };
	}

	// ── HTTP ───────────────────────────────────────────────────────────────────

	/** Fetch a URL and return the raw HTML string. Returns null on any failure. */
	private async fetchHtml(url: string): Promise<string | null> {
		try {
			const res = await fetch(url, {
				headers: HTML_HEADERS,
				redirect: "follow",
				signal: AbortSignal.timeout(settings.scraper.pageTimeout),
			});
			if (!res.ok) {
				this.log("warn", "Non-OK response fetching HTML", { url, status: res.status });
				return null;
			}
			return await res.text();
		} catch (err) {
			this.log("warn", "HTML fetch failed", { url, error: err instanceof Error ? err.message : "Unknown" });
			return null;
		}
	}

	/** Fetch a URL and return parsed JSON. Returns null on any failure. */
	private async fetchJson<T>(url: string): Promise<T | null> {
		try {
			const res = await fetch(url, {
				headers: JSON_HEADERS,
				redirect: "follow",
				signal: AbortSignal.timeout(15000),
			});
			if (!res.ok) return null;
			return (await res.json()) as T;
		} catch {
			return null;
		}
	}

	// ── HTML parsing ───────────────────────────────────────────────────────────

	/**
	 * Extract all JSON-LD script block contents from an HTML string.
	 */
	private extractJsonLdBlocks(html: string): string[] {
		const blocks: string[] = [];
		const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
		let m: RegExpExecArray | null;
		while ((m = re.exec(html)) !== null) {
			const content = m[1].trim();
			if (content) blocks.push(content);
		}
		return blocks;
	}

	/**
	 * Extract a meta tag's content value from raw HTML.
	 * Tries each identifier in order; handles both attribute orderings.
	 */
	private extractMetaContent(html: string, ...identifiers: string[]): string | null {
		for (const id of identifiers) {
			const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:/g, "\\:?:");
			const patterns = [
				new RegExp(`<meta[^>]+(?:property|name)=["']${id}["'][^>]+content=["']([^"']{1,600})["']`, "i"),
				new RegExp(`<meta[^>]+content=["']([^"']{1,600})["'][^>]+(?:property|name)=["']${id}["']`, "i"),
			];
			for (const re of patterns) {
				const m = re.exec(html);
				const value = m?.[1]?.trim();
				if (value) return this.normalizeText(this.decodeHtmlEntities(value));
			}
		}
		return null;
	}

	/**
	 * Find and extract the text content of an HTML element identified by an
	 * attribute/class pattern. Correctly handles nested elements of the same
	 * tag type by counting open/close tag depth.
	 */
	private findElementText(html: string, attrPattern: RegExp): string | null {
		attrPattern.lastIndex = 0;
		const attrMatch = attrPattern.exec(html);
		if (!attrMatch) return null;

		// Walk backwards from the attribute match to find the start of its opening tag
		let tagStart = attrMatch.index;
		while (tagStart > 0 && html[tagStart] !== "<") tagStart--;
		if (html[tagStart] !== "<") return null;

		// Get the tag name (div, section, p, etc.)
		const tagNameMatch = html.slice(tagStart).match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
		if (!tagNameMatch) return null;
		const tag = tagNameMatch[1].toLowerCase();

		// Find the end of this opening tag
		const openEnd = html.indexOf(">", tagStart);
		if (openEnd === -1) return null;
		// Self-closing tags have no inner content
		if (html[openEnd - 1] === "/") return null;

		// Walk forward counting depth to find the matching closing tag
		const openTagRe = new RegExp(`<${tag}[\\s/>]`, "gi");
		const closeTag = `</${tag}>`;
		let depth = 1;
		let pos = openEnd + 1;

		while (depth > 0 && pos < html.length) {
			openTagRe.lastIndex = pos;
			const nextOpen = openTagRe.exec(html);
			const nextCloseIdx = html.indexOf(closeTag, pos);

			if (nextCloseIdx === -1) break;

			if (nextOpen && nextOpen.index < nextCloseIdx) {
				depth++;
				pos = nextOpen.index + 1;
			} else {
				depth--;
				if (depth === 0) {
					return this.stripHtml(html.slice(openEnd + 1, nextCloseIdx));
				}
				pos = nextCloseIdx + closeTag.length;
			}
		}

		return null;
	}

	/**
	 * Extract all product links from a raw HTML string.
	 * Same-origin only, must match a known product URL shape.
	 */
	private extractLinksFromHtml(html: string, origin: string): ProductLink[] {
		const seen = new Set<string>();
		const results: ProductLink[] = [];
		const hrefRe = /href=["']([^"'#][^"']*?)["']/gi;
		let m: RegExpExecArray | null;

		while ((m = hrefRe.exec(html)) !== null) {
			const raw = this.decodeHtmlEntities(m[1].trim());
			if (!raw || raw.startsWith("javascript:")) continue;

			let fullUrl: string;
			try {
				fullUrl = raw.startsWith("http") ? raw : new URL(raw, origin).href;
			} catch { continue; }

			if (!fullUrl.startsWith(origin)) continue;

			const { pathname } = new URL(fullUrl);
			const isProduct =
				/\/products\/[^/]+/.test(pathname) ||
				/\/product\/[^/]+/.test(pathname) ||
				/\/item\/[^/]+/.test(pathname) ||
				/\/goods\/[^/]+/.test(pathname);

			if (!isProduct) continue;

			// Strip query strings for deduplication
			const key = fullUrl.split("?")[0].replace(/\/$/, "").toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);

			results.push({ url: fullUrl.split("?")[0] });
		}

		return results;
	}

	/**
	 * Find the next-page URL from raw HTML using rel="next".
	 * This is the most reliable pagination signal — used by Shopify, WooCommerce,
	 * and all well-structured e-commerce sites.
	 */
	private findNextPageUrl(html: string, currentUrl: string): string | null {
		const patterns = [
			/(?:<a|<link)[^>]+rel=["']next["'][^>]+href=["']([^"']+)["'][^>]*>/i,
			/(?:<a|<link)[^>]+href=["']([^"']+)["'][^>]+rel=["']next["'][^>]*>/i,
		];
		for (const re of patterns) {
			const m = re.exec(html);
			if (m?.[1]) {
				try {
					const next = new URL(this.decodeHtmlEntities(m[1]), currentUrl).href;
					if (next !== currentUrl) return next;
				} catch { continue; }
			}
		}
		return null;
	}

	// ── Shopify product fast-path ──────────────────────────────────────────────

	private extractShopifyProductHandle(url: string): string | null {
		try {
			const m = new URL(url).pathname.match(/\/products\/([^/?#]+)/);
			return m?.[1] ? decodeURIComponent(m[1]) : null;
		} catch { return null; }
	}

	/**
	 * Fetch title and description from Shopify's public product JSON endpoint.
	 * Returns null fields individually — title may succeed even if body_html is empty.
	 */
	private async fetchShopifyProduct(productUrl: string): Promise<{ title: string | null; description: string | null }> {
		const handle = this.extractShopifyProductHandle(productUrl);
		if (!handle) return { title: null, description: null };

		const origin = new URL(productUrl).origin;
		const apiUrl = `${origin}/products/${encodeURIComponent(handle)}.json`;
		this.log("info", "Trying Shopify product API", { apiUrl });

		const data = await this.fetchJson<{ product?: { title?: string | null; body_html?: string | null } }>(apiUrl);
		if (!data?.product) return { title: null, description: null };

		const title = typeof data.product.title === "string" && data.product.title.trim()
			? data.product.title.trim()
			: null;

		if (!data.product.body_html) return { title, description: null };

		const text = this.truncate(this.stripHtml(data.product.body_html));
		const v = this.validateDescription(text);
		if (!v.valid) {
			this.log("warn", "Shopify body_html failed validation", { apiUrl, reason: v.reason });
			return { title, description: null };
		}

		this.log("info", "Shopify product API succeeded", { apiUrl, length: text.length });
		return { title, description: text };
	}

	/**
	 * Extract the product title from HTML.
	 * Tries og:title first (clean, no brand suffix), falls back to <title> tag
	 * with common separator stripping ("Product Name | Brand" → "Product Name").
	 */
	private extractTitleFromHtml(html: string): string | null {
		const ogTitle = this.extractMetaContent(html, "og:title");
		if (ogTitle) return ogTitle;

		const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html);
		if (m?.[1]) {
			const raw = this.decodeHtmlEntities(m[1].trim());
			// Strip brand suffix after common separators: " | Brand", " – Brand", " — Brand", " - Brand"
			const stripped = raw.split(/\s*[|–—\-]\s*/)[0].trim();
			return stripped || null;
		}
		return null;
	}

	// ── Collection crawl ───────────────────────────────────────────────────────

	async crawlCollectionPage(url: string, onProgress: ProgressCallback): Promise<ProductLink[]> {
		this.log("info", "Starting collection crawl", { url });
		await onProgress("Loading collection page...");

		const origin = new URL(url).origin;
		const allLinks: ProductLink[] = [];
		let currentUrl = url;
		let pageNum = 1;

		while (true) {
			await onProgress(`Scanning page ${pageNum} for product links...`);

			const html = await this.fetchHtml(currentUrl);
			if (!html) {
				if (pageNum === 1) this.log("warn", "Failed to fetch collection page", { url: currentUrl });
				break;
			}

			const links = this.extractLinksFromHtml(html, origin);
			this.log("info", "Links found on page", { pageNum, count: links.length });
			allLinks.push(...links);

			const nextUrl = this.findNextPageUrl(html, currentUrl);
			if (!nextUrl) break;

			currentUrl = nextUrl;
			pageNum++;
		}

		const unique = this.deduplicateLinks(allLinks);
		this.log("info", "Collection crawl complete", { pagesScanned: pageNum, unique: unique.length });
		await onProgress(`Found ${unique.length} product links`);
		return unique;
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
		const results: CrawlResult[] = [];
		const concurrency = settings.scraper.concurrency;
		const debugEnabled = settings.scraper.debugOutput;
		const debugEntries: ProductDebugEntry[] = [];
		const startTime = performance.now();
		this.log("info", "Starting product crawl", { total: links.length, concurrency, debugEnabled });

		for (let i = 0; i < links.length; i += concurrency) {
			const batch = links.slice(i, i + concurrency);
			const batchNo = Math.floor(i / concurrency) + 1;
			this.log("info", "Processing batch", { batchNumber: batchNo, size: batch.length });

			const batchResults = await Promise.all(
				batch.map(async (link, batchIdx) => {
					const idx = i + batchIdx + 1;
					await onProgress(`Scraping product ${idx} of ${links.length}: ${link.title || link.url}`);
					return this.scrapeProduct(link, idx, links.length, debugEnabled ? debugEntries : null);
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

		if (debugEnabled) {
			this.writeDebugOutput(debugEntries, startTime, results);
		}

		return results;
	}

	private writeDebugOutput(entries: ProductDebugEntry[], startTime: number, results: CrawlResult[]): void {
		try {
			const outputsDir = resolve(import.meta.dir, "../../../outputs");
			mkdirSync(outputsDir, { recursive: true });

			const sourceDistribution = results.reduce<Partial<Record<CrawlSource, number>>>((acc, r) => {
				if (r.source) acc[r.source] = (acc[r.source] ?? 0) + 1;
				return acc;
			}, {});

			const output: DebugRunOutput = {
				timestamp: new Date().toISOString(),
				durationMs: Math.round(performance.now() - startTime),
				totalProducts: results.length,
				successCount: results.filter((r) => r.success).length,
				failCount: results.filter((r) => !r.success).length,
				sourceDistribution,
				products: entries,
			};

			const filename = `scrape_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
			const filepath = resolve(outputsDir, filename);
			writeFileSync(filepath, JSON.stringify(output, null, 2), "utf-8");
			this.log("info", "Debug output written", { filepath, products: entries.length });
		} catch (err) {
			this.log("warn", "Failed to write debug output", { error: err instanceof Error ? err.message : "Unknown" });
		}
	}

	/**
	 * Scrape a single product page using a collect-all-then-pick-best strategy.
	 *
	 * All four tiers are attempted and every valid candidate is collected.
	 * The longest candidate wins — more text = richer AI input.
	 * The product title is prepended to the winner if not already present.
	 *
	 * Tier order (richest to thinnest):
	 *   1. Shopify JSON API   — authoritative body_html, structured
	 *   2. DOM extraction     — full merchant copy, cross-platform
	 *   3. JSON-LD            — structured but often mirrors the meta description
	 *   4. Meta tags          — SEO snippets, always short, last resort
	 */
	private async scrapeProduct(
		link: ProductLink,
		index: number,
		total: number,
		debugCollector: ProductDebugEntry[] | null,
	): Promise<CrawlResult> {
		this.log("info", "Scraping product", { index, total, url: link.url });

		const candidates: Array<{ text: string; source: CrawlSource }> = [];
		let title: string | null = null;

		// Tier 1 — Shopify product JSON API
		// Always attempted; returns null fields immediately if not a Shopify /products/ URL
		const shopify = await this.fetchShopifyProduct(link.url);
		if (shopify.title) title = shopify.title;
		if (shopify.description) candidates.push({ text: shopify.description, source: "shopify_api" });

		// Fetch HTML once — tiers 2, 3, 4 all parse the same string
		const html = await this.fetchHtml(link.url);
		if (html) {
			// Extract title from HTML if tier 1 didn't provide one
			if (!title) title = this.extractTitleFromHtml(html);

			// Tier 2 — DOM: full merchant-written product body
			const dom = this.extractDescriptionFromDom(html, link.url);
			if (dom) candidates.push({ text: dom, source: "dom" });

			// Tier 3 — JSON-LD structured data
			const jsonLd = this.extractDescriptionFromJsonLd(html, link.url);
			if (jsonLd) candidates.push({ text: jsonLd, source: "json_ld" });

			// Tier 4 — Meta tags (og:description, twitter:description, meta[name=description])
			const meta = this.extractDescriptionFromMeta(html, link.url);
			if (meta) candidates.push({ text: meta, source: "meta" });
		} else if (candidates.length === 0) {
			const failResult: CrawlResult = { url: link.url, description: "", success: false, error: "Failed to fetch product page" };
			debugCollector?.push({ url: link.url, title, success: false, error: failResult.error, winner: null, titlePrepended: false, finalLength: 0, candidates: [] });
			return failResult;
		}

		if (candidates.length === 0) {
			this.log("warn", "All tiers failed", { url: link.url });
			const failResult: CrawlResult = { url: link.url, description: "", success: false, error: "No description found" };
			debugCollector?.push({ url: link.url, title, success: false, error: failResult.error, winner: null, titlePrepended: false, finalLength: 0, candidates: [] });
			return failResult;
		}

		// Pick the longest candidate — more content is always more useful for the AI
		candidates.sort((a, b) => b.text.length - a.text.length);
		const winner = candidates[0];

		// Prepend the product title if it isn't already in the description text
		const titlePrepended = !!title && !winner.text.toLowerCase().includes(title.toLowerCase());
		const finalText = titlePrepended ? `${title}: ${winner.text}` : winner.text;

		this.log("info", "Extraction complete", {
			url: link.url,
			source: winner.source,
			length: finalText.length,
			candidates: candidates.length,
			titlePrepended,
		});

		if (debugCollector) {
			debugCollector.push({
				url: link.url,
				title,
				success: true,
				winner: { source: winner.source, length: finalText.length },
				titlePrepended,
				finalLength: finalText.length,
				candidates: candidates.map((c) => ({
					source: c.source,
					text: c.text,
					length: c.text.length,
					chosen: c === winner,
				})),
			});
		}

		return this.successResult(link.url, finalText, winner.source);
	}

	// ── Extraction tiers ───────────────────────────────────────────────────────

	private extractDescriptionFromJsonLd(html: string, url: string): string | null {
		const blocks = this.extractJsonLdBlocks(html);
		for (let i = 0; i < blocks.length; i++) {
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
			} catch { /* malformed JSON-LD block — skip */ }
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

	private extractDescriptionFromMeta(html: string, url: string): string | null {
		const text = this.extractMetaContent(html, "og:description", "twitter:description", "description");
		if (!text) return null;
		const v = this.validateDescription(text);
		if (!v.valid) { this.log("debug", "Meta tier rejected", { url, reason: v.reason }); return null; }
		this.log("info", "Meta tier succeeded", { url, length: text.length });
		return text;
	}

	private extractDescriptionFromDom(html: string, url: string): string | null {
		const candidates: string[] = [];

		for (const pattern of DESCRIPTION_ATTR_PATTERNS) {
			const text = this.findElementText(html, pattern);
			if (!text) continue;
			const truncated = this.truncate(text);
			const v = this.validateDescription(truncated);
			if (!v.valid) { this.log("debug", "DOM candidate rejected", { url, reason: v.reason }); continue; }
			candidates.push(truncated);
		}

		if (candidates.length === 0) return null;

		// Return the longest valid candidate — more content = more useful for the AI
		candidates.sort((a, b) => b.length - a.length);
		this.log("info", "DOM tier succeeded", { url, length: candidates[0].length, totalCandidates: candidates.length });
		return candidates[0];
	}

	// ── Helpers ────────────────────────────────────────────────────────────────

	private successResult(url: string, description: string, source: CrawlSource): CrawlResult {
		this.log("info", "Extraction complete", { url, source, length: description.length });
		return { url, description, success: true, source };
	}

	/** No-op — no browser to close. */
	async close(): Promise<void> {}
}

export const createScraperClient = (): IScraperClient => new ScraperClient();
