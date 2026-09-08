import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { registerAuthPaths } from './auth.paths';
import { registerCoursePaths } from './courses.paths';
import { registerCourseTypePaths } from './courseTypes.paths';
import { registerDrivingSchoolPaths } from './drivingSchools.paths';
import { registerEventPaths } from './events.paths';
import { registerHealthPaths } from './health.paths';
import { registerInstructorPaths } from './instructors.paths';
import { registerLessonPaths } from './lessons.paths';
import { registerManagerAttentionPaths } from './managerAttention.paths';
import { registerSchedulePaths } from './schedule.paths';
import { registerDevPaths } from './dev.paths';
import { registerStudentPaths } from './students.paths';
import { registerVehiclePaths } from './vehicles.paths';

export function registerOpenApiPaths(registry: OpenAPIRegistry): void {
	registry.registerComponent('securitySchemes', 'bearerAuth', {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
		description:
			'Access token z POST /auth/login lub POST /auth/refresh. Refresh w httpOnly cookie.',
	});

	registerHealthPaths(registry);
	registerAuthPaths(registry);
	registerDrivingSchoolPaths(registry);
	registerInstructorPaths(registry);
	registerStudentPaths(registry);
	registerVehiclePaths(registry);
	registerCoursePaths(registry);
	registerLessonPaths(registry);
	registerEventPaths(registry);
	registerCourseTypePaths(registry);
	registerManagerAttentionPaths(registry);
	registerSchedulePaths(registry);
	registerDevPaths(registry);
}
