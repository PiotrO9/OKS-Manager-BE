import { createCourseForUser, patchCourseForOwner } from './commands';
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
};
