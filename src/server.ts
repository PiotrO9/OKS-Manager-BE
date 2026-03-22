import express from 'express';
import dotenv from 'dotenv';

import { getPrisma } from './lib/prisma';
import uploadRouter from './routes/upload';

dotenv.config();

const prisma = getPrisma();

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

	app.use('/upload', uploadRouter);

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
