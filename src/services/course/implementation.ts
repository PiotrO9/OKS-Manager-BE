import {
	createCourseForUser,
	patchCourseInstructorForOwner,
} from './commands';
import {
	getCourseDetailForOwner,
	listCoursesForCurrentUser,
	listCoursesForSchool,
} from './queries';

export * from './types';

export const courseService = {
	createCourseForUser,
	listCoursesForSchool,
	listCoursesForCurrentUser,
	getCourseDetailForOwner,
	patchCourseInstructorForOwner,
};
