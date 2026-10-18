import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

/** Delete old audit data in small, lock-safe batches so normal writes can continue. */
export async function pruneExpiredSecurityEvents(
	retentionDays = 90,
	batchSize = 500,
	maxBatches = 10,
): Promise<number> {
	if (
		!Number.isSafeInteger(retentionDays) ||
		retentionDays < 1 ||
		!Number.isSafeInteger(batchSize) ||
		batchSize < 1 ||
		batchSize > 5000 ||
		!Number.isSafeInteger(maxBatches) ||
		maxBatches < 1 ||
		maxBatches > 100
	) {
		throw new Error('Invalid security event retention settings');
	}
	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
	let deleted = 0;
	for (let i = 0; i < maxBatches; i += 1) {
		const count = await prisma.$executeRaw`
			WITH doomed AS (
				SELECT id FROM security_events
				WHERE occurred_at < ${cutoff}
				ORDER BY occurred_at, id
				LIMIT ${batchSize}
				FOR UPDATE SKIP LOCKED
			)
			DELETE FROM security_events AS event
			USING doomed
			WHERE event.id = doomed.id
		`;
		deleted += count;
		if (count < batchSize) break;
	}
	await prisma.$executeRaw`
		DELETE FROM security_detection_states
		WHERE last_active_at < ${cutoff}
		  AND done_generation >= queued_generation
	`;
	return deleted;
}
