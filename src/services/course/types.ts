import {
	CourseKind,
	type Course,
	type CourseParticipantStatus,
	type CourseType,
} from '@prisma/client';

export type CreatedCourseDto = {
	id: string;
	name: string;
	category: string;
	courseType: CourseTypeDto;
	kind: CourseKind;
	totalHours: number;
	capacity: number | null;
	theoryStartDate: Date | null;
	theoryEndDate: Date | null;
	schoolId: string;
	instructorId: string | null;
	status: string;
	createdAt: Date;
};

export type CourseTypeDto = {
	id: string;
	code: string;
	name: string;
};

export type CourseWithType = Course & {
	courseType: Pick<CourseType, 'id' | 'code' | 'name'>;
};

export type CourseListInstructorDto = {
	id: string;
	name: string;
};

export type CourseListItemDto = {
	id: string;
	name: string;
	category: string;
	courseType: CourseTypeDto;
	type: CourseKind;
	totalHours: number;
	instructor: CourseListInstructorDto | null;
};

export type CurrentUserCourseDto = {
	id: string;
	schoolId: string;
	name: string;
	status: CourseParticipantStatus;
	type: CourseKind;
	totalHours: number;
	progress: number;
};

export type CurrentUserCourseRow = {
	studentId: string;
	status: CourseParticipantStatus;
	course: {
		id: string;
		schoolId: string;
		name: string;
		kind: CourseKind;
		totalHours: number;
	};
};

export type LessonTimeRange = {
	courseId: string;
	startTime: Date;
	endTime: Date;
};

export type CourseDetailDto = {
	id: string;
	schoolId: string;
	name: string;
	category: string;
	courseType: CourseTypeDto;
	type: CourseKind;
	totalHours: number;
	capacity: number | null;
	instructor: CourseListInstructorDto | null;
};
