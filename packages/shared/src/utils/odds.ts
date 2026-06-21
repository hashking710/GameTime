import type { OddsFormat } from "../types/user";

export function formatOdds(decimal: number, format: OddsFormat): string {
  if (format === "american") {
    return decimalToAmerican(decimal);
  }
  return decimal.toFixed(2);
}

function decimalToAmerican(decimal: number): string {
  if (decimal >= 2.0) {
    return `+${Math.round((decimal - 1) * 100)}`;
  }
  return `${Math.round(-100 / (decimal - 1))}`;
}
