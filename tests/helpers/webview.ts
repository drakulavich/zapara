// Probes once whether this machine can open a Bun.WebView (WebKit on macOS, an
// installed Chrome elsewhere). Tests that render skip when it cannot, unless
// ZAPARA_REQUIRE_WEBVIEW is set, as CI sets it, where a missing engine is a
// failure: raster coverage must never disappear silently.
//
// The per-test budget of every WebView-backed test, in milliseconds: 30 s, or
// ZAPARA_WEBVIEW_TIMEOUT_MS when set, so a slow machine or a loaded runner
// raises it once instead of editing four tests. Half of it is the page's
// readiness deadline below, which keeps the 15 s a render had before; the
// other half is headroom, so the deadline's message is what a slow render
// reports rather than the test's own timer. This is the one place the number lives.
export const WEBVIEW_TEST_TIMEOUT = Number(process.env.ZAPARA_WEBVIEW_TIMEOUT_MS) || 30_000;
const BACKEND = process.platform === "darwin" ? "webkit" : "chrome";
const READY = 'document.fonts.ready.then(() => document.fonts.status === "loaded" && Array.from(document.images).every((i) => i.complete))';

export const webviewMissing: string | null = await (async () => {
  try {
    const view = new Bun.WebView({ width: 8, height: 8, backend: BACKEND });
    try { await view.navigate("data:text/html,<p>probe</p>"); } finally { view.close(); }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
})();

if (webviewMissing !== null && process.env.ZAPARA_REQUIRE_WEBVIEW) {
  throw new Error(`ZAPARA_REQUIRE_WEBVIEW is set but no WebView can be opened: ${webviewMissing}`);
}

// A view with the page loaded and its fonts ready. The caller closes it. The
// readiness deadline is half the test budget and covers navigate() too, so a
// slow render fails here with a message rather than on the test's own timer,
// which would say only how long it took.
export async function openPage(html: string, width: number, height: number): Promise<Bun.WebView> {
  const view = new Bun.WebView({ width, height, backend: BACKEND });
  const budget = WEBVIEW_TEST_TIMEOUT / 2;
  const ready = (async () => {
    await view.navigate("data:text/html;charset=utf-8," + encodeURIComponent(html));
    while (!(await view.evaluate<boolean>(READY))) await Bun.sleep(50);
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`page never became ready in ${budget} ms: navigate, fonts or images did not settle`)), budget);
  });
  // Once the deadline wins, `ready` keeps running against a closed view and may
  // reject on its own; that rejection is expected and must not go unhandled.
  ready.catch(() => {});
  try { await Promise.race([ready, late]); return view; }
  catch (e) { view.close(); throw e; }
  finally { clearTimeout(timer); }
}
