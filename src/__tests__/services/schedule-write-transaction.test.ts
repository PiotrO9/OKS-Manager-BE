import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runScheduleWriteTransaction } from '../../services/schedule-validation/transaction';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		$transaction: vi.fn(),
	},
}));

vi.mock('../../lib/prisma', () => ({ getPrisma: () => prismaMock }));

function serializationError(): Prisma.PrismaClientKnownRequestError {
	return new Prisma.PrismaClientKnownRequestError(
		'Transaction failed due to a write conflict',
		{ code: 'P2034', clientVersion: 'test' },
	);
}

describe('runScheduleWriteTransaction', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses PostgreSQL serializable isolation', async () => {
		prismaMock.$transaction.mockImplementationOnce(async (callback) =>
			callback({ marker: 'tx' }),
		);

		await expect(
			runScheduleWriteTransaction(
				async (tx) => (tx as unknown as { marker: string }).marker,
			),
		).resolves.toBe('tx');
		expect(prismaMock.$transaction).toHaveBeenCalledWith(
			expect.any(Function),
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
		);
	});

	it('retries serialization conflicts and returns the later result', async () => {
		prismaMock.$transaction
			.mockRejectedValueOnce(serializationError())
			.mockImplementationOnce(async (callback) => callback({}));

		await expect(
			runScheduleWriteTransaction(async () => 'saved'),
		).resolves.toBe('saved');
		expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
	});

	it('maps a persistent serialization conflict to HTTP 409', async () => {
		prismaMock.$transaction.mockRejectedValue(serializationError());

		await expect(
			runScheduleWriteTransaction(async () => 'saved'),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
	});

	it('does not retry business errors', async () => {
		const error = new Error('validation failed');
		prismaMock.$transaction.mockRejectedValue(error);

		await expect(
			runScheduleWriteTransaction(async () => 'saved'),
		).rejects.toBe(error);
		expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
	});
});
