import Anthropic from "@anthropic-ai/sdk";
import { settings } from "@/common/config/settings";
import type { CollectionSEOSection, GeneratedContent, HumanizedContent, IAIClient } from "./IAIClient";

class AnthropicAIClient implements IAIClient {
	private client: Anthropic;

	constructor() {
		this.client = new Anthropic({ apiKey: settings.anthropic.apiKey });
	}

	private log(level: "info" | "warn" | "error" | "debug", message: string, context?: Record<string, unknown>): void {
		const payload = context ? ` ${JSON.stringify(context)}` : "";
		const line = `[AnthropicAIClient] ${message}${payload}`;
		switch (level) {
			case "warn":  console.warn(line);  break;
			case "error": console.error(line); break;
			case "debug": console.debug(line); break;
			default:      console.info(line);
		}
	}

	private contentTotalLength(content: GeneratedContent): number {
		const base = content.h1.length + content.intro.length;
		const sections = content.sections.reduce((sum, s) => sum + s.h2.length + s.content.length, 0);
		return base + sections;
	}

	private parseJSON<T>(text: string): T {
		const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
		return JSON.parse(cleaned) as T;
	}

	// ── Shape validation ───────────────────────────────────────────────────────

	private assertGeneratedContentShape(value: unknown): asserts value is GeneratedContent {
		if (!value || typeof value !== "object") throw new Error("AI response is not an object");
		const obj = value as Record<string, unknown>;

		if (typeof obj.h1 !== "string" || !obj.h1.trim()) throw new Error("AI response missing non-empty h1");
		if (typeof obj.intro !== "string" || !obj.intro.trim()) throw new Error("AI response missing non-empty intro");

		if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
			throw new Error("AI response missing non-empty sections array");
		}

		obj.sections.forEach((s: unknown, i: number) => {
			if (!s || typeof s !== "object") throw new Error(`sections[${i}] is not an object`);
			const sec = s as Record<string, unknown>;
			if (typeof sec.h2 !== "string" || !sec.h2.trim()) throw new Error(`sections[${i}].h2 is missing or empty`);
			if (typeof sec.content !== "string" || !sec.content.trim()) throw new Error(`sections[${i}].content is missing or empty`);
		});
	}

	private assertHumanizedContentShape(value: unknown): asserts value is HumanizedContent {
		this.assertGeneratedContentShape(value);
		const obj = value as unknown as Record<string, unknown>;
		if (!Array.isArray(obj.changes) || obj.changes.some((c) => typeof c !== "string")) {
			throw new Error("AI response missing valid changes array");
		}
	}

	// ── Prompt helpers ─────────────────────────────────────────────────────────

	/**
	 * Build the structure requirements block and example JSON output dynamically
	 * based on how many sections are requested.
	 */
	private buildStructureBlock(sectionCount: number): { requirements: string; exampleJson: string } {
		const sectionLines = Array.from(
			{ length: sectionCount },
			(_, i) =>
				`  Section ${i + 1}:\n    h2: subheading focused on a distinct value or theme, 30-60 characters.\n    content: 1 supporting paragraph, 180-320 characters.`,
		).join("\n");

		const requirements = `- h1: collection SEO title, 40-70 characters.
- intro: 1 strong opening paragraph, 220-360 characters.
- sections: array of EXACTLY ${sectionCount} object(s). You MUST write all ${sectionCount}. Do not stop early.
${sectionLines}`;

		// Label each slot explicitly so the model can count them
		const exampleSections = Array.from(
			{ length: sectionCount },
			(_, i) => ({ h2: `<section ${i + 1} heading>`, content: `<section ${i + 1} content>` }),
		);
		const exampleJson = JSON.stringify({ h1: "<h1>", intro: "<intro>", sections: exampleSections });

		return { requirements, exampleJson };
	}

	/** If pre-approved content was provided, return a prompt block for it. */
	private buildPreApprovedBlock(preApprovedContent?: string): string {
		if (!preApprovedContent?.trim()) return "";
		return `\n## Pre-Approved Content (incorporate faithfully — preserve key phrases and messaging verbatim where possible):\n${preApprovedContent.trim()}\n`;
	}

	// ── Public methods ─────────────────────────────────────────────────────────

	async generateDraft(
		productDescriptions: string[],
		keywords: string[],
		brandGuidelines: string,
		sectionCount: number,
		preApprovedContent?: string,
	): Promise<GeneratedContent> {
		const startTime = performance.now();
		const descriptionsText = productDescriptions.map((d, i) => `Product ${i + 1}:\n${d}`).join("\n\n---\n\n");
		const { requirements, exampleJson } = this.buildStructureBlock(sectionCount);
		const preApprovedBlock = this.buildPreApprovedBlock(preApprovedContent);

		const prompt = `You are an expert ecommerce SEO strategist and copywriter.

Your task: generate structured SEO content for a collection page from product descriptions.

## Product Descriptions from this Collection:
${descriptionsText}

## Target Keywords:
${keywords.join(", ")}

## Brand Guidelines:
${brandGuidelines}
${preApprovedBlock}
## Structure Requirements:
${requirements}

## Quality Rules:
1. Synthesize across all products; do not copy one product verbatim.
2. Place primary keyword naturally in h1 or intro.
3. Use natural SEO language with clear value proposition.
4. Each section h2 must cover a distinct theme — no overlap.
5. Follow brand voice strictly.
6. Keep output concise and publication-ready.

## Output Format:
Respond with ONLY valid JSON (no markdown, no code fences) in this exact shape:
${exampleJson}`;

		const maxTokens = Math.min(800 + sectionCount * 350, 4000);

		this.log("info", "Starting draft generation", {
			productCount: productDescriptions.length,
			sectionCount,
			hasPreApprovedContent: Boolean(preApprovedContent?.trim()),
			maxTokens,
		});
		console.log("[AnthropicAIClient] generateDraft sectionCount =", sectionCount, "| exampleJson =", exampleJson);

		const callModel = async (userPrompt: string) => {
			const resp = await this.client.messages.create({
				model: "claude-haiku-4-5-20251001",
				max_tokens: maxTokens,
				messages: [{ role: "user", content: userPrompt }],
			});
			const raw = resp.content[0].type === "text" ? resp.content[0].text : "";
			console.log("[AnthropicAIClient] generateDraft raw response:", raw.substring(0, 600));
			const p = this.parseJSON<unknown>(raw);
			this.assertGeneratedContentShape(p);
			return p;
		};

		let parsed = await callModel(prompt);

		// Retry once if the model returned the wrong number of sections
		if (parsed.sections.length !== sectionCount) {
			this.log("warn", `Draft returned ${parsed.sections.length} section(s), expected ${sectionCount}. Retrying…`);
			const retryPrompt = `${prompt}\n\nCRITICAL REMINDER: You MUST output EXACTLY ${sectionCount} section object(s) in the sections array. No more, no less. Count carefully before responding.`;
			parsed = await callModel(retryPrompt);
		}

		if (parsed.sections.length !== sectionCount) {
			throw new Error(
				`AI returned ${parsed.sections.length} section(s) but ${sectionCount} were requested. ` +
				"Try again or reduce the section count.",
			);
		}

		const duration = performance.now() - startTime;
		this.log("info", "Draft generation completed", {
			durationMs: Math.round(duration),
			totalLength: this.contentTotalLength(parsed),
			sectionsGenerated: parsed.sections.length,
		});

		return parsed;
	}

	async humanizeContent(
		draft: GeneratedContent,
		keywords: string[],
		brandGuidelines: string,
		sectionCount: number,
		preApprovedContent?: string,
	): Promise<HumanizedContent> {
		const startTime = performance.now();
		const { exampleJson } = this.buildStructureBlock(sectionCount);
		const preApprovedBlock = this.buildPreApprovedBlock(preApprovedContent);

		const humanizedExampleJson = exampleJson.replace(/^(\{)/, '$1"changes":["..."],');

		const prompt = `You are a senior ecommerce copywriter. Rewrite the structured SEO content below to sound fully human, natural, and brand-authentic while preserving structure.

## Draft to Humanize (JSON):
${JSON.stringify(draft, null, 2)}

## Target Keywords (must remain naturally present across the output):
${keywords.join(", ")}

## Brand Guidelines:
${brandGuidelines}
${preApprovedBlock}
## Humanization Rules:
1. Keep the exact JSON structure: h1, intro, sections array with EXACTLY ${sectionCount} objects (h2 + content each). Do not add or remove sections.
2. Improve flow, cadence, specificity, and readability.
3. Remove robotic phrasing and generic AI tone.
4. Preserve SEO intent and keyword alignment.
5. Keep each field concise and similar in length to the draft.
6. Track key edits in a short changes array (3-8 items).

## Output Format:
Respond with ONLY valid JSON (no markdown, no code fences):
${humanizedExampleJson}`;

		const maxTokens = Math.min(900 + sectionCount * 400, 4000);

		this.log("info", "Starting humanization", {
			draftTotalLength: this.contentTotalLength(draft),
			sectionCount,
			hasPreApprovedContent: Boolean(preApprovedContent?.trim()),
			maxTokens,
		});
		console.log("[AnthropicAIClient] humanizeContent sectionCount =", sectionCount, "| draft.sections.length =", draft.sections.length);

		const callModel = async (userPrompt: string) => {
			const resp = await this.client.messages.create({
				model: "claude-sonnet-4-6",
				max_tokens: maxTokens,
				messages: [{ role: "user", content: userPrompt }],
			});
			const raw = resp.content[0].type === "text" ? resp.content[0].text : "";
			console.log("[AnthropicAIClient] humanizeContent raw response:", raw.substring(0, 600));
			const p = this.parseJSON<unknown>(raw);
			this.assertHumanizedContentShape(p);
			return p;
		};

		let parsed = await callModel(prompt);

		// Retry once if section count is wrong
		if (parsed.sections.length !== sectionCount) {
			this.log("warn", `Humanizer returned ${parsed.sections.length} section(s), expected ${sectionCount}. Retrying…`);
			const retryPrompt = `${prompt}\n\nCRITICAL REMINDER: The output sections array MUST have EXACTLY ${sectionCount} objects. Count them before responding.`;
			parsed = await callModel(retryPrompt);
		}

		if (parsed.sections.length !== sectionCount) {
			throw new Error(
				`Humanizer returned ${parsed.sections.length} section(s) but ${sectionCount} were expected.`,
			);
		}

		const duration = performance.now() - startTime;
		this.log("info", "Humanization completed", {
			durationMs: Math.round(duration),
			totalLength: this.contentTotalLength(parsed),
			changesCount: parsed.changes.length,
		});

		return parsed;
	}

	async refineContent(
		currentContent: GeneratedContent,
		feedback: string,
		keywords: string[],
		brandGuidelines: string,
		productDescriptions: string[],
	): Promise<GeneratedContent> {
		const startTime = performance.now();
		const sectionCount = currentContent.sections.length;
		const { exampleJson } = this.buildStructureBlock(sectionCount);

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
2. Keep the exact JSON structure: h1, intro, sections array with ${sectionCount} objects (h2, content each).
3. Preserve SEO quality and keyword naturalness.
4. Keep tone aligned with brand guidelines.
5. Keep each field concise and coherent with the whole page.

## Output Format:
Respond with ONLY valid JSON (no markdown, no code fences):
${exampleJson}`;

		const maxTokens = Math.min(800 + sectionCount * 350, 4000);

		this.log("info", "Starting content refinement", {
			feedback,
			sectionCount,
			currentTotalLength: this.contentTotalLength(currentContent),
			maxTokens,
		});

		const response = await this.client.messages.create({
			model: "claude-sonnet-4-6",
			max_tokens: maxTokens,
			messages: [{ role: "user", content: prompt }],
		});

		const duration = performance.now() - startTime;
		const text = response.content[0].type === "text" ? response.content[0].text : "";
		const parsed = this.parseJSON<unknown>(text);
		this.assertGeneratedContentShape(parsed);

		this.log("info", "Refinement completed", {
			durationMs: Math.round(duration),
			totalLength: this.contentTotalLength(parsed),
			sectionsGenerated: parsed.sections.length,
		});

		return parsed;
	}
}

export const createAIClient = (): IAIClient => new AnthropicAIClient();
