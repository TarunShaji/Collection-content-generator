import { z } from "zod";

const CollectionSeoContentSchema = z.object({
	h1: z.string().min(1, "h1 is required"),
	intro: z.string().min(1, "intro is required"),
	sections: z
		.array(
			z.object({
				h2: z.string().min(1, "section h2 is required"),
				content: z.string().min(1, "section content is required"),
			}),
		)
		.min(1, "At least one section is required"),
});

export const GenerateSchema = z.object({
	collectionUrl: z.string().url("Must be a valid URL"),
	keywords: z.string().min(1, "At least one keyword is required"),
	brandGuidelines: z.string().min(1, "Brand guidelines are required"),
	sectionCount: z.number().int().min(1).max(10).default(2),
	preApprovedContent: z.string().optional(),
});

export const RegenerateSchema = z.object({
	draft: CollectionSeoContentSchema,
	keywords: z.string(),
	brandGuidelines: z.string(),
	sectionCount: z.number().int().min(1).max(10).default(2),
	preApprovedContent: z.string().optional(),
});

export const RefineSchema = z.object({
	currentContent: CollectionSeoContentSchema,
	feedback: z.string().min(1, "Feedback is required"),
	keywords: z.string(),
	brandGuidelines: z.string(),
	productDescriptions: z.array(z.string()).optional().default([]),
});
