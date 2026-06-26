export const lessonInclude = {
	instructorProfile: {
		select: {
			id: true,
			user: { select: { firstName: true, lastName: true } },
		},
	},
	studentProfile: {
		select: {
			id: true,
			user: { select: { firstName: true, lastName: true } },
		},
	},
	vehicle: {
		select: { id: true, name: true, registrationNumber: true },
	},
	lessonRating: {
		select: { id: true, rating: true, comment: true, createdAt: true },
	},
};

export const eventInclude = {
	instructor: {
		select: {
			id: true,
			user: { select: { firstName: true, lastName: true } },
		},
	},
	vehicle: {
		select: { id: true, name: true, registrationNumber: true },
	},
	participants: {
		select: {
			student: {
				select: {
					id: true,
					user: { select: { firstName: true, lastName: true } },
				},
			},
		},
	},
} as const;
