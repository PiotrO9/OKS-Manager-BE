import type { CourseParticipantStatus } from '@prisma/client';

export type AssignStudentDrivingSchoolResult = {
	userId: string;
	drivingSchool: {
		id: string;
		name: string;
		city: string | null;
		address: string | null;
	};
};

export type PatchStudentPkkResult = {
	userId: string;
	pkkNumber: string | null;
};

export type PatchStudentResult = {
	userId: string;
	notes: string | null;
};

export type StudentCourseDto = {
	id: string;
	name: string;
	category: string;
	status: CourseParticipantStatus;
};

export type PatchCourseParticipantStatusResult = {
	id: string;
	courseId: string;
	studentId: string;
	status: CourseParticipantStatus;
};

export type StudentDetailDto = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	pkkNumber: string | null;
	notes: string | null;
	courses: StudentCourseDto[];
};

export type StudentProcessStatusStepDto = {
	name: string;
	completed: boolean;
	description: string;
};

export type StudentProcessStatusDto = {
	steps: StudentProcessStatusStepDto[];
};

export type StudentPaymentStatus = 'PAID' | 'UNPAID';

export type StudentPaymentItemDto = {
	id: string;
	courseId: string;
	courseName: string;
	paymentPlanId: string;
	amount: string;
	currency: string;
	status: StudentPaymentStatus;
	date: string | null;
	dueDate: string | null;
	paidAt: string | null;
	method: string | null;
};

export type StudentPaymentsSummaryDto = {
	paidAmount: string;
	unpaidAmount: string;
	overdueAmount: string;
	overdueCount: number;
	nextDueDate: string | null;
	currency: string;
};

export type StudentPaymentsDto = {
	payments: StudentPaymentItemDto[];
	summary: StudentPaymentsSummaryDto;
};

export type CreateStudentPaymentInput = {
	schoolId: string;
	paymentPlanId: string;
	amount: string;
	dueDate?: string | null;
	method?: string | null;
};

export type UpdateStudentPaymentInput = {
	schoolId: string;
	dueDate?: string | null;
	method?: string | null;
};

export type MarkStudentPaymentPaidInput = {
	schoolId: string;
	paidAt?: string | null;
};

export type MarkStudentPaymentUnpaidInput = {
	schoolId: string;
};

export type StudentListItemDto = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	pkkNumber: string | null;
	isActive: boolean;
	createdAt: Date;
};

export type ListStudentsResult = {
	data: StudentListItemDto[];
	total: number;
	page: number;
	limit: number;
};
