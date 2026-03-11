import { useState } from "react";
import { Copy, Check, RefreshCw, Loader2, Send } from "lucide-react";
import { cn } from "@/common/utils/tailwind";
import type { GeneratedContent, HumanizedContent } from "../types";

interface ContentOutputProps {
	draft: GeneratedContent;
	humanized: HumanizedContent;
	onRegenerate: () => void;
	onRefine: (feedback: string) => Promise<void>;
	isRegenerating: boolean;
	isRefining: boolean;
}

type ViewMode = "humanized" | "draft" | "compare";

export function ContentOutput({
	draft,
	humanized,
	onRegenerate,
	onRefine,
	isRegenerating,
	isRefining,
}: ContentOutputProps) {
	const [viewMode, setViewMode] = useState<ViewMode>("humanized");
	const [feedback, setFeedback] = useState("");

	const handleRefine = async () => {
		if (!feedback.trim()) return;
		await onRefine(feedback.trim());
		setFeedback("");
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleRefine();
		}
	};

	return (
		<div className="space-y-5">
			{/* View toggle + Regenerate */}
			<div className="flex items-center justify-between">
				<div className="flex bg-gray-100 rounded-lg p-0.5">
					{(["humanized", "draft", "compare"] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							onClick={() => setViewMode(mode)}
							className={cn(
								"px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
								viewMode === mode
									? "bg-white text-gray-900 shadow-sm"
									: "text-gray-500 hover:text-gray-700",
							)}
						>
							{mode === "compare" ? "Compare" : mode === "humanized" ? "Humanized" : "AI Draft"}
						</button>
					))}
				</div>

				<button
					type="button"
					onClick={onRegenerate}
					disabled={isRegenerating}
					className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors disabled:opacity-50"
				>
					{isRegenerating ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : (
						<RefreshCw className="w-3.5 h-3.5" />
					)}
					Re-humanize
				</button>
			</div>

			{/* Content display */}
			{viewMode === "compare" ? (
				<CompareView draft={draft} humanized={humanized} />
			) : (
				<ContentField
					value={viewMode === "humanized" ? humanized.collectionDescription : draft.collectionDescription}
					charRange="600-800"
				/>
			)}

			{/* Changes list */}
			{humanized.changes.length > 0 && (
				<div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
					<p className="text-xs font-medium text-amber-800 mb-2">Changes made during humanization:</p>
					<ul className="space-y-1">
						{humanized.changes.map((change) => (
							<li key={change} className="text-xs text-amber-700 flex gap-2">
								<span className="text-amber-400 flex-shrink-0">-</span>
								{change}
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Feedback / Refinement section */}
			<div className="border-t border-gray-200 pt-4">
				<p className="text-xs font-medium text-gray-600 mb-2">Refine the content</p>
				<div className="flex gap-2">
					<textarea
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="e.g. Make it shorter, don't mention leather, add more about sustainability..."
						rows={2}
						className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none resize-none"
					/>
					<button
						type="button"
						onClick={handleRefine}
						disabled={isRefining || !feedback.trim()}
						className="self-end flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isRefining ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Send className="w-3.5 h-3.5" />
						)}
						Refine
					</button>
				</div>
				<div className="flex flex-wrap gap-1.5 mt-2">
					{["Make it shorter", "Make it longer", "More conversational", "More professional"].map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => setFeedback(suggestion)}
							className="px-2 py-1 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
						>
							{suggestion}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

function CompareView({ draft, humanized }: { draft: GeneratedContent; humanized: HumanizedContent }) {
	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<div>
				<p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">AI Draft</p>
				<ContentField value={draft.collectionDescription} charRange="600-800" />
			</div>
			<div>
				<p className="text-xs font-medium text-green-600 mb-2 uppercase tracking-wider">Humanized</p>
				<ContentField value={humanized.collectionDescription} charRange="600-800" />
			</div>
		</div>
	);
}

function ContentField({ value, charRange }: { value: string; charRange: string }) {
	const [copied, setCopied] = useState(false);
	const charCount = value.length;

	const isOverLimit = charRange === "600-800" && (charCount < 600 || charCount > 800);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
			<div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
				<span className="text-xs font-medium text-gray-600">Collection Description</span>
				<div className="flex items-center gap-3">
					<span
						className={cn(
							"text-xs font-mono",
							isOverLimit ? "text-red-500" : "text-gray-400",
						)}
					>
						{charCount} chars ({charRange})
					</span>
					<button
						type="button"
						onClick={handleCopy}
						className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
					>
						{copied ? (
							<>
								<Check className="w-3.5 h-3.5 text-green-500" />
								<span className="text-green-600">Copied</span>
							</>
						) : (
							<>
								<Copy className="w-3.5 h-3.5" />
								Copy
							</>
						)}
					</button>
				</div>
			</div>
			<div className="p-3">
				<p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{value}</p>
			</div>
		</div>
	);
}
