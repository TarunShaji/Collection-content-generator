import { type Browser, type Page, chromium } from "playwright";
import { settings } from "@/common/config/settings";
import type { CrawlResult, IScraperClient, ProductLink, ProgressCallback } from "./IScraperClient";

class ScraperClient implements IScraperClient {
	private browser: Browser | null = null;

	private async getBrowser(): Promise<Browser> {
		if (!this.browser) {
			this.browser = await chromium.launch({ headless: true });
		}
		return this.browser;
	}

	async crawlCollectionPage(url: string, onProgress: ProgressCallback): Promise<ProductLink[]> {
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
				allLinks.push(...links);

				const hasNextPage = await this.goToNextPage(page);
				if (!hasNextPage) break;

				pageNum++;
				await page.waitForTimeout(2000);
			}

			const uniqueLinks = this.deduplicateLinks(allLinks);
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

				const isExcluded =
					/\/(collections|categories|cart|account|search|pages|blogs)\//i.test(fullUrl);

				if (isProduct && !isExcluded) {
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
				if (el) {
					const isVisible = await el.isVisible();
					if (isVisible) {
						await el.click();
						await page.waitForLoadState("domcontentloaded");
						return true;
					}
				}
			} catch {
				continue;
			}
		}

		return false;
	}

	private deduplicateLinks(links: ProductLink[]): ProductLink[] {
		const seen = new Set<string>();
		return links.filter((link) => {
			const normalized = link.url.split("?")[0].replace(/\/$/, "");
			if (seen.has(normalized)) return false;
			seen.add(normalized);
			return true;
		});
	}

	async crawlProductPages(
		links: ProductLink[],
		onProgress: ProgressCallback,
	): Promise<CrawlResult[]> {
		const browser = await this.getBrowser();
		const results: CrawlResult[] = [];
		const concurrency = settings.scraper.concurrency;

		for (let i = 0; i < links.length; i += concurrency) {
			const batch = links.slice(i, i + concurrency);
			const batchPromises = batch.map(async (link, batchIdx) => {
				const idx = i + batchIdx + 1;
				await onProgress(`Crawling product ${idx} of ${links.length}: ${link.title || link.url}`);
				return this.crawlSingleProduct(browser, link);
			});

			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);

			if (i + concurrency < links.length) {
				await new Promise((r) => setTimeout(r, settings.scraper.delayBetweenRequests));
			}
		}

		return results;
	}

	private async crawlSingleProduct(browser: Browser, link: ProductLink): Promise<CrawlResult> {
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

			const description = await this.extractProductDescription(page);

			if (!description || description.length < 20) {
				return {
					url: link.url,
					description: "",
					success: false,
					error: "No product description found",
				};
			}

			return { url: link.url, description, success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			return { url: link.url, description: "", success: false, error: message };
		} finally {
			await context.close();
		}
	}

	private async extractProductDescription(page: Page): Promise<string> {
		const selectors = [
			'[data-product-description]',
			'.product-description',
			'.product__description',
			'#product-description',
			'.product-single__description',
			'.product-details__description',
			'.product_description',
			'.pdp-description',
			'[class*="product-description"]',
			'[class*="ProductDescription"]',
			'[class*="product_description"]',
			'[itemprop="description"]',
			'.description',
			'.product-body',
			'.product-info__description',
			'.product-detail__description',
			'.rte',
		];

		for (const selector of selectors) {
			try {
				const el = await page.$(selector);
				if (el) {
					const text = await el.innerText();
					const cleaned = text.trim();
					if (cleaned.length > 20) return cleaned;
				}
			} catch {
				continue;
			}
		}

		// Fallback: look for meta description
		const metaDesc = await page
			.$eval('meta[name="description"]', (el) => el.getAttribute("content"))
			.catch(() => null);
		if (metaDesc && metaDesc.length > 20) return metaDesc;

		// Fallback: look for og:description
		const ogDesc = await page
			.$eval('meta[property="og:description"]', (el) => el.getAttribute("content"))
			.catch(() => null);
		if (ogDesc && ogDesc.length > 20) return ogDesc;

		return "";
	}

	async close(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
		}
	}
}

export const createScraperClient = (): IScraperClient => new ScraperClient();
