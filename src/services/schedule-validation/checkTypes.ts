export type ScheduleAvailabilityIssueCode =
	| 'DURATION_TOO_SHORT'
	| 'DURATION_TOO_LONG'
	| 'INSTRUCTOR_BUSY'
	| 'OUTSIDE_INSTRUCTOR_HOURS'
	| 'INSTRUCTOR_NOT_ELIGIBLE'
	| 'PARTICIPANT_BUSY'
	| 'STUDENT_BUSY'
	| 'STUDENT_NOT_ELIGIBLE'
	| 'COURSE_LIMIT_EXCEEDED'
	| 'DATE_NOT_BOOKABLE'
	| 'VEHICLE_COURSE_TYPE_MISMATCH'
	| 'VEHICLE_UNAVAILABLE'
	| 'VEHICLE_BUSY'
	| 'NO_VEHICLE_AVAILABLE'
	| 'COURSE_NOT_ELIGIBLE';

export interface ScheduleAvailabilityIssue {
	code: ScheduleAvailabilityIssueCode;
	field:
		| 'date'
		| 'startTime'
		| 'endTime'
		| 'instructorId'
		| 'vehicleId'
		| 'studentId'
		| 'courseId';
}
