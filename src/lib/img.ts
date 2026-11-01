/**
 * Responsive image URLs for Unsplash (the only resizable CDN we use). Stored event URLs already
 * carry params like `?w=800&h=500&fit=crop`; we REPLACE size/quality/format params rather than
 * appending duplicates (Unsplash keeps the first `w`, so appending silently has no effect).
 */

export const isResizable = (url: string | null | undefined): url is string =>
  !!url && url.startsWith("https://images.unsplash.com/");

/** `url` resized to width `w` (CSS px × density chosen by the browser via srcset), AVIF/WebP when supported. */
export function imageUrl(url: string, w: number, q = 70): string {
  if (!isResizable(url)) return url;
  try {
    const u = new URL(url);
    // A fixed height would distort a different width; object-cover crops in CSS instead.
    u.searchParams.delete("h");
    u.searchParams.set("w", String(Math.round(w)));
    u.searchParams.set("q", String(q));
    u.searchParams.set("auto", "format");
    u.searchParams.set("fit", "crop");
    u.searchParams.delete("fm");
    return u.toString();
  } catch {
    return url;
  }
}

/** `srcSet` for the given widths, or undefined for URLs that can't be resized. */
export function imageSrcSet(url: string | null | undefined, widths: number[], q = 70): string | undefined {
  if (!isResizable(url)) return undefined;
  return widths.map((w) => `${imageUrl(url, w, q)} ${w}w`).join(", ");
}

/** Common slots, matched to the layout's breakpoints. */
export const SIZES = {
  /** Event cards: 1 col on phones, 2 on sm, 3–4 on lg. */
  card: "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  /** Home hero art: about 40% of the viewport on desktop. */
  hero: "(min-width: 1024px) 40vw, 90vw",
} as const;

export const WIDTHS = {
  card: [320, 480, 640, 800],
  hero: [480, 720, 960, 1280],
} as const;
