# Refaktor kontekstu schoolId

2026-10-18 — implementacja zakończona.

- [x] Audyt i usunięcie zbędnego schoolId z adresów i parametrów żądań.
- [x] Backend ustala szkołę zasobu, sprawdza uprawnienia i obsługuje opcjonalny stary parametr.
- [x] Płatności zachowują szkołę kursu po transferze; operacje i odczyt wyniku działają w transakcji.
- [x] Konta archiwalne zachowują dotychczasowe zasady dostępu.
- [x] BFF/FE pomijają redundantny parametr, stare URL zachowują inne query i hash.
- [x] Szkolne listy, filtry historii, tworzenie, transfery i logi zachowują jawny zakres.
- [x] Zaktualizowano OpenAPI, odpowiednie typy FE i dokumentację.
- [x] Weryfikacja wydzielonego kodu: BE check (514 testów, format, lint, typy, build), integracje PostgreSQL (41 testów), FE/BFF (924 testy, lint, typy).
- [ ] Weryfikacja i obserwacja środowiska produkcyjnego.

## Zakres publikacji

Wydzielono wyłącznie refaktor schoolId. Polskie adresy stron, kategorie pojazdów i dodatkowa telemetria pozostają osobnymi zmianami. Funkcję zobowiązań konta opublikowano wcześniej osobnym commitem; ten refaktor zawiera wyłącznie dostosowania schoolId w jej istniejących plikach. Uzupełniono rejestr endpointów o zmieniany endpoint zobowiązań, wymagany przez test zgodności OpenAPI.

Typy FE odświeżono w zakresie zmienionego parametru i brakujących operacji objętych refaktorem. Nie dołączono odświeżenia innych, wcześniej nieaktualnych deklaracji API.

## Kolejność wdrożenia

Najpierw backend, następnie BFF/FE. Refaktor nie dodaje migracji; wymagane jest istniejące ograniczenie pojedynczego przypisania OSK. Przy wycofaniu najpierw przywrócić FE/BFF, pozostawiając kompatybilny backend. Backend można cofnąć po wyłączeniu klientów korzystających z nowego kontraktu.

Testy integracyjne używają lokalnego PostgreSQL i testowego adaptera Auth. Push nie potwierdza wdrożenia ani monitoringu produkcji.
