import { useState, useCallback, useRef } from "react";
import { Sparkles } from "lucide-react";
import { API_BASE_URL } from "@/common/api/constants";
import { InputForm } from "../components/InputForm";
import type { InputFormData } from "../components/InputForm";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { ContentOutput } from "../components/ContentOutput";
import { CrawledProducts } from "../components/CrawledProducts";
import type {
	GeneratedContent,
	HumanizedContent,
	CrawlResult,
	GeneratorStage,
	CollectionSEOSection,
} from "../types";

// Normalizes content from the server — handles both the new sections[] format
// and the legacy section1/section2 format during server transitions.
function normalizeGenerated(raw: unknown): GeneratedContent {
	const obj = raw as Record<string, unknown>;
	if (Array.isArray(obj.sections)) return raw as GeneratedContent;
	// Migrate old format
	const sections: CollectionSEOSection[] = [];
	if (obj.section1) sections.push(obj.section1 as CollectionSEOSection);
	if (obj.section2) sections.push(obj.section2 as CollectionSEOSection);
	return { h1: obj.h1 as string, intro: obj.intro as string, sections };
}

function normalizeHumanized(raw: unknown): HumanizedContent {
	const base = normalizeGenerated(raw);
	const obj = raw as Record<string, unknown>;
	return { ...base, changes: Array.isArray(obj.changes) ? (obj.changes as string[]) : [] };
}

interface FormMeta {
	keywords: string;
	brandGuidelines: string;
	sectionCount: number;
	preApprovedContent?: string;
}

export function GeneratorPage() {
	const [stage, setStage] = useState<GeneratorStage>("idle");
	const [statusMessage, setStatusMessage] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isRegenerating, setIsRegenerating] = useState(false);
	const [isRefining, setIsRefining] = useState(false);

	const [draft, setDraft] = useState<GeneratedContent | null>(null);
	const [humanized, setHumanized] = useState<HumanizedContent | null>(null);
	const [crawledProducts, setCrawledProducts] = useState<CrawlResult[]>([]);
	const [failedUrls, setFailedUrls] = useState<string[]>([]);
	const [errorMessage, setErrorMessage] = useState("");

	const formMetaRef = useRef<FormMeta>({
		keywords: "",
		brandGuidelines: "",
		sectionCount: 2,
		preApprovedContent: undefined,
	});

	const handleSubmit = useCallback(async (data: InputFormData) => {
		setIsLoading(true);
		setStage("crawling_collection");
		setStatusMessage("Starting...");
		setDraft(null);
		setHumanized(null);
		setCrawledProducts([]);
		setFailedUrls([]);
		setErrorMessage("");
		formMetaRef.current = {
			keywords: data.keywords,
			brandGuidelines: data.brandGuidelines,
			sectionCount: data.sectionCount,
			preApprovedContent: data.preApprovedContent,
		};

		try {
			const response = await fetch(`${API_BASE_URL}/collection/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({ data: { message: "Request failed" } }));
				throw new Error(err.data?.message || "Request failed");
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error("No response stream");

			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				const events = buffer.split("\n\n");
				buffer = events.pop() || "";

				for (const eventBlock of events) {
					const lines = eventBlock.split("\n");
					let eventType = "";
					let eventData = "";

					for (const l of lines) {
						if (l.startsWith("event: ")) eventType = l.slice(7).trim();
						if (l.startsWith("data: ")) eventData = l.slice(6);
					}

					if (!eventType || !eventData) continue;

					let parsed: Record<string, unknown>;
					try {
						parsed = JSON.parse(eventData);
					} catch {
						continue;
					}

					switch (eventType) {
						case "progress": {
							const s = parsed.stage as GeneratorStage;
							const message = parsed.message as string;
							setStage(s);
							setStatusMessage(message);
							if (parsed.crawledProducts) {
								setCrawledProducts(parsed.crawledProducts as CrawlResult[]);
							}
							if (parsed.failedUrls) {
								setFailedUrls(parsed.failedUrls as string[]);
							}
							break;
						}
						case "draft":
							setDraft(normalizeGenerated(parsed.draft));
							break;
						case "humanized":
							setHumanized(normalizeHumanized(parsed.humanized));
							break;
						case "complete":
							setStage("complete");
							setStatusMessage("Content generated successfully!");
							if (parsed.draft) setDraft(normalizeGenerated(parsed.draft));
							if (parsed.humanized) setHumanized(normalizeHumanized(parsed.humanized));
							if (parsed.crawledProducts) setCrawledProducts(parsed.crawledProducts as CrawlResult[]);
							if (parsed.failedUrls) setFailedUrls(parsed.failedUrls as string[]);
							break;
						case "error":
							setStage("error");
							setStatusMessage(parsed.message as string);
							setErrorMessage(parsed.message as string);
							break;
					}
				}
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : "An unexpected error occurred";
			setStage("error");
			setStatusMessage(msg);
			setErrorMessage(msg);
		} finally {
			setIsLoading(false);
		}
	}, []);

	const handleRegenerate = useCallback(async () => {
		if (!draft) return;
		setIsRegenerating(true);
		try {
			const response = await fetch(`${API_BASE_URL}/collection/regenerate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					draft,
					keywords: formMetaRef.current.keywords,
					brandGuidelines: formMetaRef.current.brandGuidelines,
					sectionCount: formMetaRef.current.sectionCount,
					preApprovedContent: formMetaRef.current.preApprovedContent,
				}),
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({ data: { message: "Regeneration failed" } }));
				throw new Error(err.data?.message || "Regeneration failed");
			}

			const result = await response.json();
			setHumanized(normalizeHumanized(result.data.humanized));
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Regeneration failed";
			setErrorMessage(msg);
		} finally {
			setIsRegenerating(false);
		}
	}, [draft]);

	const handleRefine = useCallback(async (feedback: string) => {
		if (!humanized) return;
		setIsRefining(true);
		setErrorMessage("");

		const productDescriptions = crawledProducts
			.filter((p) => p.success && p.description)
			.map((p) => p.description);

		try {
			const response = await fetch(`${API_BASE_URL}/collection/refine`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					currentContent: {
						h1: humanized.h1,
						intro: humanized.intro,
						sections: humanized.sections,
					},
					feedback,
					keywords: formMetaRef.current.keywords,
					brandGuidelines: formMetaRef.current.brandGuidelines,
					productDescriptions,
				}),
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({ data: { message: "Refinement failed" } }));
				throw new Error(err.data?.message || "Refinement failed");
			}

			const result = await response.json();
			const refined = normalizeGenerated(result.data.refined);
			setHumanized({
				...refined,
				changes: [`Refined based on feedback: "${feedback}"`],
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Refinement failed";
			setErrorMessage(msg);
		} finally {
			setIsRefining(false);
		}
	}, [humanized, crawledProducts]);

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-3xl mx-auto px-4 py-10">
				{/* Header */}
				<div className="text-center mb-8">
					<div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-medium mb-3">
						<Sparkles className="w-3.5 h-3.5" />
						SEO Content Generator
					</div>
					<h1 className="text-2xl font-bold text-gray-900">Collection Page Content</h1>
					<p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
						Crawl product descriptions, generate SEO-optimized content, and humanize it — all in one step.
					</p>
				</div>

				{/* Input Form */}
				<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
					<InputForm onSubmit={handleSubmit} isLoading={isLoading} />
				</div>

				{/* Progress */}
				{stage !== "idle" && (
					<div className="mb-6">
						<ProgressIndicator stage={stage} message={statusMessage} />
					</div>
				)}

				{/* Error message */}
				{errorMessage && stage === "error" && (
					<div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
						<p className="text-sm text-red-700">{errorMessage}</p>
					</div>
				)}

				{/* Output */}
				{draft && humanized && (
					<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
						<ContentOutput
							draft={draft}
							humanized={humanized}
							onRegenerate={handleRegenerate}
							onRefine={handleRefine}
							isRegenerating={isRegenerating}
							isRefining={isRefining}
						/>
					</div>
				)}

				{/* Crawled products */}
				{crawledProducts.length > 0 && (
					<CrawledProducts products={crawledProducts} failedUrls={failedUrls} />
				)}
			</div>
		</div>
	);
}
