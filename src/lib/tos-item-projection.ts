import { calculateTos, type BloomLevel } from './tos-calculator';

export interface TosProjectionSourceRow {
  id?: string;
  code?: string;
  description?: string;
  competency?: string;
  daysTaught?: number;
  days?: number;
  days_taught?: number;
}

export interface TosProjectedItem {
  itemNumber: number;
  code: string;
  description: string;
  domain: BloomLevel;
}

/** Rebuild exact item ownership from the TOS's days-taught weights. */
export function projectTosItems(
  sourceRows: readonly TosProjectionSourceRow[],
  totalItems: number
): TosProjectedItem[] {
  if (!Number.isInteger(totalItems) || totalItems <= 0) return [];

  const rows = sourceRows.slice(0, 4);
  if (rows.length === 0) return [];

  const competencies = rows.map((row, index) => {
    const rawDays = row.daysTaught ?? row.days ?? row.days_taught;
    const parsedDays = Number(rawDays);
    return {
      id: row.id || String(index + 1),
      code: row.code || `COMP-${index + 1}`,
      description: row.description || row.competency || '',
      // Older TOS rows may not have days persisted. Give those rows equal weight;
      // never interpret legacy hours as days.
      daysTaught: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 1,
    };
  });

  const allocation = calculateTos(competencies, totalItems, { allocationMode: 'action_verb' });
  if (!allocation.isValid) return [];

  return allocation.rows.flatMap((row) => {
    const domainByItem = new Map<number, BloomLevel>();
    for (const level of Object.keys(row.domainItemNumbers) as BloomLevel[]) {
      for (const itemNumber of row.domainItemNumbers[level]) domainByItem.set(itemNumber, level);
    }

    return Array.from({ length: row.itemCount }, (_, offset) => {
      const itemNumber = row.startItem + offset;
      return {
        itemNumber,
        code: row.code,
        description: row.description || 'Learning competency',
        domain: domainByItem.get(itemNumber) || row.primaryBloomLevel,
      };
    });
  });
}
