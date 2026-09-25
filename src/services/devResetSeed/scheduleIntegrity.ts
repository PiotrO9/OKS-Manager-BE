import { EventStatus, LessonStatus, type Prisma } from '@prisma/client';

type IntegrityInput = {
	lessons: readonly Prisma.LessonCreateManyInput[];
	events: readonly Prisma.InstructorEventCreateManyInput[];
	eventParticipants: readonly Prisma.EventParticipantCreateManyInput[];
	blocks: readonly Prisma.InstructorTimeBlockCreateManyInput[];
};

type ResourceWindow = {
	entry: string;
	start: number;
	end: number;
};

function createWindow(
	entry: string,
	startTime: Date | string,
	endTime: Date | string,
): ResourceWindow {
	const start = new Date(startTime).getTime();
	const end = new Date(endTime).getTime();

	if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
		throw new Error(`Invalid seed schedule window for ${entry}`);
	}

	return { entry, start, end };
}

function addWindow(
	resources: Map<string, ResourceWindow[]>,
	key: string,
	window: ResourceWindow,
): void {
	const entries = resources.get(key) ?? [];
	entries.push(window);
	resources.set(key, entries);
}

export function assertSeedScheduleIntegrity(input: IntegrityInput): void {
	const resources = new Map<string, ResourceWindow[]>();
	const participantsByEvent = new Map<string, string[]>();

	for (const participant of input.eventParticipants) {
		const students = participantsByEvent.get(participant.eventId) ?? [];
		students.push(participant.studentId);
		participantsByEvent.set(participant.eventId, students);
	}

	for (const lesson of input.lessons) {
		if (lesson.status === LessonStatus.CANCELLED) continue;
		const window = createWindow(
			`lesson:${lesson.id ?? 'missing-id'}`,
			lesson.startTime,
			lesson.endTime,
		);
		addWindow(resources, `instructor:${lesson.instructorId}`, window);
		addWindow(resources, `student:${lesson.studentId}`, window);
		if (lesson.vehicleId) {
			addWindow(resources, `vehicle:${lesson.vehicleId}`, window);
		}
	}

	for (const event of input.events) {
		if (
			event.isActive === false ||
			event.status === EventStatus.CANCELLED
		) {
			continue;
		}
		if (!event.id) {
			throw new Error('Seed schedule event is missing an id');
		}
		const window = createWindow(
			`event:${event.id}`,
			event.startTime,
			event.endTime,
		);
		addWindow(resources, `instructor:${event.instructorId}`, window);
		if (event.vehicleId) {
			addWindow(resources, `vehicle:${event.vehicleId}`, window);
		}
		for (const studentId of participantsByEvent.get(event.id) ?? []) {
			addWindow(resources, `student:${studentId}`, window);
		}
	}

	for (const block of input.blocks) {
		addWindow(
			resources,
			`instructor:${block.instructorId}`,
			createWindow(
				`block:${block.id ?? 'missing-id'}`,
				block.startTime,
				block.endTime,
			),
		);
	}

	for (const [resource, windows] of resources) {
		windows.sort((a, b) => a.start - b.start || a.end - b.end);
		for (let index = 1; index < windows.length; index += 1) {
			const previous = windows[index - 1]!;
			const current = windows[index]!;
			if (current.start < previous.end) {
				throw new Error(
					`Seed schedule conflict for ${resource}: ${previous.entry} overlaps ${current.entry}`,
				);
			}
		}
	}
}
