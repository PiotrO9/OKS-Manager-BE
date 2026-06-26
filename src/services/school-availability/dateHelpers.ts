export function yyyymmddToDate(dateStr: string): Date {
	const [y, mo, d] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
}

export function formatYYYYMMDD(date: Date): string {
	const y = date.getUTCFullYear();
	const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${mo}-${d}`;
}

export function utcTodayYyyymmdd(): string {
	return formatYYYYMMDD(new Date());
}

export function timeToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
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

export function slotOverlapsLesson(
	slotDate: string,
	slotStartMin: number,
	slotEndMin: number,
	lessonDate: string,
	lessonStartMin: number,
	lessonEndMin: number,
): boolean {
	if (slotDate !== lessonDate) {
		return false;
	}
	return !(slotEndMin <= lessonStartMin || slotStartMin >= lessonEndMin);
}
