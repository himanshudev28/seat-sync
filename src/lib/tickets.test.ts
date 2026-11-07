import { parseTicketUrl, ticketQrUrl } from "./tickets";

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

// New tickets carry the booking's ticket token (22 url-safe base64 chars), not the id.
const TOKEN = "Qm9va2luZ1Rva2VuXzEyMw";

describe("ticket tokens", () => {
  it("accepts a token link, so the in-app scanner reads new tickets", () => {
    expect(TOKEN).toHaveLength(22);
    expect(parseTicketUrl(`https://seat-sync-five.vercel.app/validate/${TOKEN}`, origins)?.bookingId).toBe(TOKEN);
  });
  it.each([
    ["too short", TOKEN.slice(0, 21)],
    ["too long", `${TOKEN}A`],
    ["bad characters", "Qm9va2luZ1Rva2VuXzEy.w"],
    ["a malformed escape", "%E0%A4%A"],
  ])("rejects a token that is %s", (_name, key) => {
    expect(parseTicketUrl(`https://seat-sync-five.vercel.app/validate/${key}`, origins)).toBeNull();
  });
});

describe("ticketQrUrl", () => {
  it("points deployed tickets at production", () => {
    expect(ticketQrUrl(TOKEN, "seat-sync-five.vercel.app")).toBe(`https://seat-sync-five.vercel.app/validate/${TOKEN}`);
    expect(ticketQrUrl(TOKEN, "preview-123.vercel.app")).toBe(`https://seat-sync-five.vercel.app/validate/${TOKEN}`);
  });
  it("points local tickets at the dev server", () => {
    expect(ticketQrUrl(ID, "localhost")).toBe(`http://localhost:8080/validate/${ID}`);
  });
  it("round-trips through the scanner for tokens and old booking ids", () => {
    for (const key of [TOKEN, ID]) {
      expect(parseTicketUrl(ticketQrUrl(key, "seat-sync-five.vercel.app"), origins)?.bookingId).toBe(key);
    }
  });
});
