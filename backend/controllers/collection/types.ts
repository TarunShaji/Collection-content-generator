import type { GeneratedContent, HumanizedContent } from "@/common/clients/ai/IAIClient";
import type { CrawlResult } from "@/common/clients/scraper/IScraperClient";

export interface GenerateRequest {
	collectionUrl: string;
	keywords: string;
	brandGuidelines: string;
}

export interface RegenerateRequest {
	draft: GeneratedContent;
	keywords: string;
	brandGuidelines: string;
}

export interface GenerateResult {
	draft: GeneratedContent;
	humanized: HumanizedContent;
	crawledProducts: CrawlResult[];
	failedUrls: string[];
	totalFound: number;
}

export interface SSEEvent {
	type: "progress" | "draft" | "humanized" | "complete" | "error";
	data: unknown;
}
