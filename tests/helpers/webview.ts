// Probes once whether this machine can open a Bun.WebView (WebKit on macOS, an
// installed Chrome elsewhere). Tests that render skip when it cannot, unless
// ZAPARA_REQUIRE_WEBVIEW is set, as CI sets it, where a missing engine is a
// failure: raster coverage must never disappear silently.
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

// A view with the page loaded and its fonts ready. The caller closes it.
export async function openPage(html: string, width: number, height: number): Promise<Bun.WebView> {
  const view = new Bun.WebView({ width, height, backend: BACKEND });
  await view.navigate("data:text/html;charset=utf-8," + encodeURIComponent(html));
  const deadline = Date.now() + 15_000;
  while (!(await view.evaluate<boolean>(READY))) {
    if (Date.now() > deadline) { view.close(); throw new Error("page never became ready"); }
    await Bun.sleep(50);
  }
  return view;
}
