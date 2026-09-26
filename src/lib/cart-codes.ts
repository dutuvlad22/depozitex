// Codurile de pe etichete: caruciorul (ex. CAR01) si cutiile lui (CUT01..CUT20).
// O eticheta de cutie poate fi si "CAR01-CUT03" (unica in tot depozitul).

export const MAX_CART_CAPACITY = 20;

export function boxLabel(boxNo: number): string {
  return `CUT${String(boxNo).padStart(2, "0")}`;
}

export function normalizeCartCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Numarul cutiei dintr-un cod scanat, sau null daca nu e un cod de cutie. */
export function parseBoxCode(code: string): { cart: string | null; box: number } | null {
  const m = code.trim().toUpperCase().match(/^(?:([A-Z0-9]+)-)?CUT(\d{1,2})$/);
  if (!m) return null;
  return { cart: m[1] ?? null, box: Number(m[2]) };
}

/** Urmatorul cod liber de forma CAR01, CAR02... */
export function nextCartCode(existing: string[]): string {
  const used = new Set(existing.map(normalizeCartCode));
  for (let i = 1; i < 1000; i++) {
    const code = `CAR${String(i).padStart(2, "0")}`;
    if (!used.has(code)) return code;
  }
  return "";
}
