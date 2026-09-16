import { expect, test } from "bun:test";

const css = await Bun.file(new URL("../src/app/globals.css", import.meta.url)).text();

function luminance(hex: string) {
  const rgb = hex.replace("#", "").match(/../g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
}

function token(name: string) {
  const value = css.match(new RegExp(`--${name}: (#[a-f0-9]{6});`))?.[1];
  expect(value).toBeDefined();
  return value!;
}

test("light theme preserves text and primary-action AA contrast", () => {
  for (const surface of [token("background"), token("surface"), token("lilac"), token("mint"), token("peach"), "#e4daf4", "#d3eff1"]) {
    expect(contrast(token("foreground"), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("muted"), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("berry"), surface)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(token("surface"), token("berry"))).toBeGreaterThanOrEqual(4.5);
});

test("semantic status and inset surfaces remain distinct and readable", () => {
  const statuses = ["saved", "applied", "screen", "interview", "offer", "rejected", "archived"];
  const colors = statuses.map((status) => token(`status-${status}`));
  expect(new Set(colors).size).toBe(statuses.length);
  for (const surface of [...colors, token("inset-surface"), token("tag-surface")]) {
    expect(surface).not.toBe(token("background"));
    expect(surface).not.toBe(token("surface"));
    expect(contrast(token("foreground"), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("muted"), surface)).toBeGreaterThanOrEqual(4.5);
  }
});

test("warm page and reference mauve navigation retain accessible branding", () => {
  expect(token("background")).toBe("#f8eadf");
  expect(token("nav-mauve")).toBe("#a382a9");
  expect(token("nav-mauve")).not.toBe(token("lilac"));
  expect(contrast(token("nav-ink"), token("nav-mauve"))).toBeGreaterThanOrEqual(4.5);
  expect(css).toContain("background: var(--nav-mauve)");
  expect(css).toContain(".vespoid-nav :focus-visible { outline-color: var(--nav-ink); }");
  expect(css).toContain(".vespoid-brand { display: inline-flex; align-items: center; gap: .65rem; color: var(--nav-ink); }");
});

test("inputs retain visible boundaries and keyboard focus", () => {
  const border = css.match(/\.vespoid-input \{ border: 1px solid (#[a-f0-9]{6});/)?.[1];
  expect(border).toBeDefined();
  expect(contrast(border!, token("surface"))).toBeGreaterThanOrEqual(3);
  expect(css).toContain(":focus-visible { outline: 3px solid var(--berry)");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
});

test("whimsy stays visual with functional headings and no decorative subtitles", async () => {
  const dashboard = await Bun.file(new URL("../src/app/page.tsx", import.meta.url)).text();
  expect(dashboard).toContain(">Dashboard</h1>");
  expect(dashboard).toContain(">Recommendations</h2>");
  for (const copy of ["A little room", "Your job-search companion", "Worth a closer look", "Fresh possibilities"]) {
    expect(dashboard).not.toContain(copy);
  }
  expect(css).not.toContain("Georgia");
  expect(css).toContain("--raised:");
  expect(css).toContain("--inset:");
});

test("shared navigation exposes named routes and current-page state", async () => {
  const nav = await Bun.file(new URL("../src/app/navigation.tsx", import.meta.url)).text();
  expect(nav).toContain('aria-label="Main navigation"');
  expect(nav).toContain('aria-label="Vespoid home"');
  expect(nav).toContain('href="/" aria-current=');
  expect(nav).toContain('href="/jobs" aria-current=');
  expect(nav).toContain('aria-hidden="true"');
});
