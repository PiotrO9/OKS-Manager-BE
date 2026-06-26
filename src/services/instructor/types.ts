import type { Role } from '@prisma/client';

export type Actor = { id: string; role: Role };

export type InstructorQualifiedCourseType = {
	id: string;
	code: string;
	name: string;
};

export type InstructorListItem = {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	qualifiedCourseTypes: InstructorQualifiedCourseType[];
};

export type InstructorDetail = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	licenseNumber: string;
	experienceYears: number | null;
	qualifications: string | null;
	qualifiedCourseTypes: InstructorQualifiedCourseType[];
	schoolIds: string[];
};

export type InstructorPatchResult = {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	experienceYears: number | null;
	qualifications: string | null;
	qualifiedCourseTypes: InstructorQualifiedCourseType[];
};

export type InstructorPatchInput = {
	firstName?: string;
	lastName?: string;
	experienceYears?: number;
	qualifications?: string;
	qualifiedCourseTypeIds?: string[];
};
