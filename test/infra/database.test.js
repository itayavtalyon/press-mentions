import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteDatabase } from "../../src/infra/database.js";

describe("SqliteDatabase statements", () => {
  it("reads with bound values and runs a statement that has none", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "sql-"));
    const database = new SqliteDatabase(path.join(directory, "sample.sqlite"));
    database.exec("CREATE TABLE sample (name TEXT)");
    database
      .prepare("INSERT INTO sample (name) VALUES (@name)")
      .run({ name: "Harvey" });
    database.prepare("DELETE FROM sample").run();

    expect(
      database.prepare("SELECT name FROM sample WHERE name = @name").all({
        name: "Harvey",
      }),
    ).toEqual([]);
    database.close();
  });
});
