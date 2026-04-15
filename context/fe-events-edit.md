---
description: "FE — formularz edycji wydarzenia teoretycznego (InstructorEvent THEORY): sekwencja wywołań API, edge case’y, walidacja lokalna freeWindows, obsługa błędów PATCH"
alwaysApply: false
---

# Edycja wydarzenia teoretycznego — przewodnik dla frontu

Kontekst: formularz edycji bloku teorii (`InstructorEvent` z `type: THEORY` i `courseId`), np. widok `/manager/events/:id/edit`. Celem jest **minimalna liczba zapytań** przy jednoczesnym odświeżaniu **dostępności instruktora** i **kolizji grafiku kursantów**.

Szczegóły kontraktów API: [events-schedule-api.md](./events-schedule-api.md). Sloty instruktora (inne źródło okien czasu): [instructors-api.md](./instructors-api.md) — **GET `/instructors/:instructorId/availability/slots`**.

---

## 1. Załadowanie formularza (otwarcie widoku)

Dwa równoległe żądania:

1. **`GET /events/:id?includeSlots=true`**  
   - Prefill: `instructor`, `startTime`, `endTime`, `capacity`, `courseId`, `students[]` (aktualni uczestnicy).  
   - **`freeWindows`**: wolne okna czasowe instruktora na **ten sam dzień UTC** co event (backend wyklucza bieżący event z zajętości, więc obecny slot jest w `freeWindows`).

2. **`GET /events/:id/eligible-students`** (bez query)  
   - Lista kursantów kursu z polami `isAssignedToEvent`, `hasScheduleConflict`, `canAssign`, `capacity`.

---

## 2. Edge case’y — co wywołać i kiedy

| Akcja użytkownika | Warunek | Działanie FE | Szacunek calli |
|-------------------|---------|--------------|----------------|
| Zmiana **godziny** (data bez zmian, ten sam instruktor) | — | **Walidacja lokalna:** czy `[newStart, newEnd]` mieści się **w całości** w jednym elemencie `freeWindows` (patrz sekcja 4). | 0 |
| Zmiana **godziny** | lista kursantów widoczna w formularzu | **Debounced** (~400 ms): **`GET /events/:id/eligible-students?startTime=...&endTime=...`** — odświeżenie `hasScheduleConflict` / `canAssign` dla proponowanego okna. | 1 na serię zmian |
| Zmiana **daty** (inny dzień) | — | **`GET /instructors/:instructorId/availability/slots?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`** (ten sam dzień w obu polach, jeśli potrzebujesz tylko jednego dnia) — nowe „sloty” / orientacja czasowa; **zaktualizuj lokalny stan `freeWindows`** (sloty mają `date`, `startTime`, `endTime` w `HH:mm` — złóż z tego okna ISO jeśli używasz tej samej logiki co przy `includeSlots`). Następnie debounced **eligible-students** z nowym `startTime`/`endTime`. | 1–2 |
| Zmiana **instruktora** | — | **`GET /instructors/:newInstructorId/availability/slots?dateFrom=&dateTo=`** dla dnia eventu — nowe dostępne okna; dostosuj wybrany slot do grafiku nowego instruktora. | 1 |
| Zmiana **capacity** | — | Tylko walidacja lokalna: `used <= newCapacity` (z ostatniego `eligible-students` lub z licznika uczestników). | 0 |
| **Zapis** | — | **`PATCH /events/:id`** z polami czasu / instruktora / capacity itd. Jeśli lista uczestników się zmieniła względem serwera — dodatkowo **`PUT /events/:id/students`** z pełną tablicą `studentIds` (`users.id`). | 1–2 |

**Uwaga:** `freeWindows` z **`GET /events/:id?includeSlots=true`** jest spójne z **`computeDayWindows`** (pełne wolne przedziały dnia). **`GET .../availability/slots`** zwraca sloty o **stałej długości** (np. 60 min) — to inny podział tego samego dnia; do szybkiego UI możesz używać jednego lub drugiego, by nie dublować logiki.

---

## 3. Sekwencja w „najgorszym” przypadku (szacunek)

1. Otwarcie: **GET** event + **GET** eligible-students → **2** wywołania.  
2. Zmiana daty: **GET** slots instruktora → **1**.  
3. Zmiana instruktora: **GET** slots nowego instruktora → **1**.  
4. Zmiana godziny: debounced **GET** eligible-students z query → **1**.  
5. Zapis: **PATCH** + ewentualnie **PUT** students → **1–2**.

Łącznie rzędu **6–7** wywołań przy pełnej ścieżce edycji; typowy przypadek (tylko zmiana godziny + zapis) to **2 + debounce + 1–2** zapisów.

---

## 4. Walidacja lokalna `freeWindows`

Backend zwraca `freeWindows` jako tablicę `{ startTime, endTime }` (ISO UTC). Nowe okno `[newStart, newEnd]` jest **dozwolone lokalnie**, jeśli mieści się **w całości** w którymkolwiek z tych przedziałów:

```typescript
function isSlotWithinFreeWindows(
	freeWindows: { startTime: string; endTime: string }[],
	newStart: Date,
	newEnd: Date,
): boolean {
	if (newStart.getTime() >= newEnd.getTime()) {
		return false;
	}
	return freeWindows.some((w) => {
		const ws = new Date(w.startTime).getTime();
		const we = new Date(w.endTime).getTime();
		return newStart.getTime() >= ws && newEnd.getTime() <= we;
	});
}
```

Obecny slot eventu jest częścią `freeWindows`, bo edytowany event jest wyłączany z listy zajętości przy obliczaniu okien.

---

## 5. Błąd **PATCH 409** — `Time change conflicts with existing participant schedules`

Backend zwraca ten komunikat, gdy po zmianie czasu/instruktora któryś z **obecnych** uczestników miałby kolizję z inną lekcją lub innym aktywnym eventem.

Zalecane zachowanie FE:

1. Nie traktować zapisu jako udanego; pokazać komunikat użytkownikowi.  
2. Wymusić ponowne pobranie listy: **`GET /events/:id/eligible-students?startTime=...&endTime=...`** z aktualnymi wartościami z formularza.  
3. Oznaczyć kursantów z `hasScheduleConflict === true` (w tym już przypisanych — wtedy użytkownik musi ich **wypisać** albo zmienić godzinę).  
4. Opcjonalnie zablokować przycisk zapisu do momentu usunięcia konfliktu.

---

## 6. Powiązane dokumentacja i pliki BE

| Temat | Dokument / plik |
|-------|------------------|
| GET/PATCH event, eligible-students, query | [events-schedule-api.md](./events-schedule-api.md) |
| GET slots instruktora | [instructors-api.md](./instructors-api.md) |
| Implementacja | `src/services/event.service.ts` (`getInstructorEventById`, `listTheoryEventEligibleStudents`, `updateInstructorEvent`), `src/controllers/event.controller.ts`, `src/schemas/event.schemas.ts` |
