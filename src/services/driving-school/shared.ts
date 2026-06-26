import type { CourseKind, CourseType } from '@prisma/client';

export const settingsIncludeOffered = {
	select: {
		enabledCourseKinds: true,
		offeredCourseTypes: { select: { id: true, code: true, name: true } },
	},
} as const;

type OfferedCourseType = Pick<CourseType, 'id' | 'code' | 'name'>;
type SchoolSettingsProjection = {
	enabledCourseKinds: CourseKind[];
	offeredCourseTypes: OfferedCourseType[];
} | null;

export function mapSchoolWithOfferedSettings<
	TSchool extends { settings: SchoolSettingsProjection },
>(school: TSchool) {
	const { settings, ...rest } = school;

	return {
		...rest,
		enabledCourseKinds: settings?.enabledCourseKinds ?? [],
		offeredCourseTypes: settings?.offeredCourseTypes ?? [],
	};
}
