import {
	minutesToHHmm,
	type TimeWindow,
} from '../instructor-availability/time';

export const AVAILABILITY_OPTION_STEP_MINUTES = 15;

export interface ScheduleAvailabilityOption {
	startTime: string;
	endTimes: string[];
}

export function buildScheduleAvailabilityOptions(input: {
	windows: readonly TimeWindow[];
	minDurationMinutes: number;
	maxDurationMinutes: number;
	startStepMinutes: number;
	endStepMinutes?: number;
}): ScheduleAvailabilityOption[] {
	const endStepMinutes =
		input.endStepMinutes ?? AVAILABILITY_OPTION_STEP_MINUTES;
	const options: ScheduleAvailabilityOption[] = [];

	for (const window of input.windows) {
		let start =
			Math.ceil(window.start / input.startStepMinutes) *
			input.startStepMinutes;

		while (start + input.minDurationMinutes <= window.end) {
			const latestEnd = Math.min(
				start + input.maxDurationMinutes,
				window.end,
			);
			const endTimes: string[] = [];

			for (
				let end = start + input.minDurationMinutes;
				end <= latestEnd;
				end += endStepMinutes
			) {
				endTimes.push(minutesToHHmm(end));
			}

			if (endTimes.length > 0) {
				options.push({ startTime: minutesToHHmm(start), endTimes });
			}

			start += input.startStepMinutes;
		}
	}

	return options;
}
