import type {
	StudentPaymentItemDto,
	StudentPaymentsDto,
	StudentPaymentsSummaryDto,
} from './types';

export const emptyPaymentsSummary: StudentPaymentsSummaryDto = {
	paidAmount: '0.00',
	unpaidAmount: '0.00',
	overdueAmount: '0.00',
	overdueCount: 0,
	nextDueDate: null,
	currency: 'PLN',
};

function todayUtcStart(): Date {
	const now = new Date();
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
}

function formatAmount(value: number): string {
	return value.toFixed(2);
}

export function buildPaymentsDto(
	payments: StudentPaymentItemDto[],
): StudentPaymentsDto {
	const today = todayUtcStart();
	let paidAmount = 0;
	let unpaidAmount = 0;
	let overdueAmount = 0;
	let overdueCount = 0;
	let nextDueDate: string | null = null;
	let nextDueTime = Number.POSITIVE_INFINITY;
	const currency = payments[0]?.currency ?? 'PLN';

	for (const payment of payments) {
		const amount = Number(payment.amount);

		if (!Number.isFinite(amount)) {
			continue;
		}

		if (payment.status === 'PAID') {
			paidAmount += amount;
			continue;
		}

		unpaidAmount += amount;

		if (!payment.dueDate) {
			continue;
		}

		const dueDate = new Date(payment.dueDate);

		if (Number.isNaN(dueDate.getTime())) {
			continue;
		}

		if (dueDate < today) {
			overdueAmount += amount;
			overdueCount += 1;
		} else if (dueDate.getTime() < nextDueTime) {
			nextDueTime = dueDate.getTime();
			nextDueDate = payment.dueDate;
		}
	}

	return {
		payments,
		summary: {
			paidAmount: formatAmount(paidAmount),
			unpaidAmount: formatAmount(unpaidAmount),
			overdueAmount: formatAmount(overdueAmount),
			overdueCount,
			nextDueDate,
			currency,
		},
	};
}

export function parseDateOnly(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}

	return new Date(`${value}T00:00:00.000Z`);
}
