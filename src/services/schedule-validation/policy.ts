import { EventType, Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getCoursePracticePackageBalance } from '../../lib/lesson-scheduling';
import { ScheduleDomainError } from '../../lib/http/ScheduleDomainError';

type DbClient = Prisma.TransactionClient | PrismaClient;

export interface ScheduleDurationPolicy {
	minDurationMinutes: number;
	maxDurationMinutes: number;
}

export interface ScheduleOptionsPolicy extends ScheduleDurationPolicy {
	startStepMinutes: number;
}

function durationPolicyFromSettings(
	settings: {
		practiceMinDurationMinutes: number;
		practiceMaxDurationMinutes: number;
		theoryMinDurationMinutes: number;
		theoryMaxDurationMinutes: number;
	} | null,
	kind: 'PRACTICE' | EventType,
): ScheduleDurationPolicy {
	if (kind === EventType.THEORY) {
		return {
			minDurationMinutes: settings?.theoryMinDurationMinutes ?? 45,
			maxDurationMinutes: settings?.theoryMaxDurationMinutes ?? 90,
		};
	}

	return {
		minDurationMinutes: settings?.practiceMinDurationMinutes ?? 60,
		maxDurationMinutes: settings?.practiceMaxDurationMinutes ?? 120,
	};
}

export async function resolveScheduleDurationPolicy(
	db: DbClient,
	schoolId: string,
	kind: 'PRACTICE' | EventType,
): Promise<ScheduleDurationPolicy> {
	const settings = await db.schoolSettings.findUnique({
		where: { schoolId },
		select: {
			practiceMinDurationMinutes: true,
			practiceMaxDurationMinutes: true,
			theoryMinDurationMinutes: true,
			theoryMaxDurationMinutes: true,
		},
	});

	return durationPolicyFromSettings(settings, kind);
}

export async function resolveScheduleOptionsPolicy(
	db: DbClient,
	schoolId: string,
	kind: 'PRACTICE' | EventType,
	defaultStepMinutes: number,
): Promise<ScheduleOptionsPolicy> {
	const settings = await db.schoolSettings.findUnique({
		where: { schoolId },
		select: {
			practiceMinDurationMinutes: true,
			practiceMaxDurationMinutes: true,
			theoryMinDurationMinutes: true,
			theoryMaxDurationMinutes: true,
			slotMustStartFullHour: true,
		},
	});

	return {
		...durationPolicyFromSettings(settings, kind),
		startStepMinutes: settings?.slotMustStartFullHour
			? 60
			: defaultStepMinutes,
	};
}

export async function assertScheduleDurationAllowed(
	db: DbClient,
	input: {
		schoolId: string;
		kind: 'PRACTICE' | EventType;
		start: Date;
		end: Date;
	},
): Promise<ScheduleDurationPolicy> {
	const durationMinutes =
		(input.end.getTime() - input.start.getTime()) / 60_000;
	if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
		throw AppError.badRequest('startTime must be before endTime');
	}

	const policy = await resolveScheduleDurationPolicy(
		db,
		input.schoolId,
		input.kind,
	);

	if (durationMinutes < policy.minDurationMinutes) {
		throw AppError.badRequest(
			`Duration must be at least ${policy.minDurationMinutes} minutes`,
		);
	}
	if (durationMinutes > policy.maxDurationMinutes) {
		throw AppError.badRequest(
			`Duration must not exceed ${policy.maxDurationMinutes} minutes`,
		);
	}

	return policy;
}

export async function assertStudentSelfBookingDurationAllowed(
	db: DbClient,
	input: {
		schoolId: string;
		courseId: string;
		studentProfileId: string;
		totalHours: number;
		start: Date;
		end: Date;
		bookingMode?: 'REMAINING_PACKAGE';
	},
): Promise<void> {
	if (input.bookingMode !== 'REMAINING_PACKAGE') {
		await assertScheduleDurationAllowed(db, { ...input, kind: 'PRACTICE' });
		return;
	}
	const policy = await resolveScheduleDurationPolicy(
		db,
		input.schoolId,
		'PRACTICE',
	);
	const settings = await db.schoolSettings.findUnique({
		where: { schoolId: input.schoolId },
		select: {
			allowShortFinalPracticeLesson: true,
			minFinalPracticeDurationMinutes: true,
		},
	});
	const durationMinutes =
		(input.end.getTime() - input.start.getTime()) / 60_000;
	const { remainingMinutes } = await getCoursePracticePackageBalance(
		db,
		input.courseId,
		input.studentProfileId,
		input.totalHours,
	);
	if (durationMinutes !== remainingMinutes) {
		throw ScheduleDomainError.conflictFor(
			'COURSE_LIMIT_EXCEEDED',
			`Pozostało ${remainingMinutes} minut jazd w pakiecie kursu.`,
			{ remainingMinutes },
		);
	}
	if (
		settings?.allowShortFinalPracticeLesson === false ||
		!Number.isInteger(durationMinutes) ||
		durationMinutes < (settings?.minFinalPracticeDurationMinutes ?? 30) ||
		durationMinutes >= policy.minDurationMinutes ||
		durationMinutes > policy.maxDurationMinutes
	) {
		throw AppError.badRequest(
			'Nie można zarezerwować krótkiej jazdy z pozostałego czasu pakietu.',
		);
	}
}
