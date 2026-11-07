import { useQuery } from "@tanstack/react-query";

export type Facet = { category: string; count: number };

async function fetchCategories(): Promise<Facet[]> {
  const res = await fetch("/api/events?facets=true");
  if (!res.ok) throw new Error("Failed to load categories");
  return res.json();
}

/**
 * Categories come from the events that actually exist, with real counts. The
 * old hardcoded list ("Concerts", "Festivals"…) didn't match the stored values
 * ("Concert") and invented categories that were never used, so every pill led
 * to an empty page. Shared by the tape and the category chips (one request).
 */
export function useCategories() {
  return useQuery({
    queryKey: ["events", "categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });
}
