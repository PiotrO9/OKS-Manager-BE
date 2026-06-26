import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	activeSchoolClause,
	reconcileUserDefaultOskId,
} from '../oskContext';
import { settingsIncludeOffered } from './shared';

const prisma = getPrisma();

export async function listDrivingSchoolsForOwner(userId: string) {
	const [schools, owner] = await Promise.all([
		prisma.drivingSchool.findMany({
			where: activeSchoolClause({ ownerId: userId }),
			include: {
				settings: settingsIncludeOffered,
			},
		}),
		prisma.user.findUnique({
			where: { id: userId },
			select: { defaultOskId: true },
		}),
	]);

	const defaultOskId = await reconcileUserDefaultOskId(
		userId,
		schools,
		owner?.defaultOskId ?? null,
	);

	const schoolsWithDefault = schools.map((school) => {
		const { settings, ...rest } = school;
		return {
			...rest,
			enabledCourseKinds: settings?.enabledCourseKinds ?? [],
			offeredCourseTypes: settings?.offeredCourseTypes ?? [],
			isDefault: defaultOskId !== null && school.id === defaultOskId,
		};
	});

	return {
		schools: schoolsWithDefault,
		defaultOskId,
	};
}

export async function getDefaultDrivingSchoolForOwner(userId: string) {
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

	const defaultOskId = await reconcileUserDefaultOskId(
		userId,
		schools,
		owner?.defaultOskId ?? null,
	);

	if (!defaultOskId) {
		throw AppError.notFound('No default driving school set');
	}

	const school = await prisma.drivingSchool.findUnique({
		where: { id: defaultOskId },
		include: {
			settings: {
				include: {
					offeredCourseTypes: {
						select: { id: true, code: true, name: true },
					},
				},
			},
		},
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.notFound('Driving school not found');
	}

	const isManager = school.ownerId === userId;
	const { settings: defSettings, ...defRest } = school;

	const offeredCourseTypes = defSettings?.offeredCourseTypes ?? [];
	const enabledCourseKinds = defSettings?.enabledCourseKinds ?? [];

	const settingsScalars =
		defSettings === null
			? null
			: (() => {
				const rest = { ...defSettings };
				delete (
					rest as Partial<typeof defSettings>
				).offeredCourseTypes;
				return rest;
			})();

	return {
		...defRest,
		enabledCourseKinds,
		offeredCourseTypes,
		settings: settingsScalars,
		isManager,
	};
}
