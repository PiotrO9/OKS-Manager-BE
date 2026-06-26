import type { Vehicle } from '@prisma/client';
import type { VehicleResponse } from './types';

export function vehicleToResponse(
	vehicle: Vehicle,
	isDefault?: boolean,
): VehicleResponse {
	const { availabilityStatus, ...rest } = vehicle;

	return {
		...rest,
		status: availabilityStatus,
		...(isDefault === undefined ? {} : { isDefault }),
	};
}
