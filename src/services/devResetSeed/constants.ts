import { Role } from '@prisma/client';

export const DEMO_PASSWORD = 'Demo1234!';

export const DEMO_ACCOUNTS = [
	{
		email: 'manager001@post.pl',
		password: 'manager001',
		firstName: 'Marta',
		lastName: 'Kierownik',
		role: Role.MANAGER,
	},
	{
		email: 'instructor001@post.pl',
		password: 'instructor001',
		firstName: 'Jan',
		lastName: 'Instruktor',
		role: Role.INSTRUCTOR,
	},
	{
		email: 'student001@post.pl',
		password: 'student001',
		firstName: 'Kamil',
		lastName: 'Kursant',
		role: Role.STUDENT,
	},
] as const;

export const ADMIN_ACCOUNT = {
	email: 'admin001@post.pl',
	password: 'admin001',
	firstName: 'Adam',
	lastName: 'Administrator',
	role: Role.ADMIN,
} as const;

export const AUTH_ACCOUNTS = [ADMIN_ACCOUNT, ...DEMO_ACCOUNTS] as const;

export const FIRST_NAMES = [
	'Anna',
	'Piotr',
	'Katarzyna',
	'Tomasz',
	'Julia',
	'Michal',
	'Aleksandra',
	'Pawel',
	'Natalia',
	'Krzysztof',
	'Monika',
	'Bartosz',
	'Karolina',
	'Lukasz',
	'Weronika',
	'Mateusz',
	'Magdalena',
	'Damian',
	'Ewa',
	'Marcin',
] as const;

export const LAST_NAMES = [
	'Nowak',
	'Kowalski',
	'Wisniewska',
	'Wojcik',
	'Kowalczyk',
	'Kaminska',
	'Lewandowski',
	'Zielinska',
	'Szymanski',
	'Wozniak',
	'Dabrowska',
	'Kozlowski',
	'Mazur',
	'Jankowska',
	'Krawczyk',
	'Piotrowska',
	'Grabowski',
	'Pawlowska',
	'Nowicka',
	'Adamczyk',
] as const;

export const CITIES = ['Warszawa', 'Krakow', 'Lodz', 'Poznan'] as const;

export const COURSE_TYPES = [
	{ code: 'A', name: 'Kategoria A' },
	{ code: 'B', name: 'Kategoria B' },
	{ code: 'C', name: 'Kategoria C' },
	{ code: 'CE', name: 'Kategoria C+E' },
] as const;
