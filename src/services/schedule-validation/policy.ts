import { EventType, Prisma, PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';

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
