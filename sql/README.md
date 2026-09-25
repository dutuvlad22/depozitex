# Schema bazei de date

Fisierele numerotate se aplica **in ordine** (01 → 09) pe o baza Supabase noua.
Toate sunt idempotente: pot fi rulate din nou fara sa piarda date.

Pe VPS (Supabase self-hosted):

```bash
for f in sql/0*.sql; do
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" || break
done
```

`reset.sql` sterge TOATE tabelele si datele. Nu face parte din instalare.
