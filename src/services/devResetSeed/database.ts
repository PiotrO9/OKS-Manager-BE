import type { PrismaClient } from '@prisma/client';

export async function resetDatabase(prisma: PrismaClient) {
	await prisma.$executeRawUnsafe(`
		TRUNCATE TABLE
			"_InstructorQualifiedCourseTypes",
			"_SchoolSettingsOfferedCourseTypes",
			"event_participants",
			"lesson_ratings",
			"payments",
			"payment_plans",
			"lessons",
			"instructor_events",
			"instructor_time_blocks",
			"instructor_leaves",
			"instructor_working_hours",
			"instructor_working_hours_default",
			"course_participants",
			"courses",
			"course_types",
			"vehicles",
			"student_schools",
			"instructor_schools",
			"student_profiles",
			"instructor_profiles",
			"school_settings",
			"driving_schools",
			"user_profiles",
			"user_settings",
			"users"
		RESTART IDENTITY CASCADE
	`);
}
