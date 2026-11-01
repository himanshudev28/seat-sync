import { imageSrcSet, imageUrl, isResizable } from "./img";

const STORED = "https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&h=500&fit=crop";

describe("imageUrl", () => {
  it("replaces the stored width instead of appending a second one", () => {
    const u = new URL(imageUrl(STORED, 480));
    expect(u.searchParams.getAll("w")).toEqual(["480"]);
    expect(u.searchParams.get("h")).toBeNull();
    expect(u.searchParams.get("auto")).toBe("format");
    expect(u.searchParams.get("q")).toBe("70");
  });
  it("leaves non-Unsplash URLs untouched", () => {
    expect(imageUrl("https://example.com/a.jpg", 480)).toBe("https://example.com/a.jpg");
    expect(isResizable(null)).toBe(false);
  });
});

describe("imageSrcSet", () => {
  it("lists one candidate per width", () => {
    const s = imageSrcSet(STORED, [320, 640])!;
    expect(s.split(", ")).toHaveLength(2);
    expect(s).toMatch(/w=320.* 320w, .*w=640.* 640w$/);
  });
  it("is undefined for URLs that can't be resized", () => {
    expect(imageSrcSet("https://example.com/a.jpg", [320])).toBeUndefined();
  });
});
