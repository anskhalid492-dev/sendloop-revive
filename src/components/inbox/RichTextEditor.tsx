/**
 * Compact rich-text editor for the human composer (inbox reply + new email).
 *
 * Deliberately small: bold, italic, underline and links only, matching what the
 * send pipeline sanitizes and what email clients render everywhere. It is a
 * drop-in replacement for the textarea it used to be — the parent still owns the
 * HTML value and the plain-text equivalent.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2, Link2Off, Underline } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { safeLinkUrl, sanitizeComposerHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

type Marks = { bold: boolean; italic: boolean; underline: boolean; link: boolean };

const NO_MARKS: Marks = { bold: false, italic: false, underline: false, link: false };

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  minHeight = 160,
  ariaLabel,
  className,
}: {
  id?: string;
  /** Sanitized HTML. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const savedRange = useRef<Range | null>(null);

  // Only write into the DOM when the incoming value really differs, so typing
  // never loses the caret.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if ((value || "") !== el.innerHTML) el.innerHTML = value || "";
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    onChange(sanitizeComposerHtml(el.innerHTML));
  }, [onChange]);

  const refreshMarks = useCallback(() => {
    if (typeof document === "undefined") return;
    const el = ref.current;
    const selection = document.getSelection();
    const inside =
      el && selection?.anchorNode ? el.contains(selection.anchorNode) : false;
    if (!inside) {
      setMarks(NO_MARKS);
      return;
    }
    let link = false;
    let node: Node | null = selection?.anchorNode ?? null;
    while (node && node !== el) {
      if ((node as HTMLElement).tagName === "A") {
        link = true;
        break;
      }
      node = node.parentNode;
    }
    setMarks({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      link,
    });
  }, []);

  useEffect(() => {
    const handler = () => refreshMarks();
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [refreshMarks]);

  const run = useCallback(
    (command: "bold" | "italic" | "underline") => {
      ref.current?.focus();
      document.execCommand(command);
      emit();
      refreshMarks();
    },
    [emit, refreshMarks],
  );

  const rememberSelection = () => {
    const selection = document.getSelection();
    savedRange.current =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
  };

  const restoreSelection = () => {
    const range = savedRange.current;
    if (!range) return;
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const currentLink = () => {
    const selection = document.getSelection();
    let node: Node | null = selection?.anchorNode ?? null;
    while (node && node !== ref.current) {
      if ((node as HTMLElement).tagName === "A") return node as HTMLAnchorElement;
      node = node.parentNode;
    }
    return null;
  };

  const openLink = () => {
    rememberSelection();
    setLinkError(null);
    setLinkUrl(currentLink()?.getAttribute("href") ?? "");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = safeLinkUrl(linkUrl);
    if (!url) {
      setLinkError("Enter a web address like https://example.com");
      return;
    }
    ref.current?.focus();
    restoreSelection();
    const selection = document.getSelection();
    const existing = currentLink();
    if (existing && selection?.isCollapsed) {
      existing.setAttribute("href", url);
    } else if (selection?.isCollapsed) {
      document.execCommand("insertHTML", false, `<a href="${url}">${url}</a>`);
    } else {
      document.execCommand("createLink", false, url);
    }
    // Links from the composer always open in a new tab.
    ref.current?.querySelectorAll("a").forEach((anchor) => {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    });
    setLinkOpen(false);
    emit();
    refreshMarks();
  };

  const removeLink = () => {
    ref.current?.focus();
    restoreSelection();
    const anchor = currentLink();
    if (anchor && document.getSelection()?.isCollapsed) {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.execCommand("unlink");
    setLinkOpen(false);
    emit();
    refreshMarks();
  };

  const toolButton = (
    label: string,
    active: boolean,
    icon: React.ReactNode,
    onClick: () => void,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            active && "bg-primary/10 text-primary",
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
        {toolButton("Bold (Ctrl+B)", marks.bold, <Bold className="h-3.5 w-3.5" />, () =>
          run("bold"),
        )}
        {toolButton("Italic (Ctrl+I)", marks.italic, <Italic className="h-3.5 w-3.5" />, () =>
          run("italic"),
        )}
        {toolButton(
          "Underline (Ctrl+U)",
          marks.underline,
          <Underline className="h-3.5 w-3.5" />,
          () => run("underline"),
        )}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <Popover
          open={linkOpen}
          onOpenChange={(open) => {
            setLinkOpen(open);
            if (!open) setLinkError(null);
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={marks.link ? "Edit link" : "Add link"}
                  aria-pressed={marks.link}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={openLink}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    marks.link && "bg-primary/10 text-primary",
                  )}
                >
                  <Link2 className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">{marks.link ? "Edit link" : "Add link"}</TooltipContent>
          </Tooltip>
          <PopoverContent align="start" className="w-72 space-y-2 p-3">
            <p className="text-xs font-medium">Link address</p>
            <Input
              autoFocus
              value={linkUrl}
              placeholder="https://example.com"
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
            />
            {linkError ? <p className="text-xs text-destructive">{linkError}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={applyLink}>
                {marks.link ? "Update link" : "Add link"}
              </Button>
              {marks.link ? (
                <Button type="button" size="sm" variant="ghost" onClick={removeLink}>
                  <Link2Off className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      </TooltipProvider>

      <div
        id={id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel ?? "Message"}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? "Write your message…"}
        style={{ minHeight }}
        onInput={emit}
        onBlur={emit}
        onKeyUp={refreshMarks}
        onMouseUp={refreshMarks}
        onKeyDown={(event) => {
          if (!(event.metaKey || event.ctrlKey)) return;
          const key = event.key.toLowerCase();
          if (key === "b" || key === "i" || key === "u") {
            event.preventDefault();
            run(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
          }
          if (key === "k") {
            event.preventDefault();
            openLink();
          }
        }}
        onPaste={(event) => {
          // Paste as text so foreign styling never enters the email.
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          emit();
        }}
        className={cn(
          "max-h-[40vh] overflow-y-auto px-3 py-2 text-sm leading-6 outline-none",
          "empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
          "[&_a]:text-primary [&_a]:underline",
        )}
      />
    </div>
  );
}
