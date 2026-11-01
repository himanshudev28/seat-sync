const pad = (n: number) => n.toString().padStart(2, "0");

/** Split an instant into the local `yyyy-MM-dd` and `HH:mm` strings an edit form needs. */
export function toLocalDateTimeParts(input: string | number | Date): { date: string; time: string } {
  const d = new Date(input);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Inverse of toLocalDateTimeParts: local date + time strings back to the same instant. */
export function fromLocalDateTimeParts(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}
