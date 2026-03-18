import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CrawlResult } from "../types";

interface CrawledProductsProps {
	products: CrawlResult[];
	failedUrls: string[];
}

export function CrawledProducts({ products, failedUrls }: CrawledProductsProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const successful = products.filter((p) => p.success);
	const failed = products.filter((p) => !p.success);
	const failedItems =
		failed.length > 0
			? failed
			: failedUrls.map((url) => ({
					url,
					description: "",
					success: false as const,
					error: "Failed to crawl",
				}));

	return (
		<div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
			>
				<div className="flex items-center gap-3">
					<span className="text-sm font-medium text-gray-700">
						Crawled Product Descriptions
					</span>
					<span className="text-xs text-gray-500">
						{successful.length} succeeded, {failed.length} failed
					</span>
				</div>
				{isExpanded ? (
					<ChevronUp className="w-4 h-4 text-gray-400" />
				) : (
					<ChevronDown className="w-4 h-4 text-gray-400" />
				)}
			</button>

			{isExpanded && (
				<div className="border-t border-gray-200 divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
					{failedItems.length > 0 && (
						<div className="px-5 py-3 bg-red-50">
							<p className="text-xs font-medium text-red-700 mb-1.5 flex items-center gap-1.5">
								<AlertTriangle className="w-3.5 h-3.5" />
								Failed to crawl ({failedItems.length}):
							</p>
							{failedItems.map((item) => (
								<div key={item.url} className="text-xs text-red-600 flex items-center gap-1 py-0.5">
									<span className="truncate">{item.url}</span>
									{item.error && <span className="text-red-400">— {item.error}</span>}
								</div>
							))}
						</div>
					)}

					{successful.map((item) => (
						<div key={item.url} className="px-5 py-3">
							<div className="flex items-center gap-2 mb-1.5">
								<CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
								<a
									href={item.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-xs text-brand-600 hover:text-brand-700 truncate flex items-center gap-1"
								>
									{item.url}
									<ExternalLink className="w-3 h-3 flex-shrink-0" />
								</a>
								{item.source && (
									<span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
										{item.source}
									</span>
								)}
							</div>
							<p className="text-xs text-gray-600 leading-relaxed ml-5.5 line-clamp-3">
								{item.description}
							</p>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
