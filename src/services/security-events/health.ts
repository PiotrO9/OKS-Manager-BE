import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();
type Component = 'WRITER' | 'DETECTOR';
type HealthRow = {
	component: Component;
	last_success_at: Date | null;
	last_failure_at: Date | null;
};
const pendingFailures = new Map<Component, Date>();
const lastReports = new Map<Component, number>();

/** Best effort, bounded writes; monitoring must not break the business request.
 * Failed health writes are retained in this process until the DB recovers.
 * Process loss during DB outage remains an explicitly documented limitation.
 */
export async function reportSecurityHealth(
	component: Component,
	success: boolean,
): Promise<void> {
	const now = new Date();
	if (!success) pendingFailures.set(component, now);
	if (
		success &&
		!pendingFailures.has(component) &&
		now.getTime() - (lastReports.get(component) ?? 0) < 5000
	)
		return;
	const failure = pendingFailures.get(component) ?? null;
	try {
		await prisma.$transaction(
			async (tx) => {
				await tx.$executeRaw`
			INSERT INTO security_monitor_health (component, last_success_at, last_failure_at)
			VALUES (${component}, ${success ? now : null}::timestamptz, ${failure}::timestamptz)
			ON CONFLICT (component) DO UPDATE SET
			last_success_at = GREATEST(security_monitor_health.last_success_at, EXCLUDED.last_success_at),
			last_failure_at = GREATEST(security_monitor_health.last_failure_at, EXCLUDED.last_failure_at)`;
			},
			{ timeout: 1500, maxWait: 500 },
		);
		lastReports.set(component, now.getTime());
		if (pendingFailures.get(component) === failure)
			pendingFailures.delete(component);
	} catch {
		// A later successful report persists the remembered failure timestamp.
		if (!pendingFailures.has(component))
			pendingFailures.set(component, now);
	}
}

export async function getSecurityCollectionStatus(): Promise<
	'OK' | 'DEGRADED' | 'UNKNOWN'
> {
	if (process.env.SECURITY_EVENTS_DETECTION_ENABLED === 'false')
		return 'DEGRADED';
	if (
		[
			'SECURITY_EVENT_HMAC_KEY',
			'SECURITY_LOG_CURSOR_SECRET',
			'SECURITY_LOGS_BFF_SHARED_SECRET',
		].some((key) => (process.env[key]?.length ?? 0) < 32)
	)
		return 'DEGRADED';
	try {
		const rows = await prisma.$queryRaw<
			HealthRow[]
		>`SELECT component, last_success_at, last_failure_at FROM security_monitor_health`;
		const now = Date.now();
		if (
			pendingFailures.size ||
			rows.some(
				(r) =>
					r.last_failure_at &&
					now - r.last_failure_at.getTime() < 300_000,
			)
		)
			return 'DEGRADED';
		const detector = rows.find((r) => r.component === 'DETECTOR');
		if (!detector?.last_success_at) return 'UNKNOWN';
		if (now - detector.last_success_at.getTime() > 30_000)
			return 'DEGRADED';
		const [queue] = await prisma.$queryRaw<Array<{ delayed: boolean }>>`
			SELECT EXISTS (SELECT 1 FROM security_detection_states
			WHERE done_generation < queued_generation AND last_active_at < NOW() - INTERVAL '30 seconds') AS delayed`;
		return queue?.delayed ? 'DEGRADED' : 'OK';
	} catch {
		return 'UNKNOWN';
	}
}
