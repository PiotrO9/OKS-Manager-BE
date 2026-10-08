import { Role, type Prisma, type PrismaClient } from '@prisma/client';
import { resetDatabase } from './devResetSeed/database';

export type AuditResetLevel = 'managers' | 'schools' | 'instructors' | 'full';

export interface AuditResetSummary {
	users: number;
	admins: number;
	managers: number;
	instructors: number;
	students: number;
	schools: number;
	courses: number;
	lessons: number;
	events: number;
	vehicles: number;
}

export interface AuditResetPreview {
	level: AuditResetLevel;
	before: AuditResetSummary;
	retained: AuditResetSummary;
	canExecute: boolean;
	reason: string | null;
}

function subtractSummaries(
	left: AuditResetSummary,
	right: AuditResetSummary,
): AuditResetSummary {
	return Object.fromEntries(
		(Object.keys(left) as (keyof AuditResetSummary)[]).map((key) => [
			key,
			Math.max(0, left[key] - right[key]),
		]),
	) as unknown as AuditResetSummary;
}

export class AuditResetConflictError extends Error {
	readonly code = 'AUDIT_RESET_CONFLICT';
}

export class AuditResetUnavailableError extends Error {
	readonly code = 'AUDIT_RESET_UNAVAILABLE';
}

export interface AuditResetOptions {
	expectedPreview?: AuditResetPreview;
	restoreAfterFull?: (tx: Prisma.TransactionClient) => Promise<void>;
}

type AuditDatabase = PrismaClient | Prisma.TransactionClient;

type OptionalAccountDelegate = { deleteMany: () => Promise<unknown> };

async function deleteOptionalAccountRecords(
	tx: Prisma.TransactionClient,
	model: 'accountAction' | 'accountSession',
): Promise<void> {
	const delegate = (
		tx as unknown as Record<string, OptionalAccountDelegate | undefined>
	)[model];
	await delegate?.deleteMany();
}

function assertAuditResetLevel(
	level: string,
): asserts level is AuditResetLevel {
	if (!['managers', 'schools', 'instructors', 'full'].includes(level)) {
		throw new Error(`Unknown audit reset level: ${level}`);
	}
}

async function summarize(prisma: AuditDatabase): Promise<AuditResetSummary> {
	const [
		users,
		admins,
		managers,
		instructors,
		students,
		schools,
		courses,
		lessons,
		events,
		vehicles,
	] = await Promise.all([
		prisma.user.count(),
		prisma.user.count({ where: { role: Role.ADMIN } }),
		prisma.user.count({ where: { role: Role.MANAGER } }),
		prisma.user.count({ where: { role: Role.INSTRUCTOR } }),
		prisma.user.count({ where: { role: Role.STUDENT } }),
		prisma.drivingSchool.count(),
		prisma.course.count(),
		prisma.lesson.count(),
		prisma.instructorEvent.count(),
		prisma.vehicle.count(),
	]);
	return {
		users,
		admins,
		managers,
		instructors,
		students,
		schools,
		courses,
		lessons,
		events,
		vehicles,
	};
}

async function retention(prisma: AuditDatabase, level: AuditResetLevel) {
	const schoolIds =
		level === 'schools' || level === 'instructors'
			? (
					await prisma.drivingSchool.findMany({
						where: { owner: { role: Role.MANAGER } },
						select: { id: true },
					})
				).map(({ id }) => id)
			: [];
	const instructorUserIds =
		level === 'instructors'
			? [
					...new Set(
						(
							await prisma.instructorSchool.findMany({
								where: {
									schoolId: { in: schoolIds },
									instructor: {
										user: { role: Role.INSTRUCTOR },
									},
								},
								select: {
									instructor: { select: { userId: true } },
								},
							})
						).map(({ instructor }) => instructor.userId),
					),
				]
			: [];
	return { schoolIds, instructorUserIds };
}

async function buildPreview(
	prisma: AuditDatabase,
	level: AuditResetLevel,
): Promise<AuditResetPreview> {
	assertAuditResetLevel(level);
	const [before, keep, activeAdmins] = await Promise.all([
		summarize(prisma),
		retention(prisma, level),
		prisma.user.count({
			where: { role: Role.ADMIN, isActive: true, deletedAt: null },
		}),
	]);
	const retained: AuditResetSummary = {
		users:
			level === 'full'
				? 0
				: before.admins +
					before.managers +
					keep.instructorUserIds.length,
		admins: level === 'full' ? 0 : before.admins,
		managers: level === 'full' ? 0 : before.managers,
		instructors: keep.instructorUserIds.length,
		students: 0,
		schools: keep.schoolIds.length,
		courses: 0,
		lessons: 0,
		events: 0,
		vehicles: 0,
	};
	const canExecute = level === 'full' || activeAdmins > 0;
	return {
		level,
		before,
		retained,
		canExecute,
		reason: canExecute
			? null
			: 'Partial reset requires an active admin account.',
	};
}

export async function previewAuditReset(
	prisma: PrismaClient,
	level: AuditResetLevel,
): Promise<AuditResetPreview> {
	return buildPreview(prisma, level);
}

export async function resetAuditDatabase(
	prisma: PrismaClient,
	level: AuditResetLevel,
	options: AuditResetOptions = {},
) {
	assertAuditResetLevel(level);
	return prisma.$transaction(
		async (tx) => {
			const locks = await tx.$queryRaw<{ locked: boolean }[]>`
				SELECT pg_try_advisory_xact_lock(791677009241477322::bigint) AS locked
			`;
			if (!locks[0]?.locked) {
				throw new AuditResetConflictError(
					'Another audit reset is already running.',
				);
			}
			const preflight = await buildPreview(tx, level);
			if (
				options.expectedPreview &&
				JSON.stringify(options.expectedPreview) !==
					JSON.stringify(preflight)
			) {
				throw new AuditResetConflictError(
					'Audit reset preview is stale. Refresh it and try again.',
				);
			}
			if (!preflight.canExecute) {
				throw new AuditResetUnavailableError(
					preflight.reason ?? 'Audit reset cannot proceed.',
				);
			}
			const { before } = preflight;
			if (level === 'full') {
				if (!options.restoreAfterFull) {
					throw new AuditResetUnavailableError(
						'Full reset requires admin recovery callback.',
					);
				}
				// These tables were added after the original demo reset helper.
				await deleteOptionalAccountRecords(tx, 'accountAction');
				await deleteOptionalAccountRecords(tx, 'accountSession');
				await resetDatabase(tx);
				await options.restoreAfterFull(tx);
				const recoveredAdmins = await tx.user.count({
					where: {
						role: Role.ADMIN,
						isActive: true,
						deletedAt: null,
					},
				});
				if (recoveredAdmins === 0) {
					throw new AuditResetUnavailableError(
						'Full reset must restore an active admin account.',
					);
				}
				const after = await summarize(tx);
				return {
					level,
					before,
					retained: preflight.retained,
					removed: subtractSummaries(before, preflight.retained),
					created: subtractSummaries(after, preflight.retained),
					after,
				};
			}

			const { schoolIds, instructorUserIds } = await retention(tx, level);
			const keepUserIds = (
				await tx.user.findMany({
					where: { role: { in: [Role.ADMIN, Role.MANAGER] } },
					select: { id: true },
				})
			).map(({ id }) => id);
			keepUserIds.push(...instructorUserIds);

			// Child records with restrictive foreign keys go first. Clear account actions
			// because their actor and target can belong to accounts being removed.
			await deleteOptionalAccountRecords(tx, 'accountAction');
			await tx.eventParticipant.deleteMany();
			await tx.lessonRating.deleteMany();
			await tx.payment.deleteMany();
			await tx.paymentPlan.deleteMany();
			await tx.lesson.deleteMany();
			await tx.instructorEvent.deleteMany();
			await tx.instructorTimeBlock.deleteMany();
			await tx.instructorLeave.deleteMany();
			await tx.instructorWorkingHours.deleteMany();
			await tx.courseParticipant.deleteMany();
			await tx.course.deleteMany();
			await tx.vehicle.deleteMany();
			await tx.studentSchool.deleteMany();
			await tx.studentProfile.deleteMany();

			if (level === 'instructors') {
				await tx.instructorSchool.deleteMany({
					where: { schoolId: { notIn: schoolIds } },
				});
				await tx.instructorProfile.deleteMany({
					where: { userId: { notIn: instructorUserIds } },
				});
			} else {
				await tx.instructorSchool.deleteMany();
				await tx.instructorProfile.deleteMany();
			}

			// User.defaultOskId has no ON DELETE action, so detach discarded schools first.
			await tx.user.updateMany({
				where: { defaultOskId: { not: null, notIn: schoolIds } },
				data: { defaultOskId: null },
			});
			await tx.drivingSchool.deleteMany({
				where: { id: { notIn: schoolIds } },
			});
			await tx.user.deleteMany({ where: { id: { notIn: keepUserIds } } });
			const after = await summarize(tx);
			return {
				level,
				before,
				retained: preflight.retained,
				removed: subtractSummaries(before, preflight.retained),
				created: subtractSummaries(after, preflight.retained),
				after,
			};
		},
		{ timeout: 120_000, maxWait: 120_000 },
	);
}
