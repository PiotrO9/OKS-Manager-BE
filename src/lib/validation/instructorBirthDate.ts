import { parseDate } from '@internationalized/date';
import { AppError } from '../http/AppError';
import { polishTodayYyyymmdd } from '../polishScheduleTime';

export function parseInstructorBirthDate(
	raw: unknown,
	options: { required?: boolean; today?: string } = {},
): Date | null {
	const required =
		options.required ??
		process.env.INSTRUCTOR_BIRTH_DATE_REQUIRED?.trim().toLowerCase() !==
			'false';
	if (raw === undefined || raw === null || raw === '') {
		if (required) {
			throw AppError.badRequest(
				'birthDate is required when role is INSTRUCTOR',
			);
		}
		return null;
	}
	if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		throw AppError.badRequest('Invalid birthDate');
	}
	try {
		if (parseDate(raw).toString() !== raw) {
			throw AppError.badRequest('Invalid birthDate');
		}
	} catch {
		throw AppError.badRequest('Invalid birthDate');
	}
	if (raw > (options.today ?? polishTodayYyyymmdd())) {
		throw AppError.badRequest('birthDate must not be in the future');
	}
	return new Date(`${raw}T00:00:00.000Z`);
}
