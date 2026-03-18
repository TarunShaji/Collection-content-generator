import { type Browser, type Page, chromium } from "playwright";
import { settings } from "@/common/config/settings";
import type {
	CrawlResult,
	CrawlSource,
	IScraperClient,
	ProductLink,
	ProgressCallback,
} from "./IScraperClient";

class ScraperClient implements IScraperClient {
	private browser: Browser | null = null;

	private readonly blockedDescriptionPatterns = [
		"shipping calculated at checkout",
		"tax included",
		"taxes included",
		"return policy",
		"returns policy",
		"free shipping",
	];

	private log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, unknown>): void {
		const payload = context ? ` ${JSON.stringify(context)}` : "";
		const line = `[ScraperClient] ${message}${payload}`;

		switch (level) {
			case "warn":
				console.warn(line);
				break;
			case "error":
				console.error(line);
				break;
			case "debug":
				console.debug(line);
				break;
			default:
				console.info(line);
		}
	}

	private normalizeText(input: string): string {
		return input.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
	}

	private decodeHtmlEntities(input: string): string {
		return input
			.replace(/&nbsp;/gi, " ")
			.replace(/&amp;/gi, "&")
			.replace(/&quot;/gi, '"')
			.replace(/&#39;/gi, "'")
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">")
			.replace(/&apos;/gi, "'");
	}

	private stripHtml(input: string): string {
		const noScripts = input
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
			.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
		const noTags = noScripts.replace(/<[^>]+>/g, " ");
		return this.normalizeText(this.decodeHtmlEntities(noTags));
	}

	private parseHtmlBlocks(html: string): Array<{ tag: string; text: string }> {
		const blockPattern = /<(h[1-6]|p|li|div)[^>]*>([\s\S]*?)<\/\1>/gi;
		const blocks: Array<{ tag: string; text: string }> = [];
		let match: RegExpExecArray | null;

		while ((match = blockPattern.exec(html)) !== null) {
			const tag = match[1].toLowerCase();
			const inner = this.normalizeText(this.decodeHtmlEntities(match[2].replace(/<[^>]+>/g, " ")));
			if (inner.length > 0) blocks.push({ tag, text: inner });
		}

		return blocks;
	}

	private isStructuralBoundary(text: string): boolean {
		const boundaries = [
			/^(product[\s-]details|standard\s+faqs|product[\s-]specific\s+faqs)/i,
			/^about\s+[A-Z]{2}/i,
			/^(shipping|returns?|refund)\s+(policy|info|information)/i,
			/^(fit|fabric|features)[,\s+&]/i,
			/^(size\s+&?\s*fit|size\s+chart)/i,
			/^(care\s+instructions|how\s+to\s+care)/i,
			/^(ingredients|nutrition\s+facts)/i,
			/^(shipping|delivery|returns?)\s*$/i,
			/^q:\s/i,
			/^#{2,}\s/,
			/\d+\s*%\s*(cotton|polyester|spandex|nylon|wool|linen)/i,
		];
		return boundaries.some((b) => b.test(text));
	}

	private extractLeadDescription(bodyHtml: string): string | null {
		const blocks = this.parseHtmlBlocks(bodyHtml);
		const collected: string[] = [];

		for (const block of blocks) {
			// Section headings are labels; avoid mixing them into product body copy.
			if (block.tag.match(/^h[1-6]$/)) continue;

			const text = block.text;
			if (!text || text.length < 5) continue;

			if (this.isStructuralBoundary(text)) break;

			collected.push(text);

			// Hard cap in case the page has no clear structural boundary.
			if (collected.join(" ").length > 600) break;
		}

		const result = collected.join(" ").trim();
		this.log("debug", "Shopify lead extraction summary", {
			blocksCount: blocks.length,
			collectedBlocks: collected.length,
			resultLength: result.length,
		});

		return result.length >= 20 ? result : null;
	}

	private validateDescriptionCandidate(text: string): { valid: boolean; reason?: string } {
		if (!text) return { valid: false, reason: "empty" };
		if (text.length < 20) return { valid: false, reason: "too_short" };

		const lower = text.toLowerCase();
		for (const pattern of this.blockedDescriptionPatterns) {
			if (lower.includes(pattern)) {
				return { valid: false, reason: `blocked_pattern:${pattern}` };
			}
		}

		return { valid: true };
	}

	private async getBrowser(): Promise<Browser> {
		if (!this.browser) {
			this.log("info", "Launching Playwright browser", { headless: true });
			this.browser = await chromium.launch({ headless: true });
		}
		return this.browser;
	}

	async crawlCollectionPage(url: string, onProgress: ProgressCallback): Promise<ProductLink[]> {
		this.log("info", "Starting collection crawl", { url });
		const browser = await this.getBrowser();
		const context = await browser.newContext({
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		});
		const page = await context.newPage();

		try {
			await onProgress("Loading collection page...");
			await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: settings.scraper.pageTimeout,
			});
			await page.waitForTimeout(2000);

			const allLinks: ProductLink[] = [];
			let pageNum = 1;

			while (true) {
				await onProgress(`Scanning page ${pageNum} for product links...`);
				const links = await this.extractProductLinks(page, url);
				this.log("info", "Extracted product links from page", {
					page: pageNum,
					count: links.length,
				});
				allLinks.push(...links);

				const hasNextPage = await this.goToNextPage(page);
				if (!hasNextPage) break;

				pageNum++;
				await page.waitForTimeout(2000);
			}

			const uniqueLinks = this.deduplicateLinks(allLinks);
			this.log("info", "Collection crawl complete", {
				pagesScanned: pageNum,
				totalLinks: allLinks.length,
				uniqueLinks: uniqueLinks.length,
			});
			await onProgress(`Found ${uniqueLinks.length} product links`);
			return uniqueLinks;
		} finally {
			await context.close();
		}
	}

	private async extractProductLinks(page: Page, collectionUrl: string): Promise<ProductLink[]> {
		const baseUrl = new URL(collectionUrl).origin;

		return page.evaluate((base: string) => {
			const links: { url: string; title?: string }[] = [];
			const anchors = document.querySelectorAll("a[href]");

			for (const anchor of anchors) {
				const href = anchor.getAttribute("href");
				if (!href) continue;

				let fullUrl: string;
				try {
					fullUrl = href.startsWith("http") ? href : new URL(href, base).href;
				} catch {
					continue;
				}

				const isProduct =
					/\/products\//.test(fullUrl) ||
					/\/product\//.test(fullUrl) ||
					/\/p\//.test(fullUrl) ||
					/\/dp\//.test(fullUrl);

				if (isProduct) {
					const title = anchor.textContent?.trim() || undefined;
					links.push({ url: fullUrl, title });
				}
			}

			return links;
		}, baseUrl);
	}

	private async goToNextPage(page: Page): Promise<boolean> {
		const nextSelectors = [
			'a[rel="next"]',
			'a:has-text("Next")',
			'a:has-text("next")',
			".pagination a:last-child",
			'a[aria-label="Next page"]',
			"a.next",
			".next a",
		];

		for (const selector of nextSelectors) {
			try {
				const el = await page.$(selector);
				if (!el) continue;

				const isVisible = await el.isVisible();
				if (!isVisible) continue;

				this.log("debug", "Paginating to next collection page", { selector });
				await el.click();
				await page.waitForLoadState("domcontentloaded");
				return true;
			} catch {
				continue;
			}
		}

		return false;
	}

	private deduplicateLinks(links: ProductLink[]): ProductLink[] {
		const seen = new Set<string>();
		const deduped = links.filter((link) => {
			const normalized = link.url.split("?")[0].replace(/\/$/, "");
			if (seen.has(normalized)) return false;
			seen.add(normalized);
			return true;
		});

		this.log("info", "Deduplicated product links", {
			before: links.length,
			after: deduped.length,
			duplicatesRemoved: links.length - deduped.length,
		});

		return deduped;
	}

	async crawlProductPages(links: ProductLink[], onProgress: ProgressCallback): Promise<CrawlResult[]> {
		const browser = await this.getBrowser();
		const results: CrawlResult[] = [];
		const concurrency = settings.scraper.concurrency;

		this.log("info", "Starting product crawl", {
			totalProducts: links.length,
			concurrency,
			delayBetweenRequestsMs: settings.scraper.delayBetweenRequests,
		});

		for (let i = 0; i < links.length; i += concurrency) {
			const batch = links.slice(i, i + concurrency);
			const batchNo = Math.floor(i / concurrency) + 1;
			this.log("info", "Processing crawl batch", {
				batchNumber: batchNo,
				batchSize: batch.length,
				startIndex: i,
			});

			const batchPromises = batch.map(async (link, batchIdx) => {
				const idx = i + batchIdx + 1;
				await onProgress(`Crawling product ${idx} of ${links.length}: ${link.title || link.url}`);
				return this.crawlSingleProduct(browser, link, idx, links.length);
			});

			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);

			const successCount = batchResults.filter((r) => r.success).length;
			this.log("info", "Batch complete", {
				batchNumber: batchNo,
				successCount,
				failureCount: batchResults.length - successCount,
			});

			if (i + concurrency < links.length) {
				await new Promise((r) => setTimeout(r, settings.scraper.delayBetweenRequests));
			}
		}

		const totalSuccess = results.filter((r) => r.success).length;
		this.log("info", "Product crawl complete", {
			total: results.length,
			success: totalSuccess,
			failed: results.length - totalSuccess,
		});

		return results;
	}

	private isLikelyShopifyProductUrl(productUrl: string): boolean {
		try {
			const { pathname } = new URL(productUrl);
			return /\/products\//.test(pathname);
		} catch {
			return false;
		}
	}

	private extractShopifyHandle(productUrl: string): string | null {
		try {
			const { pathname } = new URL(productUrl);
			const match = pathname.match(/\/products\/([^/?#]+)/);
			return match?.[1] ? decodeURIComponent(match[1]) : null;
		} catch {
			return null;
		}
	}

	private async fetchShopifyProductDescription(productUrl: string): Promise<string | null> {
		const handle = this.extractShopifyHandle(productUrl);
		if (!handle) {
			this.log("debug", "Could not extract Shopify handle", { productUrl });
			return null;
		}

		const origin = new URL(productUrl).origin;
		const jsonUrl = `${origin}/products/${encodeURIComponent(handle)}.json`;
		this.log("info", "Attempting Shopify API extraction", { productUrl, jsonUrl, handle });

		try {
			const response = await fetch(jsonUrl, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
					Accept: "application/json,text/plain,*/*",
				},
				signal: AbortSignal.timeout(Math.min(settings.scraper.pageTimeout, 15000)),
			});

			if (!response.ok) {
				this.log("warn", "Shopify API returned non-OK response", {
					jsonUrl,
					status: response.status,
					statusText: response.statusText,
				});
				return null;
			}

			const data = (await response.json()) as { product?: { body_html?: string | null } };
			const bodyHtml = data.product?.body_html;
			if (!bodyHtml) {
				this.log("warn", "Shopify API response missing body_html", { jsonUrl });
				return null;
			}

			const lead = this.extractLeadDescription(bodyHtml);
			if (!lead) {
				this.log("warn", "Shopify API body_html yielded no lead description", { jsonUrl });
				return null;
			}

			this.log("info", "Shopify API extraction succeeded", {
				jsonUrl,
				length: lead.length,
			});
			return lead;
		} catch (err) {
			this.log("warn", "Shopify API extraction failed", {
				jsonUrl,
				error: err instanceof Error ? err.message : "Unknown error",
			});
			return null;
		}
	}

	private extractJsonLdObjects(parsed: unknown): unknown[] {
		if (!parsed) return [];
		if (Array.isArray(parsed)) return parsed.flatMap((item) => this.extractJsonLdObjects(item));
		if (typeof parsed !== "object") return [];

		const record = parsed as Record<string, unknown>;
		const graph = record["@graph"];
		if (Array.isArray(graph)) {
			return [record, ...graph.flatMap((item) => this.extractJsonLdObjects(item))];
		}

		return [record];
	}

	private hasProductType(node: Record<string, unknown>): boolean {
		const typeValue = node["@type"];
		if (typeof typeValue === "string") return typeValue.toLowerCase() === "product";
		if (Array.isArray(typeValue)) {
			return typeValue.some((entry) => typeof entry === "string" && entry.toLowerCase() === "product");
		}
		return false;
	}

	private async extractFromJsonLd(page: Page, url: string): Promise<string | null> {
		this.log("debug", "Trying JSON-LD tier", { url });
		try {
			const blocks = await page.$$eval("script[type='application/ld+json']", (scripts) =>
				scripts.map((script) => script.textContent || ""),
			);

			this.log("debug", "JSON-LD blocks discovered", { url, blocks: blocks.length });

			for (let i = 0; i < blocks.length; i++) {
				const block = blocks[i];
				if (!block.trim()) continue;

				try {
					const parsed = JSON.parse(block);
					const items = this.extractJsonLdObjects(parsed);
					this.log("debug", "Parsed JSON-LD block", {
						url,
						blockIndex: i,
						flattenedNodes: items.length,
					});

					for (const item of items) {
						if (!item || typeof item !== "object") continue;
						const node = item as Record<string, unknown>;

						this.log("debug", "JSON-LD node type found", {
							url,
							blockIndex: i,
							type: node["@type"] ?? "missing",
						});

						if (!this.hasProductType(node)) continue;

						const description = typeof node.description === "string" ? this.normalizeText(node.description) : "";
						const validation = this.validateDescriptionCandidate(description);
						if (!validation.valid) {
							this.log("debug", "Rejected JSON-LD description candidate", {
								url,
								blockIndex: i,
								reason: validation.reason,
								length: description.length,
							});
							continue;
						}

						this.log("info", "JSON-LD extraction succeeded", {
							url,
							blockIndex: i,
							length: description.length,
						});
						return description;
					}
				} catch (err) {
					this.log("debug", "Skipping invalid JSON-LD block", {
						url,
						blockIndex: i,
						error: err instanceof Error ? err.message : "Unknown parse error",
					});
				}
			}
		} catch (err) {
			this.log("warn", "JSON-LD extraction errored", {
				url,
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}

		return null;
	}

	private async extractFromMetaTags(page: Page, url: string): Promise<string | null> {
		this.log("debug", "Trying meta tier", { url });
		try {
			const candidates = await page.evaluate(() => {
				const get = (selector: string) => document.querySelector(selector)?.getAttribute("content")?.trim() || "";
				return {
					og: get('meta[property="og:description"]'),
					twitter: get('meta[name="twitter:description"]'),
					meta: get('meta[name="description"]'),
				};
			});

			const ordered: Array<{ source: string; text: string }> = [
				{ source: "og:description", text: candidates.og },
				{ source: "twitter:description", text: candidates.twitter },
				{ source: "meta:description", text: candidates.meta },
			];

			for (const candidate of ordered) {
				const normalized = this.normalizeText(candidate.text);
				const validation = this.validateDescriptionCandidate(normalized);
				if (!validation.valid) {
					if (normalized.length > 0) {
						this.log("debug", "Rejected meta description candidate", {
							url,
							source: candidate.source,
							reason: validation.reason,
							length: normalized.length,
						});
					}
					continue;
				}

				this.log("info", "Meta extraction succeeded", {
					url,
					source: candidate.source,
					length: normalized.length,
				});
				return normalized;
			}
		} catch (err) {
			this.log("warn", "Meta extraction errored", {
				url,
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}

		return null;
	}

	private async tryExpandDescriptionPanel(page: Page, url: string): Promise<void> {
		const triggerSelectors = [
			'button[aria-expanded="false"][aria-controls*="description"]',
			'button[aria-expanded="false"][aria-controls*="detail"]',
			'button[aria-expanded="false"][aria-controls*="product"]',
			'.accordion-trigger[aria-expanded="false"]',
			'[data-accordion-trigger][aria-expanded="false"]',
			'.accordion__title[aria-expanded="false"]',
			'.tabs__tab[aria-selected="false"]',
		];

		for (const selector of triggerSelectors) {
			try {
				const trigger = await page.$(selector);
				if (!trigger) continue;
				const visible = await trigger.isVisible();
				if (!visible) continue;

				await trigger.click({ timeout: 1000 }).catch(() => undefined);
				await page.waitForTimeout(300);
				this.log("debug", "Attempted accordion/tab expansion", { url, selector });
				return;
			} catch {
				continue;
			}
		}
	}

	private async extractFromDom(page: Page, url: string): Promise<string | null> {
		this.log("debug", "Trying DOM tier", { url });
		await this.tryExpandDescriptionPanel(page, url);

		const selectors = [
			'[data-product-description]',
			'[data-description]',
			'.product__description',
			'.product-single__description',
			'.product-details__description',
			'.product-info__description',
			'.product-detail__description',
			'.product_description',
			'.product-description',
			'#product-description',
			'.pdp-description',
			'.accordion-panel-inner',
			'.accordion__content',
			'[data-accordion-content]',
			'[data-tab-content]',
			'[itemprop="description"]',
			'[class*="product-description"]',
			'[class*="ProductDescription"]',
			'[class*="product_description"]',
			'[class*="pdp-description"]',
			'.product__description .rte',
			'.accordion-panel-inner .rte',
			'.product-body .rte',
			'.tab-content .rte',
			'.product-body',
			'.description',
		];

		for (const selector of selectors) {
			try {
				const el = await page.$(selector);
				if (!el) continue;

				const visible = await el.isVisible();
				if (!visible) {
					this.log("debug", "Skipping hidden DOM candidate", { url, selector });
					continue;
				}

				const text = this.normalizeText(await el.innerText());
				const validation = this.validateDescriptionCandidate(text);
				if (!validation.valid) {
					this.log("debug", "Rejected DOM candidate", {
						url,
						selector,
						reason: validation.reason,
						length: text.length,
					});
					continue;
				}

				this.log("info", "DOM extraction succeeded", { url, selector, length: text.length });
				return text;
			} catch (err) {
				this.log("debug", "DOM selector evaluation failed", {
					url,
					selector,
					error: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}

		return null;
	}

	private async crawlSingleProduct(
		browser: Browser,
		link: ProductLink,
		index: number,
		total: number,
	): Promise<CrawlResult> {
		this.log("info", "Starting product extraction", {
			index,
			total,
			url: link.url,
			title: link.title || null,
		});

		if (this.isLikelyShopifyProductUrl(link.url)) {
			const shopifyDescription = await this.fetchShopifyProductDescription(link.url);
			if (shopifyDescription) {
				this.log("info", "Product extraction completed", {
					url: link.url,
					source: "shopify_api",
					length: shopifyDescription.length,
				});
				return {
					url: link.url,
					description: shopifyDescription,
					success: true,
					source: "shopify_api",
				};
			}
			this.log("warn", "Shopify API tier did not produce valid description, falling back to browser tiers", {
				url: link.url,
			});
		}

		const context = await browser.newContext({
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		});
		const page = await context.newPage();

		try {
			await page.goto(link.url, {
				waitUntil: "domcontentloaded",
				timeout: settings.scraper.pageTimeout,
			});
			await page.waitForTimeout(1500);

			const jsonLdDescription = await this.extractFromJsonLd(page, link.url);
			if (jsonLdDescription) {
				return this.successResult(link.url, jsonLdDescription, "json_ld");
			}

			const metaDescription = await this.extractFromMetaTags(page, link.url);
			if (metaDescription) {
				return this.successResult(link.url, metaDescription, "meta");
			}

			const domDescription = await this.extractFromDom(page, link.url);
			if (domDescription) {
				return this.successResult(link.url, domDescription, "dom");
			}

			this.log("warn", "All extraction tiers failed for product", { url: link.url });
			return {
				url: link.url,
				description: "",
				success: false,
				error: "No product description found after trying Shopify API, JSON-LD, meta, and DOM tiers",
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			this.log("error", "Product extraction crashed", { url: link.url, error: message });
			return { url: link.url, description: "", success: false, error: message };
		} finally {
			await context.close();
		}
	}

	private successResult(url: string, description: string, source: CrawlSource): CrawlResult {
		this.log("info", "Product extraction completed", {
			url,
			source,
			length: description.length,
		});
		return {
			url,
			description,
			success: true,
			source,
		};
	}

	async close(): Promise<void> {
		if (this.browser) {
			this.log("info", "Closing Playwright browser");
			await this.browser.close();
			this.browser = null;
		}
	}
}

export const createScraperClient = (): IScraperClient => new ScraperClient();
