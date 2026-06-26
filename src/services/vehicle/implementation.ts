import {
	deleteVehicleForUser,
	updateVehicleForUser,
	updateVehicleStatusForUser,
	upsertVehicleForUser,
} from './commands';
import { uploadVehiclePhotoForUser } from './photoUpload';
import {
	getVehicleByIdForUser,
	listVehiclesBySchoolForUser,
} from './queries';

export type { UploadedPhotoFile } from './photoUpload';

export const vehicleService = {
	listVehiclesBySchoolForUser,
	getVehicleByIdForUser,
	uploadVehiclePhotoForUser,
	upsertVehicleForUser,
	updateVehicleForUser,
	updateVehicleStatusForUser,
	deleteVehicleForUser,
};
