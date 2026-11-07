import "@/components/landing/landing.css";
import { lazy, Suspense } from "react";
import { HeroSection } from "@/components/HeroSection";
import { FeaturedEvents } from "@/components/FeaturedEvents";
import { CategoryTape } from "@/components/landing/CategoryTape";

// Below the fold: split out so the hero's JavaScript is all the first paint waits for.
// They load in parallel right after; content arriving below the viewport causes no layout shift.
const FeaturesSection = lazy(() => import("@/components/FeaturesSection").then((m) => ({ default: m.FeaturesSection })));
const TestimonialsSection = lazy(() => import("@/components/TestimonialsSection").then((m) => ({ default: m.TestimonialsSection })));
const NewsletterSection = lazy(() => import("@/components/NewsletterSection").then((m) => ({ default: m.NewsletterSection })));
const Footer = lazy(() => import("@/components/Footer").then((m) => ({ default: m.Footer })));

/**
 * The home page reads as one night out: the venue (hero), what's on sale,
 * how booking works, what people say, and a ticket to keep in touch.
 */
const Index = () => {
  return (
    <>
      <HeroSection />
      <CategoryTape />
      <FeaturedEvents />
      {/* One boundary, so the sections (and the footer) appear together, in order. */}
      <Suspense fallback={<div className="min-h-screen" aria-hidden="true" />}>
        <FeaturesSection />
        <TestimonialsSection />
        <NewsletterSection />
        <Footer />
      </Suspense>
    </>
  );
};

export default Index;
