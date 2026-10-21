import { DurableObject } from "cloudflare:workers";
import {
	type LimitResult,
	type LimitTier,
	slidingWindowHit,
} from "./rate-limit";

/**
 * One Durable Object per client IP (`getByName(ip)`) holding that client's
 * recent /api/chat request times. A Durable Object handles one request at a
 * time, so concurrent requests are counted exactly, unlike the Workers rate
 * limiting binding, whose counts are per machine and eventually consistent.
 * The times live in memory: an idle object is evicted and starts over, while
 * a client that keeps sending keeps it alive.
 */
export class ChatRateLimiter extends DurableObject {
	#hits: number[] = [];

	hit(tiers: readonly LimitTier[]): LimitResult {
		const { result, hits } = slidingWindowHit(this.#hits, tiers, Date.now());
		this.#hits = hits;
		return result;
	}
}
