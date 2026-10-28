import 'dotenv/config';
import { createApp } from './app';
import { logger } from './lib/logger';
import { processSecurityDetectionQueue } from './services/security-events/detection';
import { pruneExpiredSecurityEvents } from './services/security-events/retention';
import { reportSecurityHealth } from './services/security-events/health';

function startSecurityDetectionWorker(): void {
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
	timer.unref();
}

function startSecurityRetentionWorker(): void {
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
	initial.unref();
	const timer = setInterval(() => {
		void run();
	}, 60 * 60_000);
	timer.unref();
}

async function startServer() {
	const app = createApp();
	const port = process.env.PORT || 3001;
	app.listen(port, () => {
		logger.info(`Server listening on http://localhost:${port}`);
		startSecurityDetectionWorker();
		startSecurityRetentionWorker();
	});
}

startServer().catch((err) => {
	logger.error('Server startup failed', err);
	process.exit(1);
});
