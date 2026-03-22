import express from 'express';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaBetterSqlite3({
	url: process.env.DATABASE_URL || 'file:./dev.db',
});
const prisma = new PrismaClient({ adapter });

function createApp() {
	const app = express();
	app.use(express.json());

	app.get('/', async (req, res) => {
		res.json({ message: 'OSK Manager API' });
	});

	app.get('/users', async (req, res) => {
		const users = await prisma.user.findMany();
		res.json(users);
	});

	app.post('/users', async (req, res) => {
		const { email, name } = req.body;
		if (!email) return res.status(400).json({ error: 'email is required' });
		const user = await prisma.user.create({ data: { email, name } });
		res.status(201).json(user);
	});

	return app;
}

async function startServer() {
	const app = createApp();
	const port = process.env.PORT || 3000;
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
