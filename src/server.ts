import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import { sendJsonError, sendJsonSuccess } from './lib/apiResponse';
import { getPrisma } from './lib/prisma';
import { createAuthRouter } from './auth/auth.routes';

const prisma = getPrisma();

function parseAllowedOrigins(): string[] {
	const raw = process.env.FRONTEND_URL?.trim();
	if (raw) {
		return raw.split(',').map((s) => s.trim()).filter(Boolean);
	}
	return ['http://localhost:5173', 'http://localhost:3000'];
}

function createApp() {
	const app = express();
	app.use(
		cors({
			origin: parseAllowedOrigins(),
			credentials: true,
		})
	);
	app.use(express.json());
	app.use(cookieParser());

	app.use('/auth', createAuthRouter());

	app.get('/test', async (req, res) => {
		return sendJsonSuccess(res, {
			message: 'OSK Manager API - test endpoint',
		});
	});

	app.get('/db-test', async (req, res) => {
		try {
			await prisma.$connect();
			const users = await prisma.user.findMany({ take: 1 });
			return sendJsonSuccess(res, {
				usersCount: users.length,
				sample: users[0] || null,
			});
		} catch (err) {
			console.error('DB test error', err);
			return sendJsonError(res, String(err), 500);
		}
	});

	return app;
}

async function startServer() {
	const app = createApp();
	const port = process.env.PORT || 3001;
	app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`Server listening on http://localhost:${port}`);
	});
}

startServer().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exit(1);
});
