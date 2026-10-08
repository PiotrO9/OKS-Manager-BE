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
	rawValue: unknown,
	fieldLabel: string,
): { ok: true; value: Date | null } | { ok: false; message: string } {
	if (rawValue === undefined || rawValue === null) {
		return { ok: true, value: null };
	}
	if (typeof rawValue === 'string' && rawValue.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof rawValue !== 'string') {
		return {
			ok: false,
			message: `${fieldLabel} must be a string, null, or omitted`,
		};
	}
	const parsedTimestamp = Date.parse(rawValue.trim());
	if (Number.isNaN(parsedTimestamp)) {
		return { ok: false, message: `${fieldLabel} must be a valid ISO date` };
	}
	return { ok: true, value: new Date(parsedTimestamp) };
}

function parseOptionalNullableInt(
	rawValue: unknown,
	fieldLabel: string,
): { ok: true; value: number | null } | { ok: false; message: string } {
	if (rawValue === undefined || rawValue === null) {
		return { ok: true, value: null };
	}
	if (typeof rawValue === 'number' && Number.isInteger(rawValue)) {
		if (rawValue < 0) {
			return { ok: false, message: `${fieldLabel} must be >= 0` };
		}
		return { ok: true, value: rawValue };
	}
	if (typeof rawValue === 'string' && rawValue.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof rawValue === 'string') {
		const parsedInteger = Number.parseInt(rawValue.trim(), 10);
		if (!Number.isFinite(parsedInteger)) {
			return { ok: false, message: `${fieldLabel} must be an integer` };
		}
		if (parsedInteger < 0) {
			return { ok: false, message: `${fieldLabel} must be >= 0` };
		}
		return { ok: true, value: parsedInteger };
	}
	return {
		ok: false,
		message: `${fieldLabel} must be an integer, null, or omitted`,
	};
}

function parseHttpUrlOrNull(
	rawValue: unknown,
	fieldLabel: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
	if (rawValue === undefined || rawValue === null) {
		return { ok: true, value: null };
	}
	if (typeof rawValue === 'string' && rawValue.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof rawValue !== 'string') {
		return { ok: false, error: `${fieldLabel} must be a string or null` };
	}
	const trimmedUrl = rawValue.trim();
	try {
		const parsedUrl = new URL(trimmedUrl);
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			return {
				ok: false,
				error: `${fieldLabel} must be an http(s) URL`,
			};
		}
		return { ok: true, value: trimmedUrl };
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
		const rawValue = body[key];
		if (rawValue === null) {
			data[key] = null;
			continue;
		}
		if (typeof rawValue !== 'string') {
			return { ok: false, error: `${key} must be a string or null` };
		}
		const trimmedValue = rawValue.trim();
		data[key] = trimmedValue === '' ? null : trimmedValue;
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
		const rawValue = mode === 'create' && !(key in body) ? null : body[key];
		const parsed = parseOptionalNullableInt(rawValue, key);
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

	const registrationNumberRaw = body.registrationNumber;
	if (
		typeof registrationNumberRaw !== 'string' ||
		registrationNumberRaw.trim() === ''
	) {
		return { ok: false, error: 'registrationNumber is required' };
	}
	const registrationNumber = registrationNumberRaw.trim();

	const inspectionDate = parseOptionalDate(
		body.inspectionDate,
		'inspectionDate',
	);
	if (!inspectionDate.ok) {
		return { ok: false, error: inspectionDate.message };
	}
	const insuranceDate = parseOptionalDate(
		body.insuranceDate,
		'insuranceDate',
	);
	if (!insuranceDate.ok) {
		return { ok: false, error: insuranceDate.message };
	}

	const optionalFields = parseOptionalVehicleFields(body, mode);
	if (!optionalFields.ok) {
		return { ok: false, error: optionalFields.error };
	}

	return {
		ok: true,
		name,
		registrationNumber,
		inspectionDate: inspectionDate.value,
		insuranceDate: insuranceDate.value,
		optional: optionalFields.data,
	};
}
