import { useState } from "react";
import { Globe, Tag, FileText, Loader2 } from "lucide-react";
import { cn } from "@/common/utils/tailwind";

interface InputFormProps {
	onSubmit: (data: { collectionUrl: string; keywords: string; brandGuidelines: string }) => void;
	isLoading: boolean;
}

export function InputForm({ onSubmit, isLoading }: InputFormProps) {
	const [collectionUrl, setCollectionUrl] = useState("");
	const [keywords, setKeywords] = useState("");
	const [brandGuidelines, setBrandGuidelines] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSubmit({ collectionUrl, keywords, brandGuidelines });
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
				<p className="mt-1 text-xs text-gray-500">Comma-separated list. First keyword is treated as the primary keyword.</p>
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
