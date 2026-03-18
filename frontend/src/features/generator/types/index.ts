export interface CollectionSEOSection {
	h2: string;
	content: string;
}

export interface CollectionSEOContent {
	h1: string;
	intro: string;
	section1: CollectionSEOSection;
	section2: CollectionSEOSection;
}

export interface GeneratedContent extends CollectionSEOContent {}

export interface HumanizedContent extends CollectionSEOContent {
	changes: string[];
}

export interface CrawlResult {
	url: string;
	description: string;
	success: boolean;
	error?: string;
	source?: "shopify_api" | "json_ld" | "meta" | "dom";
}

export interface ProgressEvent {
	stage: string;
	message: string;
	totalProducts?: number;
	crawledProducts?: CrawlResult[];
	failedUrls?: string[];
}

export interface GenerateCompleteData {
	draft: GeneratedContent;
	humanized: HumanizedContent;
	crawledProducts: CrawlResult[];
	failedUrls: string[];
	totalFound: number;
}

export type GeneratorStage =
	| "idle"
	| "crawling_collection"
	| "crawling_products"
	| "crawling_complete"
	| "generating_draft"
	| "humanizing"
	| "complete"
	| "error";
