import { LessonStatus } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';

export function assertLessonIsEditable(
	status: LessonStatus,
	endTime: Date,
	now = new Date(),
): void {
	if (status !== LessonStatus.SCHEDULED) {
		throw AppError.badRequest('Only scheduled lessons can be edited');
	}

	if (endTime.getTime() <= now.getTime()) {
		throw AppError.badRequest('Finished lessons cannot be edited');
	}
}
