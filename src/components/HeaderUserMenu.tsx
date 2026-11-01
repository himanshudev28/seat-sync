import type { ReactNode } from "react";
import { Tickets, User, LogOut, LayoutDashboard, BookOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderUserMenuProps {
  /** The trigger <button>, rendered by Header so its markup lives in one place. */
  trigger: ReactNode;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin: boolean;
  onNavigate: (to: string) => void;
  onSignOut: () => void;
}

/** Lazy-loaded (Radix DropdownMenu + floating-ui stay out of the entry chunk). Mounts already open. */
export default function HeaderUserMenu({
  trigger,
  email,
  firstName,
  lastName,
  isAdmin,
  onNavigate,
  onSignOut,
}: HeaderUserMenuProps) {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl p-2 bg-background/95 backdrop-blur-xl border border-border shadow-2xl mt-2">
        <DropdownMenuLabel className="font-normal px-2 py-1.5">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-semibold leading-none">{[firstName, lastName].filter(Boolean).join(" ") || "User"}</p>
            <p className="text-xs leading-none text-muted-foreground truncate">
              {email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/50 my-1" />
        <DropdownMenuItem onClick={() => onNavigate("/tickets")} className="rounded-lg cursor-pointer flex items-center gap-2 py-2 px-2 hover:bg-muted/60 transition-colors">
          <Tickets className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">My Tickets</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate("/profile")} className="rounded-lg cursor-pointer flex items-center gap-2 py-2 px-2 hover:bg-muted/60 transition-colors">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Profile</span>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuItem onClick={() => onNavigate("/admin")} className="rounded-lg cursor-pointer flex items-center gap-2 py-2 px-2 hover:bg-muted/60 transition-colors">
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Admin Dashboard</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("/admin/bookings")} className="rounded-lg cursor-pointer flex items-center gap-2 py-2 px-2 hover:bg-muted/60 transition-colors">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Manage Bookings</span>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator className="bg-border/50 my-1" />
        <DropdownMenuItem onClick={onSignOut} className="rounded-lg cursor-pointer flex items-center gap-2 py-2 px-2 text-destructive focus:text-destructive focus:bg-destructive/10 transition-colors">
          <LogOut className="h-4 w-4" />
          <span className="font-medium">Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
