import type { Vehicle } from '@prisma/client';
import type { VehicleResponse } from './types';

export function vehicleToResponse(
	vehicle: Vehicle,
	isDefault?: boolean,
): VehicleResponse {
	const { availabilityStatus, unavailableUntil, ...rest } = vehicle;

	return {
		...rest,
		status: availabilityStatus,
		unavailableUntil: formatDateYmd(unavailableUntil),
		...(isDefault === undefined ? {} : { isDefault }),
	};
}

function formatDateYmd(value: Date | null): string | null {
	if (value === null) return null;

	const year = value.getUTCFullYear();
	const month = String(value.getUTCMonth() + 1).padStart(2, '0');
	const day = String(value.getUTCDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}
