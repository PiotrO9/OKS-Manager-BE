# Audyt danych czasu terminarza

Data audytu: 2026-09-25.

## Zakres i metoda

Audyt jest wykonywany skryptem `npm run audit:schedule-times`. Skrypt korzysta z tego samego klienta Prisma i adaptera PostgreSQL co aplikacja, wykonuje wyłącznie odczyty i pokazuje reprezentatywne rekordy po przeliczeniu na polski czas `Europe/Warsaw`.

Bezpośredni odczyt kolumn `TIMESTAMP(3)` przez surowy sterownik `pg` nie jest podstawą decyzji migracyjnej, ponieważ sposób parsowania wartości bez strefy zależy od konfiguracji klienta. Źródłem prawdy dla zachowania aplikacji jest jej adapter Prisma.

## Wynik

- lekcje: 548 rekordów,
- wydarzenia instruktorów: 36 rekordów,
- bloki czasu instruktorów: 52 rekordy,
- seedowane wydarzenia zaplanowane na 17:00-19:00 są odczytywane przez aplikację jako 17:00-19:00 czasu polskiego,
- seedowane bloki zaplanowane na 12:00-13:00 są odczytywane przez aplikację jako 12:00-13:00 czasu polskiego.

Nie znaleziono przesłanki do migracji istniejących danych czasu. Audyt nie zmodyfikował bazy.

## Dalsze zabezpieczenia

Helpery seeda wyznaczają od tej pory polską datę i godzinę jawnie, niezależnie od strefy procesu uruchamiającego seed. Testy obejmują czas letni, zimowy i granicę dnia UTC/polskiego.

Testy integracyjne korzystają z osobnej lokalnej bazy PostgreSQL utworzonej przez runner migracji. Nie uruchamiają migracji ani zapisów na bazie środowiska deweloperskiego używanej do audytu.
