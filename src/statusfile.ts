// The only module that writes the status file. Shell, not core: it owns the
// path, the directory, the temporary file, the rename and the modes. The line
// it is handed comes from the pure `src/status.ts`.
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

const FAILED = "cannot write the status file";

// Write `line` to ~/.claude/zapara/status.json atomically: an exclusively
// created temporary file in the same directory, then a rename over the target.
// A reader sees the old file or the new one, never a partial line, and never a
// file written through a symlink someone left at the target: `rename` replaces
// the link. HOME comes from the env passed in rather than os.homedir(), so an
// empty HOME is the error the spec names instead of a silent fallback.
export async function writeStatus(line: string, env: NodeJS.ProcessEnv): Promise<void> {
  const home = env.HOME;
  if (!home) throw new Error(FAILED);
  // The modes below are a request the umask narrows, so the umask becomes ours
  // before anything is created: zapara is a short-lived CLI and the status file
  // is the only thing it writes from here on. Setting it, rather than widening
  // each path afterwards, is what makes `mkdir` and `open` come out exactly
  // 0700 and 0600 on the first try — and it closes the window where one run has
  // created `~/.claude` too narrow to enter and a second run, seeing a parent
  // that already exists, fails inside it.
  process.umask(0o077);
  const dir = join(home, ".claude", "zapara");
  // The name is unique to this run: two detached runs may write at once, each
  // renames its own complete file and the last rename wins. So this run opens
  // its temp file with `wx` (an existing file or symlink at the name is an
  // error, never followed) and never opens, reuses or deletes one it did not
  // create — from the outside a crashed run's leftover and a slow run's file
  // in flight look the same, and removing the second would break that promise.
  const tmp = join(dir, `status.json.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`);
  let created = false;
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // `mkdir` leaves a directory that already exists exactly as it was, so a
    // status directory someone else created loose is tightened here.
    await chmod(dir, 0o700);
    const handle = await open(tmp, "wx", 0o600);
    created = true;
    try { await handle.writeFile(line); } finally { await handle.close(); }
    await chmod(tmp, 0o600);
    await rename(tmp, join(dir, "status.json"));
  } catch {
    // Only this run's own file, and a failure to remove it changes nothing:
    // the error below is what the caller acts on either way.
    if (created) await unlink(tmp).catch(() => {});
    throw new Error(FAILED);
  }
}
