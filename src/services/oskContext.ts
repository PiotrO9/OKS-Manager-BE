import { getPrisma } from '../lib/prisma';

const prisma = getPrisma();

/** Aktywne OSK (bez soft-delete). */
export function activeSchoolClause<T extends Record<string, unknown>>(
	extra: T,
) {
	return { ...extra, deletedAt: null };
}

export type DefaultOskSchoolRow = { id: string; createdAt: Date };

/**
 * defaultOskId musi być null lub wskazywać aktywny OSK z listy właściciela.
 * Inaczej: naprawa w DB — najwcześniejszy z listy albo null przy braku szkół.
 */
export async function reconcileUserDefaultOskId(
	userId: string,
	schools: DefaultOskSchoolRow[],
	storedDefaultId: string | null,
): Promise<string | null> {
	const ownedIds = new Set(schools.map((s) => s.id));
	const defaultIsValid =
		storedDefaultId !== null && ownedIds.has(storedDefaultId);

	if (defaultIsValid) {
		return storedDefaultId;
	}

	if (schools.length > 0) {
		const earliest = schools.reduce((a, b) =>
			a.createdAt <= b.createdAt ? a : b,
		);
		await prisma.user.update({
			where: { id: userId },
			data: { defaultOskId: earliest.id },
		});
		return earliest.id;
	}

	if (storedDefaultId !== null) {
		await prisma.user.update({
			where: { id: userId },
			data: { defaultOskId: null },
		});
	}

	return null;
}

/** Zwraca domyślne OSK właściciela po rekonsyliacji (lub null). */
export async function getResolvedDefaultOskIdForOwner(
	userId: string,
): Promise<string | null> {
	const [schools, owner] = await Promise.all([
		prisma.drivingSchool.findMany({
			where: activeSchoolClause({ ownerId: userId }),
			select: { id: true, createdAt: true },
		}),
		prisma.user.findUnique({
			where: { id: userId },
			select: { defaultOskId: true },
		}),
	]);

	return reconcileUserDefaultOskId(
		userId,
		schools,
		owner?.defaultOskId ?? null,
	);
}
