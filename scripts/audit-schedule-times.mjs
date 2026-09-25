import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
	console.error('DATABASE_URL is required for the schedule time audit.');
	process.exit(1);
}

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString }),
});
const formatter = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Europe/Warsaw',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
});

function mapSample(row) {
	return {
		id: row.id,
		startInstant: row.startTime.toISOString(),
		startWarsaw: formatter.format(row.startTime),
		endInstant: row.endTime.toISOString(),
		endWarsaw: formatter.format(row.endTime),
		createdAt: row.createdAt.toISOString(),
	};
}

async function auditModel(label, model) {
	const [count, rows] = await Promise.all([
		model.count(),
		model.findMany({
			orderBy: { startTime: 'desc' },
			take: 8,
			select: {
				id: true,
				startTime: true,
				endTime: true,
				createdAt: true,
			},
		}),
	]);

	return { label, count, samples: rows.map(mapSample) };
}

try {
	const database = new URL(connectionString);
	const result = {
		database: {
			host: database.hostname,
			name: database.pathname.replace(/^\//, ''),
		},
		timeZone: 'Europe/Warsaw',
		models: await Promise.all([
			auditModel('lessons', prisma.lesson),
			auditModel('instructorEvents', prisma.instructorEvent),
			auditModel('instructorTimeBlocks', prisma.instructorTimeBlock),
		]),
	};

	console.log(JSON.stringify(result, null, 2));
} finally {
	await prisma.$disconnect();
}
