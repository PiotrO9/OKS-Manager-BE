---
description: 'Przegląd systemu OSK — dołączaj ten plik do kontekstu'
alwaysApply: true
---

# Driving School Management System (OSK) — Full Domain Overview

## 🧠 1. SYSTEM OVERVIEW

System manages:

- driving schools (OSK)
- users (students, instructors, managers, admins)
- courses (driving categories)
- lessons (theory + practice)
- instructor availability
- payments
- ratings

---

## 👤 2. USERS & ROLES

### Assumptions:

- each user has exactly one role:
    - student
    - instructor
    - manager
    - admin

### Relations:

- users → studentProfiles (1:1)
- users → instructorProfiles (1:1)
- users → userSettings (1:1)
- users → userProfiles (1:1)

---

## 🏫 3. DRIVING SCHOOLS (OSK)

### Assumptions:

- one manager can own multiple schools
- each school has one owner

### Relation:

- drivingSchools.ownerId → users.id

---

## 👨‍🏫 4. SCHOOL ASSIGNMENTS

### Assumptions:

- instructor can work in multiple schools
- student can belong to multiple schools

### Relations:

- instructorProfiles ↔ drivingSchools (M:N)
- studentProfiles ↔ drivingSchools (M:N)

---

## 🚗 5. VEHICLES

### Assumptions:

- vehicle belongs to one school
- used only in practice lessons

### Relation:

- vehicles.schoolId → drivingSchools.id

---

## 📚 6. COURSES

### Assumptions:

- student can have multiple courses
- each course:
    - belongs to one school
    - has one course type (category)

### Relations:

- courses.studentId → studentProfiles.id
- courses.schoolId → drivingSchools.id
- courses.courseTypeId → courseTypes.id

---

## 🪪 7. COURSE TYPES

### Assumptions:

- dictionary of driving categories (e.g. B, C, A)

### Relation:

- courseTypes (1) → (N) courses

---

## 📅 8. LESSONS (CORE ENTITY)

### Assumptions:

- lesson belongs to a course
- lesson types:
    - theory
    - practice

### Relations:

- lessons.courseId → courses.id
- lessons.studentId → studentProfiles.id
- lessons.instructorId → instructorProfiles.id
- lessons.vehicleId → vehicles.id (optional)

### Rules:

- practice → requires vehicle
- theory → no vehicle
- lesson defined by startTime + endTime

---

## ⏰ 9. INSTRUCTOR AVAILABILITY

Availability consists of 4 layers:

### 1. Default weekly schedule

- instructorWorkingHoursDefault
- one entry per (instructorId, dayOfWeek) — UNIQUE constraint enforced
- dayOfWeek: 0 (Sunday) – 6 (Saturday)
- startTime / endTime: stored as @db.Time, format HH:mm

### 2. Daily override (exceptions)

- instructorWorkingHours
- one entry per (instructorId, date) — UNIQUE constraint enforced
- isDayOff = true → day fully blocked
- isDayOff = false → startTime and endTime REQUIRED (validated in service layer)
- exception takes PRIORITY over weekly default

### 3. Manual blocks

- instructorTimeBlocks
- type: InstructorTimeBlockType enum (BREAK, MEETING, OTHER)
- stored as full DateTime (start_time, end_time)
- cuts out fragments from the base window within the day

### 4. Leaves (highest priority)

- instructorLeaves
- multi-day range (startDate, endDate)
- overrides everything else

---

### Availability Priority:

1. leaves (highest — blocks entire day range)
2. workingHours override → default (determines base window)
3. timeBlocks + lessons (subtract from base window)

---

### Timezone:

All times are stored and processed in **Europe/Warsaw** (UTC+1/UTC+2).
No explicit timezone column — assumed local Polish time throughout.

---

### Computed availability algorithm:

```
1. Check InstructorLeave for date            → unavailable (reason: leave)
2. Check InstructorWorkingHours for date
   a. isDayOff = true                        → unavailable (reason: day_off)
   b. isDayOff = false + hours               → baseWindow = exception hours
3. Fallback: InstructorWorkingHoursDefault for dayOfWeek(date)
   → no entry                               → unavailable (reason: no_schedule)
   → entry found                            → baseWindow = weekly hours
4. Subtract InstructorTimeBlock entries for date
5. Subtract Lesson entries for date (status != CANCELLED)
6. Return free windows: [{ start: HH:mm, end: HH:mm }]
```

---

### API endpoints (prefix: /instructors/:instructorId/availability):

- GET  /weekly
- PUT  /weekly/:dayOfWeek
- DELETE /weekly/:dayOfWeek
- GET  /exceptions?from=YYYY-MM-DD&to=YYYY-MM-DD
- PUT  /exceptions/:date
- DELETE /exceptions/:date
- GET  /compute?date=YYYY-MM-DD

Authorization: MANAGER (own instructors) | ADMIN (all)

---

## 📊 10. CALENDAR

### Assumption:

There is NO calendar table.

Calendar is computed dynamically:

availability - lessons - blocks - leaves

---

## 💰 11. PAYMENTS

### Structure:

courses → paymentPlans → payments

### Assumptions:

#### paymentPlans:

- defines payment strategy:
    - full
    - installments

#### payments:

- actual transactions

### Relations:

- paymentPlans.course_id → courses.id
- payments.paymentPlanId → paymentPlans.id

---

## ⭐ 12. RATINGS

### Assumptions:

- only for practice lessons
- only after lesson is completed
- one rating per lesson

### Relations:

- lessonRatings.lesson_id → lessons.id (UNIQUE)
- lessonRatings.student_id → studentProfiles.id
- lessonRatings.instructor_id → instructorProfiles.id

---

## ⚙️ 13. SCHOOL SETTINGS

### Configurable:

#### Slots:

- slot duration
- full-hour alignment

#### Lessons:

- min/max duration (practice & theory)

#### Booking:

- max booking days ahead

#### Working hours:

- global school limits

---

## 👤 14. USER SETTINGS

### userSettings:

- theme
- language

### userProfiles:

- avatar
- bio

---

## ❗ 15. CRITICAL BUSINESS RULES

### 🔴 1. No double booking

- instructor cannot have overlapping lessons
- vehicle cannot have overlapping lessons

---

### 🔴 2. School consistency

- instructor, vehicle, and course must belong to the same school

---

### 🔴 3. Lessons belong to courses

- no standalone lessons allowed

---

### 🔴 4. Rating rules

- only practice lessons
- only completed lessons
- only lesson owner can rate

---

### 🔴 5. Courses

- student can have multiple courses
- each course = one category

---

### 🔴 6. Availability is authoritative

- determines whether lesson can be created

---

### 🔴 7. Database ≠ business logic

Database:

- stores data

Backend:

- enforces rules
- validates logic
- prevents conflicts

---

## 🧠 SYSTEM MODEL SUMMARY

USER → PROFILE → COURSE → LESSON → PAYMENT → RATING
↓
AVAILABILITY
↓
CALENDAR

---

## 🚀 FINAL NOTE

This schema represents a **production-level MVP backend model**.

However, correctness depends on:

- booking logic
- transaction handling
- conflict prevention
- availability computation

The database alone does NOT guarantee system correctness.
