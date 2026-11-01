import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center animate-fadeIn motion-reduce:animate-none">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Compass className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="font-mono text-label text-muted-foreground mb-2">Error 404</p>
        <h1 className="font-display text-section text-foreground mb-3">This seat is empty</h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved. Let's get you back to the action.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="pill">
            <Link to="/"><Home className="mr-2 h-4 w-4" aria-hidden="true" />Back to home</Link>
          </Button>
          <Button asChild variant="secondary" size="pill">
            <Link to="/events">Browse events</Link>
          </Button>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
