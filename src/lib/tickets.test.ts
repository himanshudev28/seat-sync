import { parseTicketUrl } from "./tickets";

const ID = "6ae631c2f445db1c0e3a2631";
const origins = ["https://seat-sync-five.vercel.app", "http://localhost:3000"];

describe("parseTicketUrl", () => {
  it("accepts a ticket link on an allowed origin", () => {
    const r = parseTicketUrl(`https://seat-sync-five.vercel.app/validate/${ID}`, origins);
    expect(r?.bookingId).toBe(ID);
  });
  it.each([
    ["another site", `https://evil.example/validate/${ID}`],
    ["a lookalike host", `https://seat-sync-five.vercel.app.evil.example/validate/${ID}`],
    ["a different path", `https://seat-sync-five.vercel.app/admin/${ID}`],
    ["a bad id", "https://seat-sync-five.vercel.app/validate/not-an-id"],
    ["javascript:", "javascript:alert(1)"],
    ["plain text", "hello"],
  ])("rejects %s", (_name, text) => {
    expect(parseTicketUrl(text, origins)).toBeNull();
  });
  it("trusts the page's own origin by default", () => {
    expect(parseTicketUrl(`${window.location.origin}/validate/${ID}`)?.sameOrigin).toBe(true);
  });
});
