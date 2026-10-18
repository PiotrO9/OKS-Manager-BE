import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const db = {
		$queryRaw: vi.fn(),
		$transaction: vi.fn(),
		securityEvent: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
		securityEventSchool: { findUnique: vi.fn() },
		securityDetectionState: { update: vi.fn() },
	};
	return { db };
});
vi.mock('../../lib/prisma', () => ({ getPrisma: () => mocks.db }));

import { processSecurityDetectionQueue } from '../../services/security-events/detection';

const schoolId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const sourceId = '44444444-4444-4444-8444-444444444444';
const occurredAt = new Date('2026-10-18T12:00:00Z');
const state = {
	rule: 'ACCOUNT',
	scope_key: `school:${schoolId}:all`,
	subject_key: `user:${userId}`,
	key_version: 'user',
	queued_generation: 5,
	done_generation: 4,
	last_processed_at: null,
	last_processed_event_id: null,
	next_eligible_at: null,
};

describe('durable failed-login detector', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.db.$transaction.mockImplementation(
			async (callback: (tx: typeof mocks.db) => Promise<unknown>) =>
				callback(mocks.db),
		);
		mocks.db.$queryRaw.mockResolvedValue([state]);
		mocks.db.securityEvent.findMany.mockResolvedValue([
			{ id: sourceId, occurredAt },
		]);
		mocks.db.securityEvent.count.mockResolvedValue(5);
		mocks.db.securityEventSchool.findUnique.mockResolvedValue({
			targetUserId: userId,
			targetDisplayName: 'Jan Kowalski',
		});
		mocks.db.securityEvent.create.mockResolvedValue({});
		mocks.db.securityDetectionState.update.mockResolvedValue({});
	});

	it('creates one alarm for the threshold in the same transaction as queue progress', async () => {
		expect(await processSecurityDetectionQueue(1)).toBe(1);
		const alarm = mocks.db.securityEvent.create.mock.calls[0][0].data;
		expect(alarm.type).toBe('REPEATED_LOGIN_FAILURES');
		expect(alarm.metadata).toEqual({ attemptCount: 5, windowMinutes: 10 });
		expect(alarm.schools.create.schoolId).toBe(schoolId);
		expect(mocks.db.securityDetectionState.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					doneGeneration: 5,
					lastProcessedEventId: sourceId,
				}),
			}),
		);
	});

	it('does not emit another alarm during the cooldown', async () => {
		mocks.db.$queryRaw.mockResolvedValue([
			{ ...state, next_eligible_at: new Date('2026-10-18T12:05:00Z') },
		]);
		expect(await processSecurityDetectionQueue(1)).toBe(1);
		expect(mocks.db.securityEvent.create).not.toHaveBeenCalled();
	});
});
