import type { Prisma } from '@prisma/client';

function toDayStart(date: Date): Date {
	return new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate(),
		),
	);
}

function addDays(date: Date, days: number): Date {
	const out = new Date(date);
	out.setUTCDate(out.getUTCDate() + days);
	return out;
}

function dateOnlyToUtcStart(date: string): Date {
	return new Date(`${date}T00:00:00.000Z`);
}

export function resolveCreatedAtFilter(query: {
	period: 'latest' | 'yesterday' | 'last7days' | 'all';
	dateFrom?: string;
	dateTo?: string;
}): Prisma.DateTimeFilter | undefined {
	if (query.dateFrom && query.dateTo) {
		return {
			gte: dateOnlyToUtcStart(query.dateFrom),
			lt: addDays(dateOnlyToUtcStart(query.dateTo), 1),
		};
	}

	const today = toDayStart(new Date());

	if (query.period === 'yesterday') {
		const start = addDays(today, -1);
		return { gte: start, lt: today };
	}

	if (query.period === 'last7days') {
		return { gte: addDays(today, -7), lt: addDays(today, 1) };
	}

	return undefined;
}
