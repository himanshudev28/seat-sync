import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "./alert-dialog";

// Opened from state (open + onOpenChange) with a plain button: the pattern the admin pages use. Radix alone only
// restores focus to its own <DialogTrigger>, so without useReturnFocus focus would fall to <body>.
function StateDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Create New Event</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Create New Event</DialogTitle>
          <DialogDescription>Fill in the details.</DialogDescription>
          <input aria-label="Title" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function StateAlert() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Cancel booking</button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          <AlertDialogCancel>Keep booking</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

describe("focus returns to the opener for state-opened dialogs", () => {
  it("Dialog: Escape returns focus to the button that opened it", async () => {
    render(<StateDialog />);
    const opener = screen.getByRole("button", { name: "Create New Event" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    // Radix restores focus in a setTimeout after unmount.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("AlertDialog: closing with Cancel returns focus to the opener", async () => {
    render(<StateAlert />);
    const opener = screen.getByRole("button", { name: "Cancel booking" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Keep booking" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
