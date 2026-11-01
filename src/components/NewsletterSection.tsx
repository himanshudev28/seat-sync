
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "@/components/ui/use-toast";

export function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({ title: "Thank you for subscribing to our newsletter!" });
      setEmail("");
    } catch (error) {
      toast({ title: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-20 md:py-28 relative overflow-hidden border-t border-border/50">
      {/* Gradient background — no inner card, the section itself is the canvas */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background dark:from-primary/8 dark:via-background dark:to-background" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-primary/15 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-primary/8 blur-[100px] pointer-events-none rounded-full" />

      <div className="container max-w-3xl mx-auto px-4 relative z-10 text-center animate-fadeIn">
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
          Never miss an event
        </h2>
        <p className="text-muted-foreground text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
          Get early access to exclusive events, presales, and platform updates — straight to your inbox.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1 h-12 px-4 bg-background/80 backdrop-blur-sm border-border/60 focus:border-primary/50"
          />
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 rounded-xl px-8 font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-shadow"
          >
            {isSubmitting ? "Subscribing…" : "Subscribe"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground mt-5">
          By subscribing, you agree to our Privacy Policy. Unsubscribe at any time.
        </p>
      </div>
    </section>
  );
}
