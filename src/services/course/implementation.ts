import { createCourseForUser, patchCourseInstructorForOwner } from './commands';
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
	patchCourseInstructorForOwner,
};
