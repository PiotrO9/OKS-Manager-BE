import type {
	Vehicle,
	VehicleAvailabilityStatus,
} from '@prisma/client';

export type VehicleForAccessRow = {
	id: string;
	schoolId: string;
	name: string;
	registrationNumber: string;
	isActive: boolean;
	inspectionDate: Date | null;
	insuranceDate: Date | null;
	brand: string | null;
	model: string | null;
	photoUrl: string | null;
	modelYear: number | null;
	mileageKm: number | null;
	note: string | null;
	availabilityStatus: VehicleAvailabilityStatus;
	unavailableUntil: Date | null;
	createdAt: Date;
	school: {
		ownerId: string;
		deletedAt: Date | null;
		defaultVehicleId: string | null;
	};
};

export type VehicleResponse = Omit<
	Vehicle,
	'availabilityStatus' | 'unavailableUntil'
> & {
	status: VehicleAvailabilityStatus;
	unavailableUntil: string | null;
	isDefault?: boolean;
};
