import {
	instantToPolishDateTime,
	polishTodayYyyymmdd,
} from '../../lib/polishScheduleTime';

export function formatYYYYMMDD(date: Date): string {
	return instantToPolishDateTime(date).date;
}

export function yyyymmddToDate(dateStr: string): Date {
	const [y, mo, d] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
}

export function addDaysYyyymmdd(dateStr: string, days: number): string {
	const d = yyyymmddToDate(dateStr);
	d.setUTCDate(d.getUTCDate() + days);
	return formatYYYYMMDD(d);
}

export function compareYyyymmdd(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

export function utcTodayYyyymmdd(): string {
	return polishTodayYyyymmdd();
}
