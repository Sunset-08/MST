import { sql } from "drizzle-orm";
import { db } from "./index.js";

async function testDatabase() {
  try {
    const result = await db.execute(sql`
      SELECT
        current_database() AS database,
        current_user AS user,
        NOW() AS server_time
    `);

    console.log("✅ Database connection successful!");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("❌ Database connection failed:");
    console.error(error);
    throw error;
  }
}

testDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });