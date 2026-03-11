export interface GeneratedContent {
	collectionDescription: string;
}

export interface HumanizedContent extends GeneratedContent {
	changes: string[];
}

export interface IAIClient {
	generateDraft(
		productDescriptions: string[],
		keywords: string[],
		brandGuidelines: string,
	): Promise<GeneratedContent>;

	humanizeContent(
		draft: GeneratedContent,
		keywords: string[],
		brandGuidelines: string,
	): Promise<HumanizedContent>;

	refineContent(
		currentContent: string,
		feedback: string,
		keywords: string[],
		brandGuidelines: string,
		productDescriptions: string[],
	): Promise<GeneratedContent>;
}
