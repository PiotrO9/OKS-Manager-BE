import 'dotenv/config';
import app from './app';
import { logger } from './lib/logger';
import { startSecurityWorkers } from './services/security-events/worker';

async function startServer() {
	const port = process.env.PORT || 3001;
	app.listen(port, () => {
		logger.info(`Server listening on http://localhost:${port}`);
		if (process.env.SECURITY_WORKERS_IN_API !== 'false') {
			startSecurityWorkers(false);
		}
	});
}

startServer().catch((err) => {
	logger.error('Server startup failed', err);
	process.exit(1);
});
