import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");

interface PackedFile {
  path: string;
}

interface PackResult {
  files: PackedFile[];
  unpackedSize: number;
}

async function pack(): Promise<PackResult> {
  const p = Bun.spawn(["npm", "pack", "--dry-run", "--json"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  expect(code).toBe(0);
  const [result] = JSON.parse(out) as PackResult[];
  return result!;
}

describe("the published tarball", () => {
  test("the card's fonts and sheet ship in the tarball", async () => {
    const { files } = await pack();
    const paths = files.map((f) => f.path);
    for (const expected of [
      "src/index.ts",
      "src/card.ts",
      "src/cardhtml.ts",
      "src/image.ts",
      "src/format.ts",
      "assets/characters.webp",
      "assets/fonts/inter-400.woff2",
      "assets/fonts/inter-700.woff2",
      "assets/fonts/inter-800.woff2",
      "assets/fonts/jetbrains-mono-500.woff2",
      "assets/fonts/LICENSE-inter.txt",
      "assets/fonts/LICENSE-jetbrains-mono.txt",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "package.json",
    ]) {
      expect(paths).toContain(expected);
    }
  });

  test("tests, docs and media do not", async () => {
    const { files } = await pack();
    const paths = files.map((f) => f.path);
    for (const path of paths) {
      expect(path.startsWith("tests/")).toBe(false);
      expect(path.startsWith("docs/")).toBe(false);
      expect(path.startsWith("scripts/")).toBe(false);
      expect(path.startsWith(".github/")).toBe(false);
    }
    for (const excluded of ["assets/demo.mp4", "assets/demo.webp", "assets/card.png", "src/score.test.ts", "tsconfig.json", "bun.lock"]) {
      expect(paths).not.toContain(excluded);
    }
  });

  test("the tarball stays under 1 MB unpacked", async () => {
    const { unpackedSize } = await pack();
    expect(unpackedSize).toBeLessThan(1024 * 1024);
  });
});
