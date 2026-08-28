# DepoziteX

WMS (Warehouse Management System) pentru fulfillment — Next.js (App Router, TypeScript) conectat la [Supabase](https://supabase.com).

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) — auth & date
- **lucide-react** — iconografie

## Structura

```
src/
  app/
    layout.tsx        # root layout: fonturi + AppShell
    page.tsx           # /            -> Panou
    receptie/page.tsx  # /receptie
    stoc/page.tsx       # /stoc
    comenzi/page.tsx    # /comenzi
    expediere/page.tsx  # /expediere
    retururi/page.tsx   # /retururi
    globals.css         # design tokens (navy + amber) si layout
  components/
    app-shell.tsx       # sidebar + topbar
    empty-state.tsx      # placeholder pentru paginile in lucru
  lib/
    nav.ts               # config navigatie sidebar
    supabase/
      client.ts          # client Supabase (Client Components)
      server.ts           # client Supabase (Server Components / Actions)
      middleware.ts        # refresh sesiune auth
middleware.ts             # foloseste lib/supabase/middleware.ts
```

Paginile din `src/app/*` sunt deocamdata goale (doar un placeholder) — layout-ul cu sidebar (Panou, Receptie, Stoc, Comenzi, Expediere, Retururi) e gata de folosit.

## Setup local

1. Instaleaza dependintele:

   ```bash
   npm install
   ```

2. Copiaza `.env.local.example` in `.env.local` (deja facut in acest repo local) si completeaza cheile din Supabase:

   ```bash
   cp .env.local.example .env.local
   ```

   Variabile necesare (Supabase Dashboard → Project Settings → API):

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (optional, doar server-side, pentru operatii care ocolesc RLS)

3. Porneste serverul de development:

   ```bash
   npm run dev
   ```

   Aplicatia ruleaza pe [http://localhost:3000](http://localhost:3000).

## Schema bazei de date

In folderul parinte al acestui proiect exista deja `depozitex-schema.sql` si `depozitex-onboarding.sql` — ruleaza-le in Supabase SQL Editor (Dashboard → SQL Editor) pentru a crea tabelele necesare (clienti, produse, comenzi, receptii, retururi etc).

## Deploy pe Vercel

Vezi instructiunile complete in mesajul de chat / sau:

1. `git init` (daca nu exista deja) + primul commit.
2. Creeaza un repo pe GitHub si fa push.
3. Pe [vercel.com](https://vercel.com) → **Add New Project** → importa repo-ul.
4. Framework Preset: **Next.js** (detectat automat).
5. Adauga variabilele de mediu (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, optional `SUPABASE_SERVICE_ROLE_KEY`) in **Project Settings → Environment Variables**.
6. **Deploy**.

## Scripturi

- `npm run dev` — development (Turbopack)
- `npm run build` — build de productie
- `npm start` — porneste build-ul de productie local
- `npm run lint` — ESLint
