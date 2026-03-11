import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { HttpError } from "@/common/errors";
import { errResponse, successResponse } from "@/common/response/helpers";
import { settings } from "@/common/config/settings";
import collectionRoute from "@/routers/collection";

const app = new Hono();

app.use(requestId());
app.use(
	cors({
		origin: settings.server.corsOrigin,
		allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.onError((err, c) => {
	if (err instanceof HttpError) {
		return errResponse(c, { message: err.message }, err.status);
	}
	console.error("Unhandled error:", err);
	return errResponse(c, { message: "Internal server error" }, 500);
});

app.get("/health", (c) => successResponse(c, { status: "ok" }));
app.route("/collection", collectionRoute);

console.log(`Server running on port ${settings.server.port}`);

export default {
	port: settings.server.port,
	fetch: app.fetch,
	idleTimeout: 255, // Max allowed — SSE streams for crawling + AI generation need time
};
