import { getTableName, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Always-qualified column reference ("table"."column") for correlated subqueries. Drizzle renders
 * columns unqualified in single-table selects, which would bind to the subquery's own table.
 */
export const ref = (column: AnyPgColumn): SQL => sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
