import { DurableObject } from "cloudflare:workers";
import {
	type LimitResult,
	type LimitTier,
	slidingWindowHit,
} from "./rate-limit";

const HITS_KEY = "hits";
/** Storage of an idle client is wiped once its longest window (a day) has passed. */
const IDLE_WIPE_MS = 86_400_000;

/**
 * One Durable Object per client (`getByName(clientKey(ip))`) holding that
 * client's recent /api/chat request times. A Durable Object handles one
 * request at a time, so concurrent requests are counted exactly, unlike the
 * Workers rate limiting binding, whose counts are per machine and eventually
 * consistent. The times are kept in the object's storage, because an idle
 * object loses its memory within seconds (and on every deploy); an alarm a
 * day after the last request deletes them.
 */
export class ChatRateLimiter extends DurableObject {
	async hit(tiers: readonly LimitTier[]): Promise<LimitResult> {
		const now = Date.now();
		const stored = (await this.ctx.storage.get<number[]>(HITS_KEY)) ?? [];
		const { result, hits } = slidingWindowHit(stored, tiers, now);
		await this.ctx.storage.put(HITS_KEY, hits);
		await this.ctx.storage.setAlarm(now + IDLE_WIPE_MS);
		return result;
	}

	async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}
}
