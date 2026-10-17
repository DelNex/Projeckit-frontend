/**
 * Project KIT — Philippine Academic Calendar Utilities
 * Computes and validates school years adhering to DepEd calendar rules (June to May).
 */

export function getPhilippineSchoolYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 4 = May, 5 = June
  const year = date.getFullYear();
  if (month >= 5) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

export function isValidSchoolYear(sy: string): boolean {
  if (!sy || typeof sy !== 'string') return false;
  const match = sy.trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return false;
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  return end === start + 1;
}

