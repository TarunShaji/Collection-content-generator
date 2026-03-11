export interface ProductLink {
	url: string;
	title?: string;
}

export interface CrawlResult {
	url: string;
	description: string;
	success: boolean;
	error?: string;
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
