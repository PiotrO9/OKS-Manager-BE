import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();
const MAX_SERIALIZATION_ATTEMPTS = 3;

export async function runScheduleWriteTransaction<T>(
	write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
	for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
		try {
			return await prisma.$transaction(write, {
				isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
			});
		} catch (error) {
			if (!isSerializationConflict(error)) {
				throw error;
			}

			if (attempt === MAX_SERIALIZATION_ATTEMPTS) {
				throw AppError.conflict(
					'Schedule changed while saving. Check availability and try again.',
				);
			}
		}
	}

	throw AppError.conflict(
		'Schedule changed while saving. Check availability and try again.',
	);
}

function isSerializationConflict(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === 'P2034'
	);
}
