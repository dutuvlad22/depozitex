# Joburi programate pe VPS

## Status AWB din Courier Manager (la fiecare 30 de minute)

Timer-ul apeleaza `POST /api/internal/cm-status-sync` pe `127.0.0.1:3000` (nu trece
prin internet sau firewall). Ruta verifica statusul tuturor AWB-urilor care nu sunt
inca finale (livrat, returnat, anulat) si il salveaza in `shipments`.

### Instalare (o singura data)

1. In `/root/projects/depozitex-shared/.env.local` trebuie sa existe:
   - `SUPABASE_SERVICE_ROLE_KEY` — cheia service role a Supabase de productie
     (`SERVICE_ROLE_KEY` din `/root/projects/supabase/.env`)
   - `CRON_SECRET` — un secret aleator (`openssl rand -hex 32`)

   Dupa adaugare: `systemctl restart depozitex`.

2. Copiaza si porneste timer-ul:

   ```bash
   cp /root/projects/depozitex/ops/depozitex-cm-status.{service,timer} /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now depozitex-cm-status.timer
   ```

### Verificare

```bash
systemctl start depozitex-cm-status.service   # ruleaza acum, o data
journalctl -u depozitex-cm-status -n 20       # rezultatul: {"ok":true,"checked":...}
systemctl list-timers depozitex-cm-status.timer
```

Frecventa se schimba din `OnCalendar` in `.timer` (ex. `hourly`), urmat de
`systemctl daemon-reload`.
