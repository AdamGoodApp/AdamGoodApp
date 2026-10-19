import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";
import { redirectForHost } from "#/lib/canonical";

const canonicalHost = createMiddleware().server(({ next, request }) => {
	const redirect = redirectForHost(new URL(request.url));
	if (redirect) throw redirect;
	return next();
});

export const startInstance = createStart(() => ({
	requestMiddleware: [
		canonicalHost,
		createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
	],
}));
