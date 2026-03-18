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
		currentContent: GeneratedContent,
		feedback: string,
		keywords: string[],
		brandGuidelines: string,
		productDescriptions: string[],
	): Promise<GeneratedContent>;
}
