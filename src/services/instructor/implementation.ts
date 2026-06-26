export {
	assignInstructorToSchoolForManagerOrAdmin,
	softDeleteInstructorForManagerOrAdmin,
	updateInstructorForManagerOrAdmin,
} from './commands';
export {
	getInstructorByIdForUser,
	listInstructorsBySchoolForUser,
} from './queries';
export type {
	Actor,
	InstructorDetail,
	InstructorListItem,
	InstructorPatchInput,
	InstructorPatchResult,
	InstructorQualifiedCourseType,
} from './types';
