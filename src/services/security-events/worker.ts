import { logger } from '../../lib/logger';
import { processSecurityDetectionQueue } from './detection';
import { pruneExpiredSecurityEvents } from './retention';
import { reportSecurityHealth } from './health';

function startSecurityDetectionWorker(keepAlive: boolean): void {
	if (process.env.SECURITY_EVENTS_DETECTION_ENABLED === 'false') return;
	let running = false;
	const run = async () => {
		if (running) return;
		running = true;
		try {
			await processSecurityDetectionQueue();
			await reportSecurityHealth('DETECTOR', true);
		} catch (error) {
			await reportSecurityHealth('DETECTOR', false);
			logger.error('Security event detection worker failed', error);
		} finally {
			running = false;
		}
	};
	void run();
	const timer = setInterval(() => {
		void run();
	}, 5_000);
	if (!keepAlive) timer.unref();
}

function startSecurityRetentionWorker(keepAlive: boolean): void {
	if (process.env.SECURITY_EVENTS_RETENTION_ENABLED === 'false') return;
	let running = false;
	const run = async () => {
		if (running) return;
		running = true;
		try {
			const days = Number(
				process.env.SECURITY_EVENTS_RETENTION_DAYS ?? '90',
			);
			const deleted = await pruneExpiredSecurityEvents(days);
			if (deleted)
				logger.info(
					`Security event retention removed ${deleted} expired events`,
				);
		} catch (error) {
			logger.error('Security event retention worker failed', error);
		} finally {
			running = false;
		}
	};
	const initial = setTimeout(() => {
		void run();
	}, 60_000);
	if (!keepAlive) initial.unref();
	const timer = setInterval(() => {
		void run();
	}, 60 * 60_000);
	if (!keepAlive) timer.unref();
}

export function startSecurityWorkers(keepAlive: boolean): void {
	startSecurityDetectionWorker(keepAlive);
	startSecurityRetentionWorker(keepAlive);
}
