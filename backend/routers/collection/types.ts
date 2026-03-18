import { z } from "zod";

const CollectionSeoContentSchema = z.object({
	h1: z.string().min(1, "h1 is required"),
	intro: z.string().min(1, "intro is required"),
	section1: z.object({
		h2: z.string().min(1, "section1.h2 is required"),
		content: z.string().min(1, "section1.content is required"),
	}),
	section2: z.object({
		h2: z.string().min(1, "section2.h2 is required"),
		content: z.string().min(1, "section2.content is required"),
	}),
});

export const GenerateSchema = z.object({
	collectionUrl: z.string().url("Must be a valid URL"),
	keywords: z.string().min(1, "At least one keyword is required"),
	brandGuidelines: z.string().min(1, "Brand guidelines are required"),
});

export const RegenerateSchema = z.object({
	draft: CollectionSeoContentSchema,
	keywords: z.string(),
	brandGuidelines: z.string(),
});

export const RefineSchema = z.object({
	currentContent: CollectionSeoContentSchema,
	feedback: z.string().min(1, "Feedback is required"),
	keywords: z.string(),
	brandGuidelines: z.string(),
	productDescriptions: z.array(z.string()).optional().default([]),
});
