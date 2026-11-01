import { Footer } from "@/components/Footer";
import { HeroSection } from "@/components/HeroSection";
import { FeaturedEvents } from "@/components/FeaturedEvents";
import { FeaturesSection } from "@/components/FeaturesSection";
import { TestimonialsSection } from "@/components/TestimonialsSection";
import { NewsletterSection } from "@/components/NewsletterSection";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

type Facet = { category: string; count: number };

async function fetchCategories(): Promise<Facet[]> {
  const res = await fetch("/api/events?facets=true");
  if (!res.ok) throw new Error("Failed to load categories");
  return res.json();
}

/**
 * Categories come from the events that actually exist, with real counts. The
 * previous hardcoded list ("Concerts", "Conferences", "Festivals",
 * "Exhibitions") didn't match the stored values ("Concert", "Conference") and
 * invented two that were never used, so every pill led to an empty page.
 */
function CategoryBar() {
  const { data: categories = [] } = useQuery({
    queryKey: ["events", "categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  if (categories.length === 0) return null;

  // Sticky only from md up: on phones the header + a sticky bar would take ~135px of the screen.
  return (
    <section className="border-b border-border/50 bg-background/80 backdrop-blur-md md:sticky md:top-16 z-30">
      <div className="container max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-2 py-4 overflow-x-auto scrollbar-none">
          <h2 className="text-sm text-muted-foreground whitespace-nowrap mr-3">Browse by</h2>
          {categories.map(({ category, count }) => (
            <Link
              key={category}
              to={`/events?category=${encodeURIComponent(category)}`}
              className="group flex items-baseline gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-200"
            >
              {category}
              <span className="text-xs tabular-nums text-muted-foreground group-hover:text-primary transition-colors">
                {count}
              </span>
            </Link>
          ))}
          <Link
            to="/events"
            className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            All events
          </Link>
        </div>
      </div>
    </section>
  );
}

const Index = () => {
  return (
    <>
      <HeroSection />
      <CategoryBar />
      <FeaturedEvents />
      <FeaturesSection />
      <TestimonialsSection />
      <NewsletterSection />
      <Footer />
    </>
  );
};

export default Index;
