import { createAIClient } from "@/common/clients/ai/anthropicAIClient";
import { createScraperClient } from "@/common/clients/scraper/scraperClient";
import type { GeneratedContent, HumanizedContent } from "@/common/clients/ai/IAIClient";

type SendEvent = (type: string, data: unknown) => Promise<void>;

export async function generateCollectionContent(
	collectionUrl: string,
	keywords: string[],
	brandGuidelines: string,
	sendEvent: SendEvent,
): Promise<void> {
	console.info("[CollectionController] Generate request started", {
		collectionUrl,
		keywordsCount: keywords.length,
		hasBrandGuidelines: Boolean(brandGuidelines?.trim()),
	});

	const scraper = createScraperClient();
	const ai = createAIClient();

	try {
		// Step 1: Crawl collection page for product links
		await sendEvent("progress", { stage: "crawling_collection", message: "Loading collection page..." });

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

		if (productLinks.length === 0) {
			await sendEvent("error", {
				message: "No product links found on this page. Make sure the URL points to a collection or category page with product listings.",
			});
			return;
		}

		console.info("[CollectionController] Collection crawl complete", {
			collectionUrl,
			productLinksFound: productLinks.length,
		});

		await sendEvent("progress", {
			stage: "crawling_products",
			message: `Found ${productLinks.length} products. Starting to crawl...`,
			totalProducts: productLinks.length,
		});

		// Step 2: Crawl each product page
		const crawlResults = await scraper.crawlProductPages(productLinks, async (msg) => {
			await sendEvent("progress", { stage: "crawling_products", message: msg });
		});

		const successful = crawlResults.filter((r) => r.success && r.description);
		const failed = crawlResults.filter((r) => !r.success);
		const sourceDistribution = crawlResults.reduce<Record<string, number>>((acc, result) => {
			const key = result.source ?? "none";
			acc[key] = (acc[key] || 0) + 1;
			return acc;
		}, {});

		console.info("[CollectionController] Product crawl complete", {
			totalResults: crawlResults.length,
			successCount: successful.length,
			failureCount: failed.length,
			sourceDistribution,
		});

		if (successful.length === 0) {
			await sendEvent("error", {
				message: "Could not extract descriptions from any product pages. The site may use a non-standard layout.",
			});
			return;
		}

		await sendEvent("progress", {
			stage: "crawling_complete",
			message: `Crawled ${successful.length} of ${crawlResults.length} products successfully`,
			crawledProducts: crawlResults,
			failedUrls: failed.map((f) => f.url),
		});

		// Step 3: Generate draft with AI
		await sendEvent("progress", { stage: "generating_draft", message: "Generating SEO draft..." });

		let draft: GeneratedContent;
		try {
			draft = await ai.generateDraft(
				successful.map((r) => r.description),
				keywords,
				brandGuidelines,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			await sendEvent("error", { message: `Failed to generate draft: ${message}` });
			return;
		}

		console.info("[CollectionController] Draft generation complete", {
			descriptionLength: draft.collectionDescription.length,
		});

		await sendEvent("draft", { draft });

		// Step 4: Humanize the content
		await sendEvent("progress", { stage: "humanizing", message: "Humanizing content..." });

		let humanized: HumanizedContent;
		try {
			humanized = await ai.humanizeContent(draft, keywords, brandGuidelines);
		} catch (_err) {
			// Fallback: show draft if humanizer fails
			const fallbackHumanized = { ...draft, changes: ["Humanization failed — showing original draft"] };
			await sendEvent("humanized", { humanized: fallbackHumanized, fallback: true });
			await sendEvent("complete", {
				draft,
				humanized: fallbackHumanized,
				crawledProducts: crawlResults,
				failedUrls: failed.map((f) => f.url),
				totalFound: productLinks.length,
			});
			return;
		}

		console.info("[CollectionController] Humanization complete", {
			descriptionLength: humanized.collectionDescription.length,
			changesCount: humanized.changes.length,
		});

		await sendEvent("humanized", { humanized });

		// Step 5: Send complete result
		await sendEvent("complete", {
			draft,
			humanized,
			crawledProducts: crawlResults,
			failedUrls: failed.map((f) => f.url),
			totalFound: productLinks.length,
		});
		console.info("[CollectionController] Generate request finished", {
			collectionUrl,
			totalFound: productLinks.length,
			successCount: successful.length,
			failureCount: failed.length,
		});
	} finally {
		await scraper.close();
	}
}

export async function regenerateHumanized(
	draft: GeneratedContent,
	keywords: string[],
	brandGuidelines: string,
): Promise<HumanizedContent> {
	const ai = createAIClient();
	return ai.humanizeContent(draft, keywords, brandGuidelines);
}

export async function refineContent(
	currentContent: string,
	feedback: string,
	keywords: string[],
	brandGuidelines: string,
	productDescriptions: string[],
): Promise<GeneratedContent> {
	const ai = createAIClient();
	return ai.refineContent(currentContent, feedback, keywords, brandGuidelines, productDescriptions);
}
