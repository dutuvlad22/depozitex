import { BookOpen } from "lucide-react";

// Documentatia API-ului pentru programatorii clientilor (se poate copia/printa din pagina).

const ORDER_EXAMPLE = `{
  "numar_comanda": "1001",
  "canal": "Shopify",
  "destinatar": {
    "nume": "Ion Popescu",
    "telefon": "0722123456",
    "strada": "Str. Lunga",
    "numar": "12",
    "oras": "Brasov",
    "judet": "Brasov",
    "cod_postal": "500035",
    "tara": "RO"
  },
  "ramburs": 149.90,
  "greutate_kg": 1.2,
  "colete": 1,
  "produse": [
    { "sku": "TRICOU-M-NEGRU", "cantitate": 2 },
    { "sku": "SAPCA-01", "cantitate": 1 }
  ]
}`;

export default function ApiDocs({ baseUrl }: { baseUrl: string }) {
  const api = `${baseUrl}/api/v1`;
  return (
    <section className="panel api-docs">
      <div className="panel-head">
        <BookOpen size={16} /> Documentatie pentru programatorul clientului
      </div>

      <p>
        Comenzile trimise prin API apar automat in <strong>Comenzi</strong>, cu statusul <em>Nou</em> si
        eticheta <em>API</em>. Toate cererile folosesc JSON si cheia API a clientului in antetul{" "}
        <code>Authorization</code>. O cheie are acces doar la comenzile si produsele clientului ei.
      </p>
      <pre className="code-block">{`Authorization: Bearer dx_...`}</pre>

      <h3>1. Trimite o comanda</h3>
      <pre className="code-block">{`POST ${api}/comenzi
Content-Type: application/json`}</pre>
      <pre className="code-block">{ORDER_EXAMPLE}</pre>
      <ul>
        <li>
          Obligatorii: <code>numar_comanda</code>, <code>destinatar</code> (<code>nume</code>,{" "}
          <code>telefon</code>, <code>strada</code>, <code>oras</code>, <code>judet</code>) si{" "}
          <code>produse</code> (1–200 linii, <code>sku</code> + <code>cantitate</code> intreaga).
        </li>
        <li>
          Optionale: <code>canal</code>, <code>destinatar.numar</code>, <code>cod_postal</code>,{" "}
          <code>tara</code> (implicit RO), <code>ramburs</code> (lei), <code>greutate_kg</code>,{" "}
          <code>colete</code> (implicit 1).
        </li>
        <li>
          SKU-urile trebuie sa existe deja in depozit pentru clientul respectiv.
        </li>
        <li>
          <strong>Retrimiterea e sigura:</strong> daca aceeasi <code>numar_comanda</code> e trimisa din nou
          (ex. dupa o eroare de retea), nu se creeaza o dublura; raspunsul are <code>&quot;created&quot;: false</code>.
        </li>
      </ul>
      <pre className="code-block">{`201 Created
{ "ok": true, "created": true, "id": "…", "numar_comanda": "1001", "status": "nou", "creata_la": "…" }`}</pre>

      <h3>2. Statusul unei comenzi</h3>
      <pre className="code-block">{`GET ${api}/comenzi/1001`}</pre>
      <pre className="code-block">{`200 OK
{ "ok": true, "numar_comanda": "1001", "status": "expediat",
  "awb": "123456789", "curier": "courier_manager", "status_awb": "…",
  "expediata_la": "…", "creata_la": "…",
  "produse": [{ "sku": "TRICOU-M-NEGRU", "cantitate": 2 }] }`}</pre>
      <p>
        Statusuri: <code>nou</code> → <code>de_pregatit</code> (in picking) → <code>la_ambalare</code> →{" "}
        <code>ambalat</code> → <code>expediat</code>. AWB-ul apare dupa expediere.
      </p>

      <h3>3. Stocul clientului</h3>
      <pre className="code-block">{`GET ${api}/stoc`}</pre>
      <pre className="code-block">{`200 OK
{ "ok": true, "produse": [{ "sku": "TRICOU-M-NEGRU", "nume": "Tricou M negru", "stoc": 37 }] }`}</pre>

      <h3>Erori</h3>
      <p>
        Raspuns: <code>{`{ "ok": false, "code": "…", "error": "mesaj" }`}</code>
      </p>
      <ul>
        <li>
          <code>401 unauthorized</code> — cheie lipsa, gresita sau revocata
        </li>
        <li>
          <code>400 invalid</code> — date lipsa sau in format gresit (mesajul spune ce anume)
        </li>
        <li>
          <code>422 unknown_sku</code> — un SKU din comanda nu exista pentru acest client
        </li>
        <li>
          <code>404 not_found</code> — comanda nu exista
        </li>
        <li>
          <code>413 too_large</code> — cererea depaseste 256 KB
        </li>
      </ul>

      <h3>Exemplu (terminal)</h3>
      <pre className="code-block">{`curl -X POST ${api}/comenzi \\
  -H "Authorization: Bearer dx_..." \\
  -H "Content-Type: application/json" \\
  -d @comanda.json`}</pre>
    </section>
  );
}
