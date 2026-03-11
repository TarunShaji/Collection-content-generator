import Anthropic from "@anthropic-ai/sdk";
import { settings } from "@/common/config/settings";
import type { GeneratedContent, HumanizedContent, IAIClient } from "./IAIClient";

class AnthropicAIClient implements IAIClient {
	private client: Anthropic;

	constructor() {
		this.client = new Anthropic({ apiKey: settings.anthropic.apiKey });
	}

	async generateDraft(
		productDescriptions: string[],
		keywords: string[],
		brandGuidelines: string,
	): Promise<GeneratedContent> {
		const descriptionsText = productDescriptions
			.map((d, i) => `Product ${i + 1}:\n${d}`)
			.join("\n\n---\n\n");

		const prompt = `You are an expert SEO copywriter for ecommerce. Your task is to write a collection page description based on the product descriptions below.

## Product Descriptions from this Collection:
${descriptionsText}

## Target Keywords:
${keywords.join(", ")}

## Brand Guidelines:
${brandGuidelines}

## Instructions:
1. Analyze ALL the product descriptions to understand what this collection is about, the common themes, product types, and language used.
2. Write a collection page description that is between 600 and 800 characters (including spaces). COUNT CAREFULLY — this is characters, not words.
3. Naturally incorporate the target keywords without keyword stuffing.
4. Follow the brand guidelines for tone and voice.
5. SEO best practices:
   - Front-load the primary keyword (first keyword in the list) near the beginning
   - Include a clear value proposition
   - Use natural language
   - Do NOT copy any individual product description — synthesize the overall collection theme

## Output Format:
Respond with ONLY valid JSON in this exact format (no markdown, no code fences):
{"collectionDescription": "your 600-800 character description here"}`;

		const response = await this.client.messages.create({
			model: "claude-sonnet-4-20250514",
			max_tokens: 1024,
			messages: [{ role: "user", content: prompt }],
		});

		const text =
			response.content[0].type === "text" ? response.content[0].text : "";
		return this.parseJSON<GeneratedContent>(text);
	}

	async humanizeContent(
		draft: GeneratedContent,
		keywords: string[],
		brandGuidelines: string,
	): Promise<HumanizedContent> {
		const prompt = `You are a senior ecommerce copywriter who has written for top DTC brands for 10+ years. Your writing is natural, confident, and impossible to distinguish from a skilled human writer.

## Draft to Humanize:
Collection Description: ${draft.collectionDescription}

## Target Keywords (must be preserved):
${keywords.join(", ")}

## Brand Guidelines (must be followed):
${brandGuidelines}

## Humanization Instructions:
Rewrite the content to sound like an experienced ecommerce copywriter wrote it, NOT an AI. Specifically:

1. REMOVE these AI-typical patterns — never use these words/phrases:
   "elevate", "seamless", "curated", "unlock", "designed to", "whether you're", "look no further", "takes it to the next level", "game-changer", "transform", "discover", "journey", "explore our", "dive into", "crafted", "redefine", "empower", "streamline"

2. VARY sentence length — mix short punchy sentences with longer ones. Avoid predictable rhythm.

3. USE conversational, confident language — write like a brand expert, not a marketing bot.

4. ADD subtle personality and specificity.

5. PRESERVE all target keywords in natural positions.

6. KEEP the brand guidelines tone intact.

7. STAY strictly within 600-800 characters (including spaces). COUNT CAREFULLY.

8. Track every change you made — list them briefly.

## Output Format:
Respond with ONLY valid JSON in this exact format (no markdown, no code fences):
{"collectionDescription": "your humanized 600-800 char description", "changes": ["change 1", "change 2", "change 3"]}`;

		const response = await this.client.messages.create({
			model: "claude-sonnet-4-20250514",
			max_tokens: 1024,
			messages: [{ role: "user", content: prompt }],
		});

		const text =
			response.content[0].type === "text" ? response.content[0].text : "";
		return this.parseJSON<HumanizedContent>(text);
	}

	async refineContent(
		currentContent: string,
		feedback: string,
		keywords: string[],
		brandGuidelines: string,
		productDescriptions: string[],
	): Promise<GeneratedContent> {
		const descriptionsContext = productDescriptions.length > 0
			? `\n\n## Product Descriptions for Reference:\n${productDescriptions.map((d, i) => `Product ${i + 1}: ${d.substring(0, 200)}...`).join("\n")}`
			: "";

		const prompt = `You are a senior ecommerce copywriter. You previously wrote a collection page description, and the user has feedback. Revise the content based on their instructions.

## Current Content:
${currentContent}

## User Feedback:
${feedback}

## Target Keywords (must still be included):
${keywords.join(", ")}

## Brand Guidelines:
${brandGuidelines}${descriptionsContext}

## Instructions:
1. Apply the user's feedback to the current content.
2. Keep the target keywords naturally included.
3. Follow the brand guidelines.
4. Unless the user explicitly asks for a different length, stay within 600-800 characters (including spaces).
5. If the user says "make it shorter", aim for 400-600 characters.
6. If the user says "make it longer", aim for 800-1000 characters.
7. Write naturally — no AI-sounding phrases.

## Output Format:
Respond with ONLY valid JSON in this exact format (no markdown, no code fences):
{"collectionDescription": "your revised description here"}`;

		const response = await this.client.messages.create({
			model: "claude-sonnet-4-20250514",
			max_tokens: 1024,
			messages: [{ role: "user", content: prompt }],
		});

		const text =
			response.content[0].type === "text" ? response.content[0].text : "";
		return this.parseJSON<GeneratedContent>(text);
	}

	private parseJSON<T>(text: string): T {
		const cleaned = text
			.replace(/```json\s*/g, "")
			.replace(/```\s*/g, "")
			.trim();
		return JSON.parse(cleaned) as T;
	}
}

export const createAIClient = (): IAIClient => new AnthropicAIClient();
