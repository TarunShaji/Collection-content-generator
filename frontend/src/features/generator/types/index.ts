export interface GeneratedContent {
	collectionDescription: string;
}

export interface HumanizedContent extends GeneratedContent {
	changes: string[];
}

export interface CrawlResult {
	url: string;
	description: string;
	success: boolean;
	error?: string;
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
