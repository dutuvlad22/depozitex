// Codurile de pe etichete: caruciorul (ex. CAR01) si cutiile lui.
// Cutiile au denumiri implicite CUT01..CUTnn, dar adminul le poate schimba
// (carts.box_labels, vezi sql/16_carucioare-denumiri.sql). Denumirile sunt
// unice doar in cadrul unui carucior; o eticheta poate fi si "CAR01-CUT03".

export const MAX_CART_CAPACITY = 20;
export const CODE_PATTERN = /^[A-Z0-9-]{1,20}$/;

export function defaultBoxLabel(boxNo: number): string {
  return `CUT${String(boxNo).padStart(2, "0")}`;
}

/** Denumirea cutiei de pe pozitia `boxNo` (1..capacity) a unui carucior. */
export function boxName(labels: string[] | null | undefined, boxNo: number): string {
  return labels?.[boxNo - 1] ?? defaultBoxLabel(boxNo);
}

/** Toate denumirile cutiilor unui carucior, in ordinea pozitiilor. */
export function allBoxNames(labels: string[] | null | undefined, capacity: number): string[] {
  return Array.from({ length: capacity }, (_, i) => boxName(labels, i + 1));
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Pozitia cutiei (1..n) pentru un cod scanat, sau null daca nu e o cutie a acestui carucior. */
export function findBox(code: string, cartCode: string, names: string[]): number | null {
  let c = normalizeCode(code);
  if (c.startsWith(`${cartCode}-`) && !names.includes(c)) c = c.slice(cartCode.length + 1);
  const i = names.indexOf(c);
  return i === -1 ? null : i + 1;
}

/** Urmatorul cod liber de forma CAR01, CAR02... */
export function nextCartCode(existing: string[]): string {
  const used = new Set(existing.map(normalizeCode));
  for (let i = 1; i < 1000; i++) {
    const code = `CAR${String(i).padStart(2, "0")}`;
    if (!used.has(code)) return code;
  }
  return "";
}

/** Verifica denumirile inainte de salvare; intoarce mesajul de eroare sau null. */
export function validateCartNames(code: string, names: string[]): string | null {
  if (!CODE_PATTERN.test(code)) {
    return "Codul caruciorului poate contine doar litere, cifre si cratima (maxim 20 de caractere).";
  }
  const bad = names.find((n) => !CODE_PATTERN.test(n));
  if (bad !== undefined) {
    return `Denumirea „${bad || "(gol)"}” nu e valida: doar litere, cifre si cratima, fara spatii.`;
  }
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return `Denumirea ${dup} apare de doua ori pe acelasi carucior.`;
  if (names.includes(code)) return "O cutie nu poate avea aceeasi denumire ca si caruciorul.";
  return null;
}
