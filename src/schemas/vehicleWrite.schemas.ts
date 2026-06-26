export type OptionalVehicleFields = {
	brand: string | null;
	model: string | null;
	photoUrl: string | null;
	modelYear: number | null;
	mileageKm: number | null;
	note: string | null;
};

export type OptionalVehiclePatch = Partial<OptionalVehicleFields>;

function parseOptionalDate(
	raw: unknown,
	fieldLabel: string,
): { ok: true; value: Date | null } | { ok: false; message: string } {
	if (raw === undefined || raw === null) {
		return { ok: true, value: null };
	}
	if (typeof raw === 'string' && raw.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof raw !== 'string') {
		return {
			ok: false,
			message: `${fieldLabel} must be a string, null, or omitted`,
		};
	}
	const t = Date.parse(raw.trim());
	if (Number.isNaN(t)) {
		return { ok: false, message: `${fieldLabel} must be a valid ISO date` };
	}
	return { ok: true, value: new Date(t) };
}

function parseOptionalNullableInt(
	raw: unknown,
	fieldLabel: string,
): { ok: true; value: number | null } | { ok: false; message: string } {
	if (raw === undefined || raw === null) {
		return { ok: true, value: null };
	}
	if (typeof raw === 'number' && Number.isInteger(raw)) {
		if (raw < 0) {
			return { ok: false, message: `${fieldLabel} must be >= 0` };
		}
		return { ok: true, value: raw };
	}
	if (typeof raw === 'string' && raw.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof raw === 'string') {
		const n = Number.parseInt(raw.trim(), 10);
		if (!Number.isFinite(n)) {
			return { ok: false, message: `${fieldLabel} must be an integer` };
		}
		if (n < 0) {
			return { ok: false, message: `${fieldLabel} must be >= 0` };
		}
		return { ok: true, value: n };
	}
	return {
		ok: false,
		message: `${fieldLabel} must be an integer, null, or omitted`,
	};
}

function parseHttpUrlOrNull(
	raw: unknown,
	fieldLabel: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
	if (raw === undefined || raw === null) {
		return { ok: true, value: null };
	}
	if (typeof raw === 'string' && raw.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof raw !== 'string') {
		return { ok: false, error: `${fieldLabel} must be a string or null` };
	}
	const t = raw.trim();
	try {
		const u = new URL(t);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') {
			return {
				ok: false,
				error: `${fieldLabel} must be an http(s) URL`,
			};
		}
		return { ok: true, value: t };
	} catch {
		return { ok: false, error: `${fieldLabel} must be a valid URL` };
	}
}

function parseOptionalVehicleFields(
	body: Record<string, unknown>,
	mode: 'create' | 'patch',
):
	| { ok: false; error: string }
	| { ok: true; data: OptionalVehicleFields | OptionalVehiclePatch } {
	const data: Record<string, unknown> = {};

	const stringKeys = ['brand', 'model', 'note'] as const;
	for (const key of stringKeys) {
		if (mode === 'patch' && !(key in body)) {
			continue;
		}
		if (mode === 'create' && !(key in body)) {
			data[key] = null;
			continue;
		}
		const raw = body[key];
		if (raw === null) {
			data[key] = null;
			continue;
		}
		if (typeof raw !== 'string') {
			return { ok: false, error: `${key} must be a string or null` };
		}
		const t = raw.trim();
		data[key] = t === '' ? null : t;
	}

	if (mode === 'patch' && !('photoUrl' in body)) {
		// skip
	} else {
		const rawPhoto =
			mode === 'create' && !('photoUrl' in body) ? null : body.photoUrl;
		const url = parseHttpUrlOrNull(rawPhoto, 'photoUrl');
		if (!url.ok) {
			return { ok: false, error: url.error };
		}
		data.photoUrl = url.value;
	}

	for (const key of ['modelYear', 'mileageKm'] as const) {
		if (mode === 'patch' && !(key in body)) {
			continue;
		}
		const raw = mode === 'create' && !(key in body) ? null : body[key];
		const parsed = parseOptionalNullableInt(raw, key);
		if (!parsed.ok) {
			return { ok: false, error: parsed.message };
		}
		data[key] = parsed.value;
	}

	return { ok: true, data: data as OptionalVehicleFields };
}

export function parseVehicleWriteBody(
	body: Record<string, unknown>,
	mode: 'create' | 'patch',
):
	| {
			ok: true;
			name: string;
			registrationNumber: string;
			inspectionDate: Date | null;
			insuranceDate: Date | null;
			optional: OptionalVehicleFields | OptionalVehiclePatch;
	  }
	| { ok: false; error: string } {
	const nameRaw = body.name;
	if (typeof nameRaw !== 'string' || nameRaw.trim() === '') {
		return { ok: false, error: 'name is required' };
	}
	const name = nameRaw.trim();

	const regRaw = body.registrationNumber;
	if (typeof regRaw !== 'string' || regRaw.trim() === '') {
		return { ok: false, error: 'registrationNumber is required' };
	}
	const registrationNumber = regRaw.trim();

	const insp = parseOptionalDate(body.inspectionDate, 'inspectionDate');
	if (!insp.ok) {
		return { ok: false, error: insp.message };
	}
	const ins = parseOptionalDate(body.insuranceDate, 'insuranceDate');
	if (!ins.ok) {
		return { ok: false, error: ins.message };
	}

	const opt = parseOptionalVehicleFields(body, mode);
	if (!opt.ok) {
		return { ok: false, error: opt.error };
	}

	return {
		ok: true,
		name,
		registrationNumber,
		inspectionDate: insp.value,
		insuranceDate: ins.value,
		optional: opt.data,
	};
}
