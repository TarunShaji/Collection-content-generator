import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/common/utils/tailwind";
import type { GeneratorStage } from "../types";

interface ProgressIndicatorProps {
	stage: GeneratorStage;
	message: string;
}

const stageOrder: GeneratorStage[] = [
	"crawling_collection",
	"crawling_products",
	"generating_draft",
	"humanizing",
	"complete",
];

const stageLabels: Record<string, string> = {
	crawling_collection: "Crawl collection",
	crawling_products: "Crawl products",
	generating_draft: "Generate draft",
	humanizing: "Humanize",
	complete: "Done",
};

export function ProgressIndicator({ stage, message }: ProgressIndicatorProps) {
	if (stage === "idle") return null;

	const currentIdx = stageOrder.indexOf(stage === "crawling_complete" ? "crawling_products" : stage);

	return (
		<div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
			{/* Step indicators */}
			<div className="flex items-center gap-1 mb-4">
				{stageOrder.map((s, idx) => {
					const isComplete = idx < currentIdx || stage === "complete";
					const isCurrent = idx === currentIdx && stage !== "complete";
					const isError = stage === "error" && idx === currentIdx;

					return (
						<div key={s} className="flex items-center flex-1">
							<div className="flex items-center gap-2 min-w-0">
								<div
									className={cn(
										"w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
										isComplete && "bg-green-100",
										isCurrent && "bg-brand-100",
										isError && "bg-red-100",
										!isComplete && !isCurrent && !isError && "bg-gray-100",
									)}
								>
									{isComplete ? (
										<CheckCircle2 className="w-4 h-4 text-green-600" />
									) : isCurrent ? (
										<Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
									) : isError ? (
										<AlertCircle className="w-4 h-4 text-red-600" />
									) : (
										<span className="w-2 h-2 rounded-full bg-gray-300" />
									)}
								</div>
								<span
									className={cn(
										"text-xs font-medium truncate hidden sm:inline",
										isComplete && "text-green-700",
										isCurrent && "text-brand-700",
										isError && "text-red-700",
										!isComplete && !isCurrent && !isError && "text-gray-400",
									)}
								>
									{stageLabels[s]}
								</span>
							</div>
							{idx < stageOrder.length - 1 && (
								<div
									className={cn(
										"h-0.5 flex-1 mx-2 rounded transition-colors",
										idx < currentIdx ? "bg-green-300" : "bg-gray-200",
									)}
								/>
							)}
						</div>
					);
				})}
			</div>

			{/* Current message */}
			<div
				className={cn(
					"text-sm px-3 py-2 rounded-lg",
					stage === "error"
						? "bg-red-50 text-red-700"
						: stage === "complete"
							? "bg-green-50 text-green-700"
							: "bg-gray-50 text-gray-600",
				)}
			>
				{message}
			</div>
		</div>
	);
}
