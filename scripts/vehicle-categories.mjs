/**
 * Explicit, additive fleet mapping. Default: audit/dry-run only.
 * Run from BE with DATABASE_URL set to the intended environment.
 */
import 'dotenv/config';
import process from 'node:process';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const schoolId = args.includes('--school') ? value('--school') : undefined;
const mappingPath = args.includes('--mapping') ? value('--mapping') : undefined;
const apply = args.includes('--apply');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (args.includes('--help')) {
	console.log(`node scripts/vehicle-categories.mjs --school <UUID> [--mapping mapping.json] [--apply]
Mapping: [{ "vehicleId": "UUID", "supportedCourseTypeIds": ["UUID"] }]
Dry-run by default. Apply only ADDS explicit categories; no inferred mappings or removals.`);
	process.exit(0);
}
if (!schoolId || !uuid.test(schoolId) || (apply && !mappingPath))
	throw new Error(
		'Required: --school UUID; --apply also requires --mapping.',
	);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const mapping = mappingPath
	? JSON.parse(await readFile(mappingPath, 'utf8'))
	: [];
if (!Array.isArray(mapping)) throw new Error('Mapping must be an array');
const seen = new Set();
for (const row of mapping) {
	if (
		!row ||
		!uuid.test(row.vehicleId) ||
		seen.has(row.vehicleId) ||
		!Array.isArray(row.supportedCourseTypeIds) ||
		!row.supportedCourseTypeIds.length ||
		row.supportedCourseTypeIds.some(
			(id) => typeof id !== 'string' || !uuid.test(id),
		)
	)
		throw new Error('Invalid or duplicate mapping row');
	seen.add(row.vehicleId);
	row.supportedCourseTypeIds = [...new Set(row.supportedCourseTypeIds)];
}
const db = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
	const result = await db.$transaction(
		async (tx) => {
			const school = await tx.drivingSchool.findFirst({
				where: { id: schoolId, deletedAt: null },
				select: { id: true, name: true },
			});
			if (!school) throw new Error('School not found');
			const catalog = await tx.courseType.findMany({
				select: { id: true, code: true, name: true },
				orderBy: { code: 'asc' },
			});
			const vehicles = await tx.vehicle.findMany({
				where: { schoolId, isActive: true },
				include: { supportedCourseTypes: true },
			});
			// Validate every row before the first write; foreign-school vehicles are rejected.
			for (const row of mapping) {
				if (!vehicles.some((v) => v.id === row.vehicleId))
					throw new Error(
						'Mapping references a missing/inactive/foreign-school vehicle: ' +
							row.vehicleId,
					);
				if (
					row.supportedCourseTypeIds.some(
						(id) => !catalog.some((type) => type.id === id),
					)
				)
					throw new Error('Mapping references an unknown category');
			}
			for (const row of mapping) {
				const vehicle = vehicles.find((v) => v.id === row.vehicleId);
				const additional = row.supportedCourseTypeIds.filter(
					(id) =>
						!vehicle.supportedCourseTypes.some(
							(type) => type.id === id,
						),
				);
				if (apply && additional.length)
					await tx.vehicle.update({
						where: { id: row.vehicleId },
						data: {
							supportedCourseTypes: {
								connect: additional.map((id) => ({ id })),
							},
						},
					});
				// In dry-run report the projected state.
				vehicle.supportedCourseTypes.push(
					...catalog.filter((type) => additional.includes(type.id)),
				);
			}
			const now = new Date();
			const [lessons, events] = await Promise.all([
				tx.lesson.findMany({
					where: {
						course: { schoolId },
						deletedAt: null,
						status: 'SCHEDULED',
						endTime: { gt: now },
					},
					select: {
						id: true,
						vehicleId: true,
						course: { select: { courseTypeId: true } },
					},
				}),
				tx.instructorEvent.findMany({
					where: {
						schoolId,
						isActive: true,
						type: 'DRIVE',
						status: 'PLANNED',
						endTime: { gt: now },
						courseId: { not: null },
					},
					select: {
						id: true,
						vehicleId: true,
						course: { select: { courseTypeId: true } },
					},
				}),
			]);
			const unclassified = vehicles.filter(
				(v) => !v.supportedCourseTypes.length,
			);
			const conflicts = [
				...lessons.map((x) => ({ ...x, kind: 'lesson' })),
				...events.map((x) => ({ ...x, kind: 'event' })),
			]
				.filter(
					(row) =>
						!vehicles
							.find((v) => v.id === row.vehicleId)
							?.supportedCourseTypes.some(
								(type) => type.id === row.course?.courseTypeId,
							),
				)
				.map((row) => ({
					kind: row.kind,
					id: row.id,
					vehicleId: row.vehicleId,
					courseTypeId: row.course?.courseTypeId,
				}));
			return {
				mode: apply ? 'APPLIED_ADDITIVE_MAPPING' : 'DRY_RUN',
				school,
				ready: !unclassified.length && !conflicts.length,
				catalog,
				vehicles: vehicles.map((v) => ({
					id: v.id,
					name: v.name,
					registrationNumber: v.registrationNumber,
					supportedCourseTypeIds: v.supportedCourseTypes.map(
						(type) => type.id,
					),
				})),
				unclassifiedVehicleIds: unclassified.map((v) => v.id),
				futureConflicts: conflicts,
			};
		},
		{
			isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
			timeout: 30000,
		},
	);
	console.log(JSON.stringify(result, null, 2));
} finally {
	await db.$disconnect();
}
