export interface ProductLink {
	url: string;
	title?: string;
}

export type CrawlSource = "shopify_api" | "json_ld" | "meta" | "dom";

export interface CrawlResult {
	url: string;
	description: string;
	success: boolean;
	error?: string;
	source?: CrawlSource;
}

export interface CollectionCrawlResult {
	collectionUrl: string;
	products: CrawlResult[];
	failedUrls: string[];
	totalFound: number;
}

export type ProgressCallback = (message: string) => void | Promise<void>;

export interface IScraperClient {
	crawlCollectionPage(
		url: string,
		onProgress: ProgressCallback,
	): Promise<ProductLink[]>;

	crawlProductPages(
		links: ProductLink[],
		onProgress: ProgressCallback,
	): Promise<CrawlResult[]>;

	close(): Promise<void>;
}
