import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const pythonCommand = process.platform === "win32" ? "python" : "python3";

describe("database migrations", () => {
  test("fresh migrated database accepts a manual playlist insert", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "request-bot-db-"));
    const dbPath = join(tempDir, "test.sqlite");
    const migrationPaths = readdirSync(join(process.cwd(), "drizzle"))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => join(process.cwd(), "drizzle", name));

    const script = `
import json
import sqlite3
import sys

db_path = sys.argv[1]
migration_paths = json.loads(sys.argv[2])

con = sqlite3.connect(db_path)
cur = con.cursor()

for migration_path in migration_paths:
    with open(migration_path, "r", encoding="utf-8") as file:
        sql = file.read()
    cur.executescript(sql)

cur.execute("insert into users (id, twitch_user_id, login, display_name) values (?, ?, ?, ?)", ("usr_test", "tw_test", "tester", "Tester"))
cur.execute("insert into channels (id, owner_user_id, twitch_channel_id, slug, login, display_name) values (?, ?, ?, ?, ?, ?)", ("chn_test", "usr_test", "tw_channel", "tester", "tester", "Tester"))
cur.execute("insert into playlists (id, channel_id) values (?, ?)", ("pl_test", "chn_test"))
cur.execute("""
insert into playlist_items (
  id, playlist_id, channel_id, song_id, song_title, song_artist, song_album,
  song_creator, song_tuning, song_parts_json, song_duration_text,
  song_catalog_source_id, song_source, song_url, status,
  requested_by_twitch_user_id, requested_by_login, requested_by_display_name,
  request_message_id, request_kind, position, regular_position, created_at, updated_at
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (unixepoch() * 1000), (unixepoch() * 1000))
""", (
    "pli_test",
    "pl_test",
    "chn_test",
    "song_test",
    "Wonderwall",
    "Oasis",
    "(What's the Story) Morning Glory?",
    "Ubisoft",
    "Custom Tuning",
    json.dumps(["lead", "rhythm"]),
    "4:18",
    4544,
    "library",
    "https://example.com/songs/4544",
    "current",
    "manual",
    "channel_owner",
    "Channel Owner",
    None,
    "regular",
    1,
    1
))

row = cur.execute("select song_title, request_kind, requested_by_twitch_user_id from playlist_items where id='pli_test'").fetchone()
con.commit()
con.close()
print(json.dumps(row))
`;

    const output = execFileSync(
      pythonCommand,
      ["-", dbPath, JSON.stringify(migrationPaths)],
      {
        input: script,
        encoding: "utf8",
      }
    );

    expect(JSON.parse(output)).toEqual(["Wonderwall", "regular", "manual"]);
  });

  test("fresh migrated database defaults max queue size to 50", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "request-bot-db-"));
    const dbPath = join(tempDir, "test.sqlite");
    const migrationPaths = readdirSync(join(process.cwd(), "drizzle"))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => join(process.cwd(), "drizzle", name));

    const script = `
import json
import sqlite3
import sys

db_path = sys.argv[1]
migration_paths = json.loads(sys.argv[2])

con = sqlite3.connect(db_path)
cur = con.cursor()

for migration_path in migration_paths:
    with open(migration_path, "r", encoding="utf-8") as file:
        sql = file.read()
    cur.executescript(sql)

cur.execute("insert into users (id, twitch_user_id, login, display_name) values (?, ?, ?, ?)", ("usr_test", "tw_test", "tester", "Tester"))
cur.execute("insert into channels (id, owner_user_id, twitch_channel_id, slug, login, display_name) values (?, ?, ?, ?, ?, ?)", ("chn_test", "usr_test", "tw_channel", "tester", "tester", "Tester"))
cur.execute("insert into channel_settings (channel_id) values (?)", ("chn_test",))

row = cur.execute("select max_queue_size from channel_settings where channel_id='chn_test'").fetchone()
con.commit()
con.close()
print(json.dumps(row))
`;

    const output = execFileSync(
      pythonCommand,
      ["-", dbPath, JSON.stringify(migrationPaths)],
      {
        input: script,
        encoding: "utf8",
      }
    );

    expect(JSON.parse(output)).toEqual([50]);
  });
});
