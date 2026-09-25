import { EventType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
	scheduleAvailabilityCheckBodySchema,
	scheduleAvailabilityOptionsBodySchema,
} from '../../schemas/schedule.schemas';

const instructorId = '11111111-1111-4111-8111-111111111111';
const vehicleId = '22222222-2222-4222-8222-222222222222';
const courseId = '33333333-3333-4333-8333-333333333333';

function theoryCandidate(overrides: Record<string, unknown> = {}) {
	return {
		intent: 'event_create',
		instructorId,
		eventType: EventType.THEORY,
		date: '2026-09-24',
		startTime: '10:00',
		endTime: '11:00',
		...overrides,
	};
}

describe('schedule availability schema hardening', () => {
	it.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-04-31'])(
		'rejects invalid calendar date %s',
		(date) => {
			expect(
				scheduleAvailabilityCheckBodySchema.safeParse(
					theoryCandidate({ date }),
				).success,
			).toBe(false);
		},
	);

	it.each([
		['10:00', '10:00'],
		['11:00', '10:00'],
	])('rejects a non-positive window %s-%s', (startTime, endTime) => {
		expect(
			scheduleAvailabilityCheckBodySchema.safeParse(
				theoryCandidate({ startTime, endTime }),
			).success,
		).toBe(false);
	});

	it('rejects a vehicle for theory and a course for a drive event', () => {
		expect(
			scheduleAvailabilityCheckBodySchema.safeParse(
				theoryCandidate({ vehicleId }),
			).success,
		).toBe(false);
		expect(
			scheduleAvailabilityCheckBodySchema.safeParse(
				theoryCandidate({
					eventType: EventType.DRIVE,
					vehicleId,
					courseId,
				}),
			).success,
		).toBe(false);
	});

	it('accepts a drive preflight without a vehicle to check the instructor window early', () => {
		expect(
			scheduleAvailabilityCheckBodySchema.safeParse(
				theoryCandidate({ eventType: EventType.DRIVE }),
			).success,
		).toBe(true);
	});

	it('rejects unknown fields instead of silently forwarding them', () => {
		expect(
			scheduleAvailabilityCheckBodySchema.safeParse(
				theoryCandidate({ schoolId: crypto.randomUUID() }),
			).success,
		).toBe(false);
	});

	it('accepts a valid leap day and adjacent minute window', () => {
		expect(
			scheduleAvailabilityCheckBodySchema.safeParse(
				theoryCandidate({
					date: '2028-02-29',
					startTime: '23:58',
					endTime: '23:59',
				}),
			).success,
		).toBe(true);
	});
});

describe('schedule availability options schema', () => {
	it('accepts drive options without a vehicle to list vehicle availability', () => {
		expect(
			scheduleAvailabilityOptionsBodySchema.safeParse({
				intent: 'event_create',
				instructorId,
				eventType: EventType.DRIVE,
				date: '2026-09-25',
			}).success,
		).toBe(true);
	});

	it('accepts theory options without a vehicle', () => {
		expect(
			scheduleAvailabilityOptionsBodySchema.safeParse({
				intent: 'event_create',
				instructorId,
				eventType: EventType.THEORY,
				date: '2026-09-25',
			}).success,
		).toBe(true);
	});

	it.each([
		{ intent: 'event_edit', recordField: 'eventId' },
		{ intent: 'lesson_edit', recordField: 'lessonId' },
	])('accepts $intent options with an optional vehicle', (variant) => {
		expect(
			scheduleAvailabilityOptionsBodySchema.safeParse({
				intent: variant.intent,
				[variant.recordField]: '22222222-2222-4222-8222-222222222222',
				instructorId,
				date: '2026-09-25',
				vehicleId: '33333333-3333-4333-8333-333333333333',
			}).success,
		).toBe(true);
	});

	it('rejects an edit options request with the wrong record id field', () => {
		expect(
			scheduleAvailabilityOptionsBodySchema.safeParse({
				intent: 'lesson_edit',
				eventId: '22222222-2222-4222-8222-222222222222',
				instructorId,
				date: '2026-09-25',
			}).success,
		).toBe(false);
	});
});
