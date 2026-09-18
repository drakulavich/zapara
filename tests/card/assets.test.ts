import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FONTS, FONT_DIR, sha256 } from "../../scripts/fetch-fonts.ts";

describe("card assets", () => {
  test("every font file on disk is the pinned byte stream", () => {
    // fetch-fonts.ts is the contract; a font swapped in by hand fails here.
    for (const f of FONTS) {
      expect(sha256(readFileSync(join(FONT_DIR, f.file)))).toBe(f.sha256);
    }
  });

  test("the character sheet is a 1024x1024 WebP under 300 KB", async () => {
    const bytes = readFileSync(join(import.meta.dir, "../../assets/characters.webp"));
    expect(bytes.length).toBeLessThan(300_000);
    expect(await new Bun.Image(bytes).metadata()).toMatchObject({ width: 1024, height: 1024, format: "webp" });
  });
});
