import {
	Role,
	type CourseType,
	type InstructorProfile,
	type StudentProfile,
	type User,
	type Vehicle,
} from '@prisma/client';

export type SeedUserInput = {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	role: Role;
	phone?: string | null;
};

export type UserWithProfiles = User & {
	instructorProfile: InstructorProfile | null;
	studentProfile: StudentProfile | null;
};

export type SeedVehicle = Pick<Vehicle, 'id' | 'schoolId' | 'isActive'>;

export type SeedContext = {
	users: User[];
	managers: User[];
	instructors: Array<UserWithProfiles & { instructorProfile: InstructorProfile }>;
	students: Array<UserWithProfiles & { studentProfile: StudentProfile }>;
	courseTypes: CourseType[];
	vehicles: SeedVehicle[];
};
