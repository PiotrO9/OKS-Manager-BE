import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Request, RequestHandler, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import app from '../../app';

vi.mock('../../middleware/auth.middleware', async (importOriginal) => {
	const original =
		await importOriginal<
			typeof import('../../middleware/auth.middleware')
		>();
	const pass: RequestHandler = (_req, _res, next) => next();
	return { ...original, authMiddleware: pass, requireMinRole: () => pass };
});

vi.mock('../../controllers/auth.controller', async (importOriginal) => ({
	...(await importOriginal<
		typeof import('../../controllers/auth.controller')
	>()),
	uploadProfileAvatar: (_req: Request, res: Response) => res.sendStatus(200),
}));

vi.mock('../../controllers/vehicles.controller', async (importOriginal) => ({
	...(await importOriginal<
		typeof import('../../controllers/vehicles.controller')
	>()),
	uploadVehiclePhoto: (_req: Request, res: Response) => res.sendStatus(200),
}));

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

beforeAll(async () => {
	server = app.listen(0, '127.0.0.1');
	await once(server, 'listening');
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe.each(['/auth/profile/avatar', '/vehicles/vehicle-id/photo'])(
	'photo upload at %s',
	(path) => {
		it.each([
			[4_000_000, 200],
			[4_000_001, 400],
		])(
			'returns the expected status for a %i-byte file',
			async (size, status) => {
				const form = new FormData();
				form.set(
					'file',
					new Blob([new Uint8Array(size)], { type: 'image/png' }),
					'photo.png',
				);
				const response = await fetch(`${baseUrl}${path}`, {
					method: 'POST',
					body: form,
				});
				expect(response.status).toBe(status);
			},
		);
	},
);
