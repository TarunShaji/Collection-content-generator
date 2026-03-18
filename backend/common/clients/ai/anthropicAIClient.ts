import Anthropic from "@anthropic-ai/sdk";
import { settings } from "@/common/config/settings";
import type { GeneratedContent, HumanizedContent, IAIClient } from "./IAIClient";

class AnthropicAIClient implements IAIClient {
	private client: Anthropic;

	constructor() {
		this.client = new Anthropic({ apiKey: settings.anthropic.apiKey });
	}

	private log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, unknown>): void {
		const payload = context ? ` ${JSON.stringify(context)}` : "";
		const line = `[AnthropicAIClient] ${message}${payload}`;

		switch (level) {
			case "warn":
				console.warn(line);
				break;
			case "error":
				console.error(line);
				break;
			case "debug":
				console.debug(line);
				break;
			default:
				console.info(line);
		}
	}

	private contentTotalLength(content: GeneratedContent): number {
		return [
			content.h1,
			content.intro,
			content.section1.h2,
			content.section1.content,
			content.section2.h2,
			content.section2.content,
		]
			.map((v) => v.length)
			.reduce((a, b) => a + b, 0);
	}

	private parseJSON<T>(text: string): T {
		const cleaned = text
			.replace(/```json\s*/g, "")
			.replace(/```\s*/g, "")
			.trim();
		return JSON.parse(cleaned) as T;
	}

	private assertGeneratedContentShape(value: unknown): asserts value is GeneratedContent {
		if (!value || typeof value !== "object") throw new Error("AI response is not an object");
		const obj = value as Record<string, unknown>;

		const hasString = (key: string) => typeof obj[key] === "string" && (obj[key] as string).trim().length > 0;
		if (!hasString("h1")) throw new Error("AI response missing non-empty h1");
		if (!hasString("intro")) throw new Error("AI response missing non-empty intro");

		const section1 = obj.section1;
		if (!section1 || typeof section1 !== "object") throw new Error("AI response missing section1");
		const section1Obj = section1 as Record<string, unknown>;
		if (typeof section1Obj.h2 !== "string" || section1Obj.h2.trim().length === 0) {
			throw new Error("AI response missing non-empty section1.h2");
		}
		if (typeof section1Obj.content !== "string" || section1Obj.content.trim().length === 0) {
			throw new Error("AI response missing non-empty section1.content");
		}

		const section2 = obj.section2;
		if (!section2 || typeof section2 !== "object") throw new Error("AI response missing section2");
		const section2Obj = section2 as Record<string, unknown>;
		if (typeof section2Obj.h2 !== "string" || section2Obj.h2.trim().length === 0) {
			throw new Error("AI response missing non-empty section2.h2");
		}
		if (typeof section2Obj.content !== "string" || section2Obj.content.trim().length === 0) {
			throw new Error("AI response missing non-empty section2.content");
		}
	}

	private assertHumanizedContentShape(value: unknown): asserts value is HumanizedContent {
		this.assertGeneratedContentShape(value);
		const obj = value as Record<string, unknown>;
		if (!Array.isArray(obj.changes) || obj.changes.some((c) => typeof c !== "string")) {
			throw new Error("AI response missing valid changes array");
		}
	}

	async generateDraft(
		productDescriptions: string[],
		keywords: string[],
		brandGuidelines: string,
	): Promise<GeneratedContent> {
		const startTime = performance.now();
		const descriptionsText = productDescriptions
			.map((d, i) => `Product ${i + 1}:\n${d}`)
			.join("\n\n---\n\n");

		const prompt = `You are an expert ecommerce SEO strategist and copywriter.

Your task: generate structured SEO content for a collection page from product descriptions.

## Product Descriptions from this Collection:
${descriptionsText}

## Target Keywords:
${keywords.join(", ")}

## Brand Guidelines:
${brandGuidelines}

## Structure Requirements:
- h1: collection SEO title, 40-70 characters.
- intro: 1 strong opening paragraph, 220-360 characters.
- section1.h2: subheading focused on value/theme cluster 1.
- section1.content: 1 paragraph, 180-320 characters.
- section2.h2: subheading focused on value/theme cluster 2.
- section2.content: 1 paragraph, 180-320 characters.

## Quality Rules:
1. Synthesize across all products; do not copy one product verbatim.
2. Place primary keyword naturally in h1 or intro.
3. Use natural SEO language with clear value proposition.
4. Follow brand voice strictly.
5. Keep output concise and publication-ready.

## Output Format:
Respond with ONLY valid JSON (no markdown, no code fences) in this exact shape:
{"h1":"...","intro":"...","section1":{"h2":"...","content":"..."},"section2":{"h2":"...","content":"..."}}`;

		this.log("info", "Starting draft generation", {
			productCount: productDescriptions.length,
			promptLength: prompt.length,
			keywords: keywords.join(", "),
		});

		const response = await this.client.messages.create({
			model: "claude-haiku-4-5-20251001",
			max_tokens: 1200,
			messages: [{ role: "user", content: prompt }],
		});

		const duration = performance.now() - startTime;
		const text = response.content[0].type === "text" ? response.content[0].text : "";
		const parsed = this.parseJSON<unknown>(text);
		this.assertGeneratedContentShape(parsed);
		const result = parsed;

		this.log("info", "Draft generation completed", {
			durationMs: Math.round(duration),
			totalLength: this.contentTotalLength(result),
			h1Length: result.h1.length,
			introLength: result.intro.length,
		});

		return result;
	}

	async humanizeContent(
		draft: GeneratedContent,
		keywords: string[],
		brandGuidelines: string,
	): Promise<HumanizedContent> {
		const startTime = performance.now();
		const prompt = `You are a senior ecommerce copywriter. Rewrite the structured SEO content below to sound fully human, natural, and brand-authentic while preserving structure.

## Draft to Humanize (JSON):
${JSON.stringify(draft, null, 2)}

## Target Keywords (must remain naturally present across the output):
${keywords.join(", ")}

## Brand Guidelines:
${brandGuidelines}

## Humanization Rules:
1. Keep exact JSON structure and keys: h1, intro, section1{h2,content}, section2{h2,content}.
2. Improve flow, cadence, specificity, and readability.
3. Remove robotic phrasing and generic AI tone.
4. Preserve SEO intent and keyword alignment.
5. Keep each field concise and similar in length to the draft.
6. Track key edits in a short changes array (3-8 items).

## Output Format:
Respond with ONLY valid JSON (no markdown, no code fences):
{"h1":"...","intro":"...","section1":{"h2":"...","content":"..."},"section2":{"h2":"...","content":"..."},"changes":["..."]}`;

		this.log("info", "Starting humanization", {
			draftTotalLength: this.contentTotalLength(draft),
			promptLength: prompt.length,
		});

		const response = await this.client.messages.create({
			model: "claude-sonnet-4-20250514",
			max_tokens: 1200,
			messages: [{ role: "user", content: prompt }],
		});

		const duration = performance.now() - startTime;
		const text = response.content[0].type === "text" ? response.content[0].text : "";
		const parsed = this.parseJSON<unknown>(text);
		this.assertHumanizedContentShape(parsed);
		const result = parsed;

		this.log("info", "Humanization completed", {
			durationMs: Math.round(duration),
			totalLength: this.contentTotalLength(result),
			changesCount: result.changes.length,
		});

		return result;
	}

	async refineContent(
		currentContent: GeneratedContent,
		feedback: string,
		keywords: string[],
		brandGuidelines: string,
		productDescriptions: string[],
	): Promise<GeneratedContent> {
		const startTime = performance.now();
		const descriptionsContext = productDescriptions.length > 0
			? `\n\n## Product Descriptions for Reference:\n${productDescriptions.map((d, i) => `Product ${i + 1}: ${d.substring(0, 240)}...`).join("\n")}`
			: "";

		const prompt = `You are a senior ecommerce copywriter updating structured collection-page SEO content.

## Current Structured Content (JSON):
${JSON.stringify(currentContent, null, 2)}

## User Feedback:
${feedback}

## Target Keywords:
${keywords.join(", ")}

## Brand Guidelines:
${brandGuidelines}${descriptionsContext}

## Instructions:
1. Apply the feedback directly.
2. Keep exact JSON structure and keys unchanged.
3. Preserve SEO quality and keyword naturalness.
4. Keep tone aligned with brand guidelines.
5. Keep each field concise and coherent with the whole page.

## Output Format:
Respond with ONLY valid JSON (no markdown, no code fences):
{"h1":"...","intro":"...","section1":{"h2":"...","content":"..."},"section2":{"h2":"...","content":"..."}}`;

		this.log("info", "Starting content refinement", {
			feedback,
			currentTotalLength: this.contentTotalLength(currentContent),
			promptLength: prompt.length,
		});

		const response = await this.client.messages.create({
			model: "claude-sonnet-4-20250514",
			max_tokens: 1200,
			messages: [{ role: "user", content: prompt }],
		});

		const duration = performance.now() - startTime;
		const text = response.content[0].type === "text" ? response.content[0].text : "";
		const parsed = this.parseJSON<unknown>(text);
		this.assertGeneratedContentShape(parsed);
		const result = parsed;

		this.log("info", "Refinement completed", {
			durationMs: Math.round(duration),
			totalLength: this.contentTotalLength(result),
		});

		return result;
	}
}

export const createAIClient = (): IAIClient => new AnthropicAIClient();
