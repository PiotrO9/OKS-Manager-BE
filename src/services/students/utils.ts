import { PaymentStatus } from '@prisma/client';
import type {
	StudentPaymentStatus,
	StudentProcessStatusStepDto,
} from './types';

export function hasText(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

export function buildStudentProcessStatusSteps(input: {
	hasBasicData: boolean;
	hasPkkNumber: boolean;
	hasCourseAssignment: boolean;
	hasScheduledLesson: boolean;
}): StudentProcessStatusStepDto[] {
	return [
		{
			name: 'Dane kursanta',
			completed: input.hasBasicData,
			description:
				'UzupeĹ‚nij podstawowe dane kursanta i upewnij siÄ™, ĹĽe konto jest aktywne.',
		},
		{
			name: 'Numer PKK',
			completed: input.hasPkkNumber,
			description: 'Dodaj numer PKK kursanta.',
		},
		{
			name: 'Przypisanie do kursu',
			completed: input.hasCourseAssignment,
			description: 'Przypisz kursanta do kursu w tej OSK.',
		},
		{
			name: 'Zaplanowanie jazd',
			completed: input.hasScheduledLesson,
			description: 'Zaplanuj co najmniej jednÄ… nieanulowanÄ… jazdÄ™.',
		},
	];
}

export function toIsoOrNull(value: Date | null | undefined): string | null {
	return value instanceof Date ? value.toISOString() : null;
}

export function mapPaymentStatus(status: PaymentStatus): StudentPaymentStatus {
	return status === PaymentStatus.PAID ? 'PAID' : 'UNPAID';
}

export function paymentSortTime(payment: {
	paidAt: Date | null;
	dueDate: Date | null;
	createdAt: Date;
}): number {
	return (payment.paidAt ?? payment.dueDate ?? payment.createdAt).getTime();
}
