import type { Prisma, PrismaClient, Role } from '@prisma/client';

export type AvailabilityDbClient = PrismaClient | Prisma.TransactionClient;

export type Actor = { id: string; role: Role };

export type WeeklyEntryDto = {
	id: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
};

export type ExceptionEntryDto = {
	id: string;
	date: string;
	isDayOff: boolean;
	startTime: string | null;
	endTime: string | null;
};

export type AvailabilityWindow = { start: string; end: string };

export type ComputedAvailability =
	| { available: false; reason: 'leave' | 'day_off' | 'no_schedule' }
	| { available: true; windows: AvailabilityWindow[] };

export type SlotDto = {
	date: string;
	startTime: string;
	endTime: string;
};
