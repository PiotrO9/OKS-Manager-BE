import {
	createCourseForUser,
	deleteEmptyCourseForOwner,
	patchCourseForOwner,
} from './commands';
import {
	getCourseDetailForOwner,
	listCoursesForCurrentUser,
	listCoursesForSchool,
} from './queries';

export const courseService = {
	createCourseForUser,
	listCoursesForSchool,
	listCoursesForCurrentUser,
	getCourseDetailForOwner,
	patchCourseForOwner,
	deleteEmptyCourseForOwner,
};
