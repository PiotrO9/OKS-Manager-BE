# Polskie adresy — linki resetu hasła

- [x] Część backendowa punktu 11: „Polskie adresy podstron”.

Wspólna funkcja `src/lib/passwordResetRedirect.ts` buduje adres `/ustaw-haslo`
na podstawie pierwszego adresu z `FRONTEND_URL`. Korzystają z niej odzyskiwanie
hasła przez użytkownika i reset zlecany przez menedżera. Endpointy API pozostają
bez zmian. Migracja nie wymaga zmian schematu bazy.

Przed wydaniem backendu należy wdrożyć frontend obsługujący `/reset-password`
oraz `/ustaw-haslo`, dodać nowy callback do Redirect URLs w Supabase i zachować
dotychczasowy. Trzeba też sprawdzić szablon wiadomości oraz oba procesy resetu
na izolowanym środowisku. Wycofanie frontendu powinno używać wersji zgodności,
która obsługuje obie ścieżki.

Testy tego zakresu: `password-reset-redirect.test.ts`,
`password-recovery.test.ts` oraz `manager-accounts.test.ts`.
