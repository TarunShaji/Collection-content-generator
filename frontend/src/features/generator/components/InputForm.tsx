import { useState } from "react";
import { Globe, Tag, FileText, Loader2, Hash, BookOpen } from "lucide-react";
import { cn } from "@/common/utils/tailwind";

export interface InputFormData {
	collectionUrl: string;
	keywords: string;
	brandGuidelines: string;
	sectionCount: number;
	preApprovedContent?: string;
}

interface InputFormProps {
	onSubmit: (data: InputFormData) => void;
	isLoading: boolean;
}

export function InputForm({ onSubmit, isLoading }: InputFormProps) {
	const [collectionUrl, setCollectionUrl] = useState("");
	const [keywords, setKeywords] = useState("");
	const [brandGuidelines, setBrandGuidelines] = useState("");
	const [sectionCount, setSectionCount] = useState(2);
	const [preApprovedContent, setPreApprovedContent] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSubmit({
			collectionUrl,
			keywords,
			brandGuidelines,
			sectionCount,
			preApprovedContent: preApprovedContent.trim() || undefined,
		});
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-5">
			<div>
				<label htmlFor="url" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
					<Globe className="w-4 h-4 text-gray-400" />
					Collection Page URL
				</label>
				<input
					id="url"
					type="url"
					required
					placeholder="https://example.com/collections/summer-sale"
					value={collectionUrl}
					onChange={(e) => setCollectionUrl(e.target.value)}
					className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow placeholder:text-gray-400"
				/>
			</div>

			<div>
				<label htmlFor="keywords" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
					<Tag className="w-4 h-4 text-gray-400" />
					Target Keywords
				</label>
				<input
					id="keywords"
					type="text"
					required
					placeholder="summer dresses, casual dresses, floral dresses"
					value={keywords}
					onChange={(e) => setKeywords(e.target.value)}
					className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow placeholder:text-gray-400"
				/>
				<p className="mt-1 text-xs text-gray-500">Comma-separated. First keyword is treated as the primary keyword.</p>
			</div>

			<div>
				<label htmlFor="guidelines" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
					<FileText className="w-4 h-4 text-gray-400" />
					Brand Guidelines
				</label>
				<textarea
					id="guidelines"
					required
					rows={4}
					placeholder="Tone: Friendly and approachable. Voice: We speak like a knowledgeable friend, not a salesperson. Avoid jargon. Use short sentences. Always highlight quality and craftsmanship."
					value={brandGuidelines}
					onChange={(e) => setBrandGuidelines(e.target.value)}
					className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow resize-y placeholder:text-gray-400"
				/>
			</div>

			<div>
				<label htmlFor="sectionCount" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
					<Hash className="w-4 h-4 text-gray-400" />
					Number of H2 Sections
				</label>
				<input
					id="sectionCount"
					type="number"
					min={1}
					max={10}
					value={sectionCount}
					onChange={(e) => {
						const v = Math.min(10, Math.max(1, Number(e.target.value) || 1));
						setSectionCount(v);
					}}
					className="w-24 px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-center font-medium focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow"
				/>
				<p className="mt-1 text-xs text-gray-500">How many H2 subheadings to generate (1–10). Default is 2.</p>
			</div>

			<div>
				<label htmlFor="preApproved" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
					<BookOpen className="w-4 h-4 text-gray-400" />
					Pre-Approved Content
					<span className="text-xs font-normal text-gray-400">(optional)</span>
				</label>
				<textarea
					id="preApproved"
					rows={3}
					placeholder="Paste any pre-approved copy, taglines, or messaging that must be incorporated verbatim..."
					value={preApprovedContent}
					onChange={(e) => setPreApprovedContent(e.target.value)}
					className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-shadow resize-y placeholder:text-gray-400"
				/>
				<p className="mt-1 text-xs text-gray-500">Brand-approved phrases or copy the AI must incorporate faithfully.</p>
			</div>

			<button
				type="submit"
				disabled={isLoading}
				className={cn(
					"w-full py-3 px-4 rounded-lg text-sm font-semibold text-white transition-all",
					isLoading
						? "bg-gray-400 cursor-not-allowed"
						: "bg-brand-600 hover:bg-brand-700 active:scale-[0.98] shadow-sm hover:shadow",
				)}
			>
				{isLoading ? (
					<span className="flex items-center justify-center gap-2">
						<Loader2 className="w-4 h-4 animate-spin" />
						Generating...
					</span>
				) : (
					"Generate Collection Content"
				)}
			</button>
		</form>
	);
}
