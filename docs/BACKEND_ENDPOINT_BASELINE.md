# Backend Endpoint Baseline

Data baseline'u: 2026-09-07
Zrodlo prawdy: `src/server.ts`, `src/routes/*.routes.ts`

Ten dokument zamraza aktualny kontrakt routingu HTTP przed refactorem. Sciezki,
metody HTTP, parametry path oraz wymagania auth/role nie powinny zmieniac sie
bez osobnej decyzji.

Domyslny format odpowiedzi:

- sukces: `{ success: true, data?: ... }`
- blad: `{ success: false, error: string }`

Globalne bledy:

- `AppError` zwraca swoj `statusCode`.
- `ZodError` zwraca `400`.
- nieobsluzony blad zwraca `500`.

## Public/Technical

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/health` | `src/server.ts` inline handler | public | 200 |
| GET | `/test` | `src/server.ts` inline handler | public | 200 |
| GET | `/openapi.json` | `setupSwagger` | public | 200 |
| USE | `/api-docs` | `swaggerUi.serve/setup` | public | n/a |

## Auth

Mounted in `src/server.ts` at `/auth`, routes in `src/routes/auth.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | `register` | bearer, any authenticated user | 200/201 depending role flow |
| POST | `/auth/login` | `login` | public | 200 |
| POST | `/auth/refresh` | `refresh` | refresh cookie | 200 |
| POST | `/auth/logout` | `logout` | bearer | 200 |
| GET | `/auth/me` | `getMe` | bearer | 200 |
| PATCH | `/auth/profile` | `patchProfile` | bearer | 200 |
| POST | `/auth/profile/avatar` | `uploadProfileAvatar` | bearer, multipart `file`, max 5 MB | 200 |

Known route-level errors:

- `/auth/profile/avatar`: upload above 5 MB returns `400`.

## Driving Schools

Mounted at `/driving-schools`, routes in
`src/routes/driving-schools.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/driving-schools` | `getDrivingSchools` | bearer | 200 |
| GET | `/driving-schools/default` | `getDefaultDrivingSchool` | bearer | 200 |
| GET | `/driving-schools/:id/availability/slots` | `getSchoolAvailabilitySlots` | bearer | 200 |
| POST | `/driving-schools` | `createDrivingSchool` | bearer, min role `MANAGER` | 201 |
| PATCH | `/driving-schools/:id/set-default` | `setDefaultDrivingSchool` | bearer, min role `MANAGER` | 200 |
| PATCH | `/driving-schools/:id/default-vehicle` | `setDefaultVehicleForDrivingSchool` | bearer, min role `MANAGER` | 200 |
| PATCH | `/driving-schools/:id` | `updateDrivingSchool` | bearer, min role `MANAGER` | 200 |
| DELETE | `/driving-schools/:id` | `deleteDrivingSchool` | bearer, min role `MANAGER` | 200 |

## Instructors

Mounted at `/instructors`, routes in `src/routes/instructors.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/instructors` | `listInstructorsBySchool` | bearer, min role `MANAGER` | 200 |
| GET | `/instructors/:id` | `getInstructorById` | bearer, min role `MANAGER` | 200 |
| GET | `/instructors/:id/ratings` | `listInstructorLessonRatingsHandler` | bearer, min role `MANAGER` | 200 |
| POST | `/instructors/:id/schools` | `assignInstructorToSchool` | bearer, min role `MANAGER` | 201 |
| PATCH | `/instructors/:id` | `patchInstructor` | bearer, min role `MANAGER` | 200 |
| DELETE | `/instructors/:id` | `deleteInstructor` | bearer, min role `MANAGER` | 204 |

## Instructor Availability

Mounted through `/instructors/:instructorId/availability`, routes in
`src/routes/instructor-availability.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/instructors/:instructorId/availability/weekly` | `getWeekly` | bearer, min role `MANAGER` | 200 |
| PUT | `/instructors/:instructorId/availability/weekly/:dayOfWeek` | `putWeeklyDay` | bearer, min role `MANAGER` | 200 |
| DELETE | `/instructors/:instructorId/availability/weekly/:dayOfWeek` | `deleteWeeklyDayHandler` | bearer, min role `MANAGER` | 204 |
| GET | `/instructors/:instructorId/availability/exceptions` | `getExceptions` | bearer, min role `MANAGER` | 200 |
| PUT | `/instructors/:instructorId/availability/exceptions/:date` | `putExceptionHandler` | bearer, min role `MANAGER` | 200 |
| DELETE | `/instructors/:instructorId/availability/exceptions/:date` | `deleteExceptionHandler` | bearer, min role `MANAGER` | 204 |
| GET | `/instructors/:instructorId/availability/compute` | `computeAvailabilityHandler` | bearer, min role `MANAGER` | 200 |
| GET | `/instructors/:instructorId/availability/slots` | `getSlotsHandler` | bearer, min role `MANAGER` | 200 |

## Students

Mounted at `/students`, routes in `src/routes/students.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/students` | `listStudents` | bearer, min role `INSTRUCTOR` | 200 |
| GET | `/students/:userId/events` | `getStudentEvents` | bearer, min role `STUDENT` | 200 |
| GET | `/students/:userId/process-status` | `getStudentProcessStatus` | bearer, min role `STUDENT` | 200 |
| GET | `/students/:userId/payments` | `getStudentPayments` | bearer, min role `STUDENT` | 200 |
| POST | `/students/:userId/payments` | `createStudentPayment` | bearer, min role `MANAGER` | 201 |
| PATCH | `/students/:userId/payments/:paymentId` | `updateStudentPayment` | bearer, min role `MANAGER` | 200 |
| PATCH | `/students/:userId/payments/:paymentId/mark-paid` | `markStudentPaymentPaid` | bearer, min role `MANAGER` | 200 |
| PATCH | `/students/:userId/payments/:paymentId/mark-unpaid` | `markStudentPaymentUnpaid` | bearer, min role `MANAGER` | 200 |
| GET | `/students/:userId` | `getStudentDetail` | bearer, min role `STUDENT` | 200 |
| PATCH | `/students/:userId` | `patchStudent` | bearer, min role `INSTRUCTOR` | 200 |
| PATCH | `/students/:userId/driving-school` | `patchStudentDrivingSchool` | bearer, min role `MANAGER` | 200 |
| PATCH | `/students/:userId/pkk` | `patchStudentPkk` | bearer, min role `INSTRUCTOR` | 200 |
| POST | `/students/:userId/courses` | `assignStudentToCourse` | bearer, min role `INSTRUCTOR` | 200 |
| PATCH | `/students/:userId/courses/:courseId/status` | `patchCourseParticipantStatus` | bearer, min role `INSTRUCTOR` | 200 |

## Vehicles

Mounted at `/vehicles`, routes in `src/routes/vehicles.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/vehicles` | `listVehiclesBySchool` | bearer, min role `MANAGER` | 200 |
| GET | `/vehicles/:id` | `getVehicleById` | bearer, min role `MANAGER` | 200 |
| POST | `/vehicles` | `upsertVehicle` | bearer, min role `MANAGER` | 200/201 from service result |
| POST | `/vehicles/:id/photo` | `uploadVehiclePhoto` | bearer, min role `MANAGER`, multipart `file`, max 5 MB | 200 |
| PATCH | `/vehicles/:id/status` | `updateVehicleStatus` | bearer, min role `MANAGER` | 200 |
| PATCH | `/vehicles/:id` | `updateVehicle` | bearer, min role `MANAGER` | 200 |
| DELETE | `/vehicles/:id` | `deleteVehicle` | bearer, min role `MANAGER` | 200 |

Known route-level errors:

- `/vehicles/:id/photo`: upload above 5 MB returns `400`.

## Courses

Mounted at `/courses`, routes in `src/routes/courses.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/courses` | `listCourses` | bearer, min role `MANAGER` | 200 |
| GET | `/courses/:id` | `getCourseById` | bearer, min role `MANAGER` | 200 |
| PATCH | `/courses/:id` | `patchCourse` | bearer, min role `MANAGER` | 200 |
| POST | `/courses` | `createCourse` | bearer, min role `MANAGER` | 200 |

## Course Types

Mounted at `/course-types`, routes in `src/routes/course-types.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/course-types` | `getCourseTypes` | bearer, min role `MANAGER` | 200 |

## Events

Mounted at `/events`, routes in `src/routes/events.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/events` | `getEventsHandler` | bearer, min role `INSTRUCTOR` | 200 |
| PATCH | `/events/bulk-status` | `patchEventsBulkStatusHandler` | bearer, min role `INSTRUCTOR` | 200 |
| POST | `/events` | `postEventHandler` | bearer, min role `MANAGER` | 201 |
| GET | `/events/:id/eligible-students` | `getEventEligibleStudentsHandler` | bearer, min role `MANAGER` | 200 |
| GET | `/events/:id` | `getEventHandler` | bearer, min role `MANAGER` | 200 |
| PATCH | `/events/:id` | `patchEventHandler` | bearer, min role `MANAGER` | 200 |
| DELETE | `/events/:id` | `deleteEventHandler` | bearer, min role `MANAGER` | 204 |
| GET | `/events/:id/students` | `getEventStudentsHandler` | bearer, min role `MANAGER` | 200 |
| PUT | `/events/:id/students` | `putEventStudentsHandler` | bearer, min role `MANAGER` | 200 |
| DELETE | `/events/:id/students/:studentUserId` | `deleteEventStudentsHandler` | bearer, min role `MANAGER` | 200 |
| POST | `/events/:id/students` | `postEventStudentsHandler` | bearer, min role `MANAGER` | 200 |

## Lessons

Mounted at `/lessons`, routes in `src/routes/lessons.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| POST | `/lessons` | `postLessonHandler` | bearer, min role `MANAGER` | 201 |
| POST | `/lessons/me` | `postOwnLessonHandler` | bearer, exact role `STUDENT` | 201 |
| PATCH | `/lessons/:lessonId/cancel` | `cancelOwnLessonHandler` | bearer, exact role `STUDENT` | 200 |
| POST | `/lessons/:lessonId/rating` | `postLessonRatingHandler` | bearer, exact role `STUDENT` | 201 |
| GET | `/lessons/:lessonId/rating` | `getLessonRatingHandler` | bearer, exact role `STUDENT` | 200 |
| GET | `/lessons/:id` | `getLessonHandler` | bearer, min role `MANAGER` | 200 |
| PATCH | `/lessons/:id` | `patchLessonHandler` | bearer, min role `MANAGER` | 200 |

## Ratings

Mounted at `/ratings`, routes in `src/routes/lesson-ratings.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/ratings` | `listLessonRatingsHandler` | bearer, min role `MANAGER` | 200 |
| GET | `/ratings/me` | `listOwnLessonRatingsHandler` | bearer, exact role `INSTRUCTOR` | 200 |

## Manager

Mounted at `/manager`, routes in `src/routes/manager-attention.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/manager/attention-items` | `listAttentionItems` | bearer, min role `MANAGER` | 200 |

## Me

Mounted at `/me`, routes in `src/routes/me.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/me/courses` | `listMyCourses` | bearer | 200 |
| GET | `/me/payments` | `listMyPayments` | bearer | 200 |

## Schedule

Mounted at `/schedule`, routes in `src/routes/schedule.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| GET | `/schedule/me` | `getMeHandler` | bearer | 200 |
| GET | `/schedule` | `getScheduleHandler` | bearer, min role `MANAGER` | 200 |

## Dev

Mounted at `/dev`, routes in `src/routes/dev.routes.ts`.

| Method | Path | Handler | Auth | Success status |
| --- | --- | --- | --- | --- |
| POST | `/dev/reset-and-seed` | inline route handler | bearer, exact role `ADMIN`, `ALLOW_DB_RESET=true` | 200 |

Known route-level errors:

- when `ALLOW_DB_RESET !== 'true'`, returns `403`.

## OpenAPI Alignment Notes

These routes are mounted in code and should be checked against OpenAPI before
future API documentation work:

- `GET /health` is mounted in `server.ts`; `health.paths.ts` currently registers
  `GET /test`.
- Student payment write routes are present in `students.routes.ts`; verify
  whether all of them are registered in `src/swagger/paths/students.paths.ts`.
- `PATCH /events/bulk-status` is present in `events.routes.ts`; verify OpenAPI
  registration.
- `/openapi.json` and `/api-docs` are mounted by Swagger setup and are technical
  routes, not normal domain API endpoints.

