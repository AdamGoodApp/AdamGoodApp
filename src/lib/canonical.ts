export const CANONICAL_HOST = "adamgoodapp.com";

/** 301 to the apex for `www.` requests; null when the host is already canonical. */
export function redirectForHost(url: URL): Response | null {
	if (url.hostname !== `www.${CANONICAL_HOST}`) return null;
	const target = new URL(url);
	target.hostname = CANONICAL_HOST;
	target.protocol = "https:";
	return new Response(null, {
		status: 301,
		headers: { location: target.toString() },
	});
}
