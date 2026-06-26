import {
	assertActorCanManageAvailability,
	resolveActiveInstructorProfile,
} from './access';
import {
	dateToYYYYMMDD,
	minutesToHHmm,
	splitWindowIntoSlots,
	yyyymmddToDate,
} from './time';
import type { Actor, SlotDto } from './types';
import { computeDayWindows } from './windows';

const SLOT_DURATION_MINUTES = 60;

export async function generateSlotsInternal(
	instructorId: string,
	dateFrom: string,
	dateTo: string,
	slotDurationMinutes: number,
): Promise<SlotDto[]> {
	const from = yyyymmddToDate(dateFrom);
	const to = yyyymmddToDate(dateTo);
	const slots: SlotDto[] = [];

	const current = new Date(from);
	while (current.getTime() <= to.getTime()) {
		const freeWindows = await computeDayWindows(instructorId, current);
		const dateStr = dateToYYYYMMDD(current);

		if (freeWindows !== null) {
			for (const window of freeWindows) {
				const daySlots = splitWindowIntoSlots(
					window,
					slotDurationMinutes,
				);
				for (const slot of daySlots) {
					slots.push({
						date: dateStr,
						startTime: minutesToHHmm(slot.start),
						endTime: minutesToHHmm(slot.end),
					});
				}
			}
		}

		current.setUTCDate(current.getUTCDate() + 1);
	}

	return slots;
}

export async function generateSlots(
	actor: Actor,
	instructorId: string,
	dateFrom: string,
	dateTo: string,
): Promise<SlotDto[]> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);
	return generateSlotsInternal(
		instructorId,
		dateFrom,
		dateTo,
		SLOT_DURATION_MINUTES,
	);
}
