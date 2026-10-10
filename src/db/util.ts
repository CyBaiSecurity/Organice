import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import { LimitError } from './errors.ts';

export async function scalar(
  db: SQLiteDatabase,
  sql: string,
  ...params: SQLiteBindValue[]
): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(sql, ...params);
  return Number(row?.n ?? 0);
}

export async function assertRoom(
  db: SQLiteDatabase,
  sql: string,
  max: number,
  cap: string,
  ...params: SQLiteBindValue[]
): Promise<void> {
  const current = await scalar(db, sql, ...params);
  if (current >= max) throw new LimitError(cap);
}

export function hasOwn(patch: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return value;
}

export function wholeOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

export function flag(value: number | boolean | null | undefined): number {
  return value === 1 || value === true ? 1 : 0;
}
