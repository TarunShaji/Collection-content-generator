import { z } from "zod";

export const GenerateSchema = z.object({
	collectionUrl: z.string().url("Must be a valid URL"),
	keywords: z.string().min(1, "At least one keyword is required"),
	brandGuidelines: z.string().min(1, "Brand guidelines are required"),
});

export const RegenerateSchema = z.object({
	draft: z.object({
		collectionDescription: z.string(),
	}),
	keywords: z.string(),
	brandGuidelines: z.string(),
});

export const RefineSchema = z.object({
	currentContent: z.string().min(1, "Current content is required"),
	feedback: z.string().min(1, "Feedback is required"),
	keywords: z.string(),
	brandGuidelines: z.string(),
	productDescriptions: z.array(z.string()).optional().default([]),
});
