import { useEffect, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { claimExitIntentSession, shouldShowExitIntent } from "./exit-intent";

export function ExitIntentPopup({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    const startedAt = performance.now();
    let interacted = false;
    let claimed = false;
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onMove = () => { interacted = true; };
    const onLeave = (event: MouseEvent) => {
      if (claimed || !shouldShowExitIntent({
        enabled,
        finePointer: pointer.matches,
        elapsedMs: performance.now() - startedAt,
        interacted,
        leavingTop: event.relatedTarget === null && event.clientY <= 0,
        pageVisible: document.visibilityState === "visible",
        anotherDialogOpen: Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]')),
      })) return;
      // Accessing sessionStorage itself can throw, not just its methods.
      let storage: Pick<Storage, "getItem" | "setItem">;
      try { storage = window.sessionStorage; }
      catch { storage = { getItem: () => null, setItem: () => {} }; }
      if (!claimExitIntentSession(storage)) return;
      claimed = true;
      setOpen(true);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [enabled]);

  return (
    <Dialog open={open && enabled} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogPrimitive.Overlay className="exit-intent-overlay fixed inset-0 z-[100] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 duration-200" />
        <DialogPrimitive.Content className="exit-intent-popup fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-[580px] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl px-6 pb-7 pt-14 text-center sm:px-10 sm:pb-8 sm:pt-16 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 duration-200">
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close popup" className="absolute right-3 top-3 rounded-full border border-primary/25 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
          <DialogTitle className="text-[28px] font-extrabold leading-[1.25] tracking-normal sm:text-[34px]">
            <span className="block">Not Sure Where To Start?</span>
            <span className="mt-1 block">Let's Talk About Cold Email.</span>
          </DialogTitle>
          <DialogDescription className="mx-auto mt-5 max-w-[430px] text-base leading-relaxed text-muted-foreground">
            If you're starting out with cold email or looking to improve your campaigns, let's have a quick conversation.
          </DialogDescription>
          <Button asChild size="lg" className="mt-8 h-12 w-full rounded-lg text-base font-semibold">
            <a href="https://www.linkedin.com/in/meanuskhalid/" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              Talk to the Founder <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" className="mt-3 h-10 text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary">Maybe later</Button>
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}