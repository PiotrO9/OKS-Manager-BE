import { LessonStatus, LessonType } from '@prisma/client';

export type LessonDto = {
	id: string;
	courseId: string;
	studentId: string;
	instructorId: string;
	vehicleId: string | null;
	lessonType: LessonType;
	startTime: string;
	endTime: string;
	status: string;
	createdAt: string;
};

/** Profil + dane konta użytkownika — odpowiedź GET /lessons/:id (instruktor / kursant). */
export type LessonPersonDetailDto = {
	/** `InstructorProfile.id` lub `StudentProfile.id`. */
	id: string;
	/** `User.id` — nawigacja do `/students/:userId` itd. */
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
};

/** Pełny rekord pojazdu — zagnieżdżony w `lesson` przy GET /lessons/:id. */
export type LessonVehicleDetailDto = {
	id: string;
	schoolId: string;
	name: string;
	registrationNumber: string;
	inspectionDate: string | null;
	insuranceDate: string | null;
	brand: string | null;
	model: string | null;
	photoUrl: string | null;
	modelYear: number | null;
	mileageKm: number | null;
	note: string | null;
	isActive: boolean;
	createdAt: string;
};

/** GET /lessons/:id — bez `studentId` / `instructorId` / `vehicleId` (są w `student.id`, `instructor.id`, `vehicle`). */
export type LessonWithDetailsDto = Omit<
	LessonDto,
	'studentId' | 'instructorId' | 'vehicleId'
> & {
	instructor: LessonPersonDetailDto;
	student: LessonPersonDetailDto;
	vehicle: LessonVehicleDetailDto | null;
};

export function mapLessonRowToDto(row: {
	id: string;
	courseId: string;
	studentId: string;
	instructorId: string;
	vehicleId: string | null;
	lessonType: LessonType;
	startTime: Date;
	endTime: Date;
	status: LessonStatus;
	createdAt: Date;
}): LessonDto {
	return {
		id: row.id,
		courseId: row.courseId,
		studentId: row.studentId,
		instructorId: row.instructorId,
		vehicleId: row.vehicleId,
		lessonType: row.lessonType,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
		status: row.status,
		createdAt: row.createdAt.toISOString(),
	};
}

export function mapPersonToLessonDetailDto(profile: {
	id: string;
	userId: string;
	user: {
		firstName: string;
		lastName: string;
		email: string;
		phone: string | null;
	};
}): LessonPersonDetailDto {
	return {
		id: profile.id,
		userId: profile.userId,
		firstName: profile.user.firstName,
		lastName: profile.user.lastName,
		email: profile.user.email,
		phone: profile.user.phone,
	};
}

export function mapVehicleToLessonDetailDto(vehicle: {
	id: string;
	schoolId: string;
	name: string;
	registrationNumber: string;
	inspectionDate: Date | null;
	insuranceDate: Date | null;
	brand: string | null;
	model: string | null;
	photoUrl: string | null;
	modelYear: number | null;
	mileageKm: number | null;
	note: string | null;
	isActive: boolean;
	createdAt: Date;
}): LessonVehicleDetailDto {
	return {
		id: vehicle.id,
		schoolId: vehicle.schoolId,
		name: vehicle.name,
		registrationNumber: vehicle.registrationNumber,
		inspectionDate: vehicle.inspectionDate?.toISOString() ?? null,
		insuranceDate: vehicle.insuranceDate?.toISOString() ?? null,
		brand: vehicle.brand,
		model: vehicle.model,
		photoUrl: vehicle.photoUrl,
		modelYear: vehicle.modelYear,
		mileageKm: vehicle.mileageKm,
		note: vehicle.note,
		isActive: vehicle.isActive,
		createdAt: vehicle.createdAt.toISOString(),
	};
}
