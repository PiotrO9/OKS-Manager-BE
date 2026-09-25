import 'dotenv/config';
import { createApp } from './app';
import { logger } from './lib/logger';

async function startServer() {
	const app = createApp();
	const port = process.env.PORT || 3001;
	app.listen(port, () => {
		logger.info(`Server listening on http://localhost:${port}`);
	});
}

startServer().catch((err) => {
	logger.error('Server startup failed', err);
	process.exit(1);
});
