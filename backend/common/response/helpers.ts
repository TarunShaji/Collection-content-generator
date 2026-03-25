import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function successResponse<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
	return c.json({ success: true, data }, status);
}

export function errResponse(c: Context, data: { message: string }, status: ContentfulStatusCode = 400) {
	return c.json({ success: false, data }, status);
}
