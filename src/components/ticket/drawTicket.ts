import { formatPrice } from "@/lib/utils";
import { admitLabel, isVoid, type TicketData } from "./ticketData";

/**
 * Draws the ticket's front onto a canvas for the PNG/PDF download. Drawn by hand
 * rather than screenshotted with html2canvas, which can't render masks, layered
 * gradients or inline-flex text faithfully. Same colours and type as the
 * on-screen ticket (ticket.css).
 *
 * Two passes: measure the content first, then size the canvas so nothing is
 * cut or overlapped however long the title, venue or seat list is.
 */

const INK = "#15110f";
const PAPER = "#fbf7f3";
const CORAL = "#ff7a6b";
const MUTED = "rgba(255,255,255,0.64)";
const BACKDROP = "#0e0b0a";

const W = 900; // ticket width in CSS px; the canvas is scaled up for print quality
const MIN_H = 390;
const PAD = 30; // backdrop around the ticket
const STUB = 236;
const RADIUS = 24;
const NOTCH = 16;
const INSET = 30; // main part padding

const DISPLAY = '"Big Shoulders Variable", "Big Shoulders", "Arial Narrow", sans-serif';
const SANS = '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

const F = {
  brand: `800 24px ${DISPLAY}`,
  issuer: `600 10.5px ${SANS}`,
  admit: `800 16px ${DISPLAY}`,
  cat: `700 11.5px ${SANS}`,
  title: (size: number) => `800 ${size}px ${DISPLAY}`,
  label: `600 10px ${SANS}`,
  value: `600 14.5px ${SANS}`,
  money: `700 14.5px ${MONO}`,
  seat: `700 13.5px ${MONO}`,
  stubLabel: `700 10.5px ${SANS}`,
  ref: `700 13px ${MONO}`,
  status: `700 11px ${SANS}`,
  note: `500 12.5px ${SANS}`,
  void: `900 56px ${DISPLAY}`,
};

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function measure(ctx: Ctx, s: string, font: string, spacing = "0px") {
  ctx.font = font;
  ctx.letterSpacing = spacing;
  const w = ctx.measureText(s).width;
  ctx.letterSpacing = "0px";
  return w;
}

function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  font: string,
  color: string,
  opts: { spacing?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline } = {},
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = opts.baseline ?? "alphabetic";
  ctx.letterSpacing = opts.spacing ?? "0px";
  ctx.fillText(s, x, y);
  ctx.letterSpacing = "0px";
}

/**
 * Word wrap to `maxWidth`. A word too long for a line on its own is broken
 * between characters (like CSS overflow-wrap: anywhere). Past `maxLines`, the
 * last line ends with an ellipsis.
 */
function wrap(ctx: Ctx, s: string, font: string, maxWidth: number, maxLines: number): string[] {
  ctx.font = font;
  const fits = (str: string) => ctx.measureText(str).width <= maxWidth;
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (rest.length > 1 && !fits(rest)) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

type SeatChip = { text: string; w: number; tone: "vip" | "access" | "plain" };

export async function drawTicket(t: TicketData, qrDataUrl: string, scale = 2.5): Promise<HTMLCanvasElement> {
  const d = new Date(t.date);
  const meta: [string, string, string][] = [
    ["DATE", Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d), F.value],
    ["TIME", t.time || "See event", F.value],
    ["VENUE", t.venue || "—", F.value],
    ["PAID", t.isFree || t.total <= 0 ? "Free" : formatPrice(t.total), F.money],
  ];
  const people = (
    [
      ["NAME", t.holder],
      [(t.studentIdLabel || "Student ID").toUpperCase(), t.studentId],
      [(t.courseLabel || "Course").toUpperCase(), t.course],
    ] as [string, string][]
  ).filter(([, v]) => v);

  // Canvas text only uses fonts that are loaded, and only for the characters
  // asked for: pass the real strings so non-Latin names get their subset too.
  const sample = [t.title, t.venue, t.holder, t.issuer, t.course].join(" ") || "A";
  await Promise.all(
    [F.title(56), F.value, F.label, F.seat, F.brand].map((f) => document.fonts?.load(f, sample).catch(() => undefined)),
  );
  const qr = await loadImage(qrDataUrl);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d") as Ctx;

  // ── Pass 1: measure ──
  const left = PAD + INSET;
  const right = PAD + W - STUB - INSET;
  const width = right - left;

  const title = t.title.toUpperCase();
  let titleSize = 56;
  let titleLines = wrap(ctx, title, F.title(titleSize), width, 99);
  while (titleLines.length > 2 && titleSize > 36) {
    titleSize -= 4;
    titleLines = wrap(ctx, title, F.title(titleSize), width, 99);
  }
  if (titleLines.length > 2) titleLines = wrap(ctx, title, F.title(titleSize), width, 2);

  const colW = width / 4;
  const metaLines = meta.map(([, value, font]) => wrap(ctx, value, font, colW - 14, 2));

  const chips: SeatChip[] = t.seats.map((s) => {
    const tone = s.type === "vip" ? "vip" : s.type === "wheelchair" ? "access" : "plain";
    const label = `${s.row}${s.number}${tone === "vip" ? " VIP" : tone === "access" ? " ♿" : ""}`;
    return { text: label, w: measure(ctx, label, F.seat) + 18, tone };
  });
  // Up to three rows of chips; anything past that becomes "+N more".
  const MAX_ROWS = 3;
  const rows: SeatChip[][] = [[]];
  let rowW = 0;
  let hidden = 0;
  for (let i = 0; i < chips.length; i++) {
    const c = chips[i];
    if (rowW + c.w > width && rows[rows.length - 1].length) {
      if (rows.length === MAX_ROWS) {
        hidden = chips.length - i;
        break;
      }
      rows.push([]);
      rowW = 0;
    }
    rows[rows.length - 1].push(c);
    rowW += c.w + 6;
  }
  if (hidden) {
    const moreW = measure(ctx, "+99 more", F.value) + 6; // room for the label as it grows
    const last = rows[rows.length - 1];
    while (last.length && last.reduce((a, c) => a + c.w + 6, 0) + moreW > width) {
      last.pop();
      hidden++;
    }
  }

  // Vertical layout, as offsets from the ticket's top edge.
  let y = 102;
  const catY = t.category ? y : null;
  if (t.category) y += 10;
  const titleYs = titleLines.map(() => (y += titleSize * 0.88));
  const dividerY = (y += 18);
  const metaY = (y += 24);
  const metaBottom = metaY + 21 + (Math.max(...metaLines.map((l) => l.length)) - 1) * 18;
  const seatsLabelY = metaBottom + 30;
  const seatsTop = seatsLabelY + 9;
  const seatsBottom = seatsTop + rows.length * 25 + (rows.length - 1) * 6;
  const holderY = people.length ? seatsBottom + 30 : null;
  const afterHolder = holderY !== null ? holderY + 20 : seatsBottom;
  // The organiser's note (Admin → event → Ticket), up to two lines under a dashed rule.
  const noteLines = t.note ? wrap(ctx, t.note, F.note, width - 18, 2) : [];
  const noteY = noteLines.length ? afterHolder + 34 : null;
  const contentBottom = noteY !== null ? noteY + (noteLines.length - 1) * 17 : afterHolder;
  const H = Math.max(MIN_H, Math.ceil(contentBottom + 32));

  // ── Pass 2: draw (resizing the canvas resets the context) ──
  canvas.width = Math.round((W + PAD * 2) * scale);
  canvas.height = Math.round((H + PAD * 2) * scale);
  ctx.scale(scale, scale);

  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, W + PAD * 2, H + PAD * 2);

  const x0 = PAD;
  const y0 = PAD;
  const xp = x0 + W - STUB; // perforation

  // Body, clipped to the rounded ticket shape.
  ctx.save();
  roundRect(ctx, x0, y0, W, H, RADIUS);
  ctx.clip();
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y0, W, H);
  const glow = ctx.createRadialGradient(xp, y0, 0, xp, y0, 420);
  glow.addColorStop(0, "rgba(255,107,91,0.38)");
  glow.addColorStop(1, "rgba(255,107,91,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x0, y0, W - STUB, H);
  const violet = ctx.createRadialGradient(x0, y0 + H, 0, x0, y0 + H, 360);
  violet.addColorStop(0, "rgba(196,161,255,0.18)");
  violet.addColorStop(1, "rgba(196,161,255,0)");
  ctx.fillStyle = violet;
  ctx.fillRect(x0, y0, W - STUB, H);
  ctx.fillStyle = "rgba(255,255,255,0.09)";
  for (let gy = y0 + 8; gy < y0 + H; gy += 16) {
    for (let gx = x0 + 8; gx < xp; gx += 16) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 9;
  ctx.setLineDash([11, 8]);
  for (const r of [70, 102, 134, 166]) {
    ctx.beginPath();
    ctx.arc(xp - 40, y0 + H + 40, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = PAPER;
  ctx.fillRect(xp, y0, STUB, H);
  ctx.restore();

  // Perforation and notches.
  ctx.strokeStyle = "rgba(21,17,15,0.22)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(xp + 1, y0 + NOTCH + 4);
  ctx.lineTo(xp + 1, y0 + H - NOTCH - 4);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = BACKDROP;
  for (const ny of [y0, y0 + H]) {
    ctx.beginPath();
    ctx.arc(xp, ny, NOTCH, 0, Math.PI * 2);
    ctx.fill();
  }

  // Header.
  text(ctx, "SEATSYNC", left, y0 + 46, F.brand, "#fff", { spacing: "1.4px" });
  text(ctx, ".", left + measure(ctx, "SEATSYNC", F.brand, "1.4px") + 1, y0 + 46, F.brand, CORAL);
  if (t.issuer) {
    const issuer = wrap(ctx, t.issuer.toUpperCase(), F.issuer, width - 140, 1)[0];
    text(ctx, issuer, left, y0 + 64, F.issuer, MUTED, { spacing: "1.5px" });
  }
  const admit = admitLabel(t);
  const admitW = measure(ctx, admit, F.admit, "1.2px") + 26;
  roundRect(ctx, right - admitW, y0 + 26, admitW, 28, 14);
  ctx.fillStyle = CORAL;
  ctx.fill();
  text(ctx, admit, right - admitW / 2, y0 + 41, F.admit, INK, { spacing: "1.2px", align: "center", baseline: "middle" });

  // Title block.
  if (catY !== null) text(ctx, t.category.toUpperCase(), left, y0 + catY, F.cat, CORAL, { spacing: "2.3px" });
  titleLines.forEach((l, i) => text(ctx, l, left, y0 + titleYs[i], F.title(titleSize), "#fff"));

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(left, y0 + dividerY);
  ctx.lineTo(right, y0 + dividerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Date | Time | Venue | Paid
  meta.forEach(([label, , font], i) => {
    const cx = left + i * colW;
    text(ctx, label, cx, y0 + metaY, F.label, MUTED, { spacing: "1.4px" });
    metaLines[i].forEach((l, li) => text(ctx, l, cx, y0 + metaY + 21 + li * 18, font, "#fff"));
  });

  // Seats.
  text(ctx, t.seats.length === 1 ? "SEAT" : "SEATS", left, y0 + seatsLabelY, F.label, MUTED, { spacing: "1.4px" });
  if (chips.length === 0) text(ctx, "—", left, y0 + seatsTop + 18, F.value, "#fff");
  rows.forEach((row, ri) => {
    let sx = left;
    const rowY = y0 + seatsTop + ri * 31;
    for (const c of row) {
      roundRect(ctx, sx, rowY, c.w, 25, 7);
      if (c.tone === "plain") {
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = c.tone === "vip" ? "#c4a1ff" : "#8fb3e8";
        ctx.fill();
      }
      text(ctx, c.text, sx + 9, rowY + 13, F.seat, c.tone === "plain" ? "#fff" : INK, { baseline: "middle" });
      sx += c.w + 6;
    }
    if (hidden && ri === rows.length - 1) text(ctx, `+${hidden} more`, sx + 4, rowY + 13, F.value, MUTED, { baseline: "middle" });
  });

  // Holder.
  if (holderY !== null) {
    let px = left;
    for (const [label, value] of people) {
      const v = wrap(ctx, value, F.value, 220, 1)[0];
      text(ctx, label, px, y0 + holderY, F.label, MUTED, { spacing: "1.4px" });
      text(ctx, v, px, y0 + holderY + 20, F.value, "#fff");
      px += Math.max(measure(ctx, v, F.value), 70) + 32;
    }
  }

  if (noteY !== null) {
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, y0 + noteY - 20);
    ctx.lineTo(right, y0 + noteY - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = CORAL;
    roundRect(ctx, left, y0 + noteY - 9, 7, 7, 2);
    ctx.fill();
    noteLines.forEach((l, i) => text(ctx, l, left + 17, y0 + noteY + i * 17, F.note, "rgba(255,255,255,0.86)"));
  }

  if (isVoid(t)) {
    ctx.save();
    ctx.translate(x0 + (W - STUB) / 2, y0 + H / 2);
    ctx.rotate((-14 * Math.PI) / 180);
    roundRect(ctx, -110, -40, 220, 80, 12);
    ctx.fillStyle = "rgba(21,17,15,0.6)";
    ctx.fill();
    ctx.strokeStyle = "#ff6b5b";
    ctx.lineWidth = 4;
    ctx.stroke();
    text(ctx, "VOID", 0, 2, F.void, "#ff6b5b", { align: "center", baseline: "middle", spacing: "6px" });
    ctx.restore();
  }

  // Stub, centred vertically on a taller ticket.
  const cx = xp + STUB / 2;
  const sy = y0 + (H - MIN_H) / 2;
  text(ctx, "SCAN AT ENTRY", cx, sy + 64, F.stubLabel, "rgba(21,17,15,0.7)", { align: "center", spacing: "2.3px" });
  const q = 176;
  roundRect(ctx, cx - q / 2, sy + 82, q, q, 12);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.imageSmoothingEnabled = false; // keep the QR modules crisp
  ctx.drawImage(qr, cx - q / 2, sy + 82, q, q);
  ctx.imageSmoothingEnabled = true;
  text(ctx, `No. ${t.ref}`, cx, sy + 290, F.ref, INK, { align: "center", spacing: "0.8px" });

  const [statusText, statusColor] =
    t.status === "cancelled"
      ? ["CANCELLED", "#b42318"]
      : t.status === "refunded"
        ? ["REFUNDED", "#b42318"]
        : t.status === "pending"
          ? ["PENDING", "#965004"]
          : t.checkedIn
            ? ["CHECKED IN", "#965004"]
            : ["CONFIRMED", "#0b7a55"];
  const sw = measure(ctx, statusText, F.status, "0.7px") + 24;
  roundRect(ctx, cx - sw / 2, sy + 306, sw, 24, 12);
  ctx.fillStyle = `${statusColor}1a`; // ~10% tint of the status colour
  ctx.fill();
  text(ctx, statusText, cx, sy + 318.5, F.status, statusColor, { align: "center", baseline: "middle", spacing: "0.7px" });

  return canvas;
}
