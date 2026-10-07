import { AppError } from './AppError';

export type ScheduleDomainReason =
	| 'COURSE_LIMIT_EXCEEDED'
	| 'DATE_NOT_BOOKABLE'
	| 'INSTRUCTOR_BUSY'
	| 'NO_VEHICLE_AVAILABLE'
	| 'OUTSIDE_INSTRUCTOR_HOURS'
	| 'PARTICIPANT_BUSY'
	| 'SCHOOL_CLOSED'
	| 'STUDENT_BUSY'
	| 'VEHICLE_BUSY'
	| 'VEHICLE_UNAVAILABLE';

/** Internal reason for schedule checks; HTTP still uses AppError's status and message. */
export class ScheduleDomainError extends AppError {
	constructor(
		readonly reason: ScheduleDomainReason,
		statusCode: number,
		message: string,
	) {
		super(statusCode, message);
		this.name = 'ScheduleDomainError';
	}

	static conflictFor(
		reason: ScheduleDomainReason,
		message: string,
	): ScheduleDomainError {
		return new ScheduleDomainError(reason, 409, message);
	}

	static badRequestFor(
		reason: ScheduleDomainReason,
		message: string,
	): ScheduleDomainError {
		return new ScheduleDomainError(reason, 400, message);
	}

	static notFoundFor(
		reason: ScheduleDomainReason,
		message: string,
	): ScheduleDomainError {
		return new ScheduleDomainError(reason, 404, message);
	}
}
