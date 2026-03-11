import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import type { ZodSchema } from "zod";
import { generateCollectionContent, regenerateHumanized, refineContent } from "@/controllers/collection/controller";
import { successResponse, errResponse } from "@/common/response/helpers";
import { GenerateSchema, RegenerateSchema, RefineSchema } from "./types";

const validate = (schema: ZodSchema) =>
	zValidator("json", schema, (result, c) => {
		if (!result.success) {
			const firstIssue = result.error.issues[0];
			return errResponse(c, { message: firstIssue?.message || "Validation failed" }, 400);
		}
	});

const router = new Hono();

router.post("/generate", validate(GenerateSchema), async (c) => {
	const { collectionUrl, keywords, brandGuidelines } = c.req.valid("json");
	const keywordList = keywords.split(",").map((k) => k.trim()).filter(Boolean);

	return streamSSE(c, async (stream) => {
		const sendEvent = async (type: string, data: unknown) => {
			await stream.writeSSE({
				event: type,
				data: JSON.stringify(data),
			});
		};

		try {
			await generateCollectionContent(collectionUrl, keywordList, brandGuidelines, sendEvent);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			console.error("SSE stream error:", message);
			await sendEvent("error", { message: `Unexpected error: ${message}` });
		}
	});
});

router.post("/regenerate", validate(RegenerateSchema), async (c) => {
	const { draft, keywords, brandGuidelines } = c.req.valid("json");
	const keywordList = keywords.split(",").map((k) => k.trim()).filter(Boolean);

	try {
		const humanized = await regenerateHumanized(draft, keywordList, brandGuidelines);
		return successResponse(c, { humanized });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return errResponse(c, { message: `Humanization failed: ${message}` }, 500);
	}
});

router.post("/refine", validate(RefineSchema), async (c) => {
	const { currentContent, feedback, keywords, brandGuidelines, productDescriptions } = c.req.valid("json");
	const keywordList = keywords.split(",").map((k) => k.trim()).filter(Boolean);

	try {
		const refined = await refineContent(currentContent, feedback, keywordList, brandGuidelines, productDescriptions);
		return successResponse(c, { refined });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return errResponse(c, { message: `Refinement failed: ${message}` }, 500);
	}
});

export default router;
