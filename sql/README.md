# Schema bazei de date

Fisierele numerotate se aplica **in ordine** (01, 02, ...) pe o baza Supabase noua.
Toate sunt idempotente: pot fi rulate din nou fara sa piarda date.

Pe VPS exista doua baze separate:

| | Productie (site-ul real) | Test (dezvoltare locala) |
|---|---|---|
| API | https://vlad.apps.couriermanager.com | https://vlad.apps.couriermanager.com:8444 |
| Studio | https://vlad.apps.couriermanager.com:8443 | https://vlad.apps.couriermanager.com:8444 |
| Container | `supabase-db` | `supabase-test-db` |

`npm run dev` pe Mac foloseste baza de **test** (vezi `.env.local`).

## Modificari de schema

Un fisier nou (ex. `12_ceva.sql`, idempotent) se aplica intai pe test, se verifica
aplicatia local, apoi se aplica pe productie:

```bash
./sql/apply.sh test sql/12_ceva.sql
./sql/apply.sh prod sql/12_ceva.sql   # cere confirmare si face backup inainte
```

## Baza de test de la zero

```bash
./sql/apply.sh test sql/reset.sql sql/[0-9]*.sql
```

`reset.sql` sterge TOATE tabelele si datele (nu si conturile). Scriptul refuza sa-l ruleze pe productie.
