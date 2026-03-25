export interface CollectionSEOSection {
	h2: string;
	content: string;
}

export interface GeneratedContent {
	h1: string;
	intro: string;
	sections: CollectionSEOSection[];
}

export interface HumanizedContent extends GeneratedContent {
	changes: string[];
}

export interface IAIClient {
	generateDraft(
		productDescriptions: string[],
		keywords: string[],
		brandGuidelines: string,
		sectionCount: number,
		preApprovedContent?: string,
	): Promise<GeneratedContent>;

	humanizeContent(
		draft: GeneratedContent,
		keywords: string[],
		brandGuidelines: string,
		sectionCount: number,
		preApprovedContent?: string,
	): Promise<HumanizedContent>;

	refineContent(
		currentContent: GeneratedContent,
		feedback: string,
		keywords: string[],
		brandGuidelines: string,
		productDescriptions: string[],
	): Promise<GeneratedContent>;
}
