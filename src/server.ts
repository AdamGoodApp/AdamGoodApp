import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

// Durable Object classes must be exported from the Worker's main module.
export { ChatRateLimiter } from "#/chat/rate-limiter-object";

/** The Worker entry: TanStack Start's handler, plus the Durable Object exports above. */
export default createServerEntry({
	fetch: (request) => handler.fetch(request),
});
