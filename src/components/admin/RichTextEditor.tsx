/**
 * WordPress-style rich text editor for the blog CMS.
 *
 * Everything the editor produces is plain HTML stored on the post, so the
 * public article page can render it directly. Links carry the full WordPress
 * link options (new tab, title, rel=nofollow/sponsored/ugc, internal search),
 * headings can carry anchor IDs for #section links, and images come from the
 * shared media library with alt text and captions.
 */
import { useCallback, useEffect, useState } from "react";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Youtube from "@tiptap/extension-youtube";
import { TableKit } from "@tiptap/extension-table";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Hash,
  Image as ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Undo2,
  Youtube as YoutubeIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaPickerDialog } from "@/components/admin/MediaLibrary";
import type { MediaItem } from "@/lib/blog-media";
import { InternalLinkSearch } from "@/components/admin/InternalLinkSearch";

/** Anchor IDs on headings/paragraphs power in-page #section links. */
const AnchorId = Extension.create({
  name: "anchorId",
  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph"],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("id"),
            renderHTML: (attributes) => (attributes["id"] ? { id: attributes["id"] } : {}),
          },
        },
      },
    ];
  },
});

/** Links keep a title attribute like the WordPress link editor does. */
const LinkTitle = Extension.create({
  name: "linkTitle",
  addGlobalAttributes() {
    return [
      {
        types: ["link"],
        attributes: {
          title: {
            default: null,
            parseHTML: (element) => element.getAttribute("title"),
            renderHTML: (attributes) => (attributes["title"] ? { title: attributes["title"] } : {}),
          },
        },
      },
    ];
  },
});

type LinkState = {
  href: string;
  text: string;
  title: string;
  newTab: boolean;
  nofollow: boolean;
  sponsored: boolean;
  ugc: boolean;
};

const emptyLink: LinkState = {
  href: "",
  text: "",
  title: "",
  newTab: false,
  nofollow: false,
  sponsored: false,
  ugc: false,
};

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="size-8 p-0"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>(emptyLink);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [anchorValue, setAnchorValue] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: null, target: null },
        },
      }),
      AnchorId,
      LinkTitle,
      Image.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Youtube.configure({ width: 720, height: 405, nocookie: true }),
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose-editor min-h-[420px] w-full max-w-none rounded-b-lg bg-background px-4 py-4 text-sm leading-relaxed focus:outline-none",
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  // Keep the editor in sync when a different post is loaded into the form.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== current) editor.commands.setContent(value || "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const attrs = editor.getAttributes("link") as Record<string, string | null>;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, " ");
    const rel = attrs["rel"] ?? "";
    setLinkState({
      href: attrs["href"] ?? "",
      text: selected,
      title: attrs["title"] ?? "",
      newTab: attrs["target"] === "_blank",
      nofollow: rel.includes("nofollow"),
      sponsored: rel.includes("sponsored"),
      ugc: rel.includes("ugc"),
    });
    setLinkOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const href = linkState.href.trim();
    if (!href) return;
    const rel = [
      linkState.nofollow ? "nofollow" : null,
      linkState.sponsored ? "sponsored" : null,
      linkState.ugc ? "ugc" : null,
      linkState.newTab ? "noopener noreferrer" : null,
    ]
      .filter(Boolean)
      .join(" ");

    const attrs: Record<string, string | null> = {
      href,
      target: linkState.newTab ? "_blank" : null,
      rel: rel || null,
      title: linkState.title.trim() || null,
    };

    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const anchorText = linkState.text.trim();

    if (!hasSelection && anchorText) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: anchorText, marks: [{ type: "link", attrs }] })
        .run();
    } else if (hasSelection && anchorText && anchorText !== editor.state.doc.textBetween(from, to, " ")) {
      editor
        .chain()
        .focus()
        .deleteSelection()
        .insertContent({ type: "text", text: anchorText, marks: [{ type: "link", attrs }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink(attrs as any).run();
    }
    setLinkOpen(false);
  }, [editor, linkState]);

  const insertMedia = useCallback(
    (item: MediaItem) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .setImage({ src: item.public_url, alt: item.alt_text || item.file_name, title: item.caption || undefined })
        .run();
      if (item.caption) {
        editor.chain().focus().createParagraphNear().insertContent(`<em>${item.caption}</em>`).run();
      }
      setMediaOpen(false);
    },
    [editor],
  );

  if (!editor) {
    return <div className="h-[480px] animate-pulse rounded-lg border border-border bg-muted/30" />;
  }

  const headingValue = [1, 2, 3, 4, 5, 6].find((level) => editor.isActive("heading", { level }));

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border-b border-border bg-muted/40 px-2 py-1.5">
        <Select
          value={headingValue ? `h${headingValue}` : "p"}
          onValueChange={(next) => {
            if (next === "p") editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(next.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 })
                .run();
          }}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="p">Paragraph</SelectItem>
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <SelectItem key={level} value={`h${level}`}>
                Heading {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <span className="text-[10px] font-semibold">{"</>"}</span>
        </ToolbarButton>
        <ToolbarButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton label="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <AlignLeft className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <AlignCenter className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <AlignRight className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton label="Add link" active={editor.isActive("link")} onClick={openLinkDialog}>
          <Link2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Remove link"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        >
          <Link2Off className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Anchor ID"
          onClick={() => {
            const attrs = editor.getAttributes(editor.isActive("heading") ? "heading" : "paragraph");
            setAnchorValue((attrs["id"] as string) ?? "");
            setAnchorOpen(true);
          }}
        >
          <Hash className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton label="Insert image" onClick={() => setMediaOpen(true)}>
          <ImageIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Embed video"
          onClick={() => {
            const url = window.prompt("Video URL (YouTube)");
            if (url) editor.commands.setYoutubeVideo({ src: url });
          }}
        >
          <YoutubeIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Insert table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon className="size-4" />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="size-4" />
        </ToolbarButton>
      </div>

      {editor.isActive("table") ? (
        <div className="flex flex-wrap gap-1 border-b border-border bg-muted/20 px-2 py-1 text-xs">
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => editor.chain().focus().addRowAfter().run()}>
            + Row
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            + Column
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => editor.chain().focus().deleteRow().run()}>
            Delete row
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => editor.chain().focus().deleteColumn().run()}>
            Delete column
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => editor.chain().focus().deleteTable().run()}>
            Delete table
          </Button>
        </div>
      ) : null}

      <EditorContent editor={editor} />

      <LinkDialog
        open={linkOpen}
        state={linkState}
        onOpenChange={setLinkOpen}
        onChange={setLinkState}
        onApply={applyLink}
      />

      <MediaPickerDialog open={mediaOpen} onOpenChange={setMediaOpen} onSelect={insertMedia} />

      <AnchorDialog
        open={anchorOpen}
        value={anchorValue}
        onValueChange={setAnchorValue}
        onOpenChange={setAnchorOpen}
        onApply={() => {
          const id = anchorValue.trim().replace(/^#/, "");
          const type = editor.isActive("heading") ? "heading" : "paragraph";
          editor.chain().focus().updateAttributes(type, { id: id || null }).run();
          setAnchorOpen(false);
        }}
      />
    </div>
  );
}

function AnchorDialog({
  open,
  value,
  onValueChange,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  value: string;
  onValueChange: (next: string) => void;
  onOpenChange: (next: boolean) => void;
  onApply: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>HTML anchor</DialogTitle>
          <DialogDescription>
            Give this block an ID so it can be linked with #your-anchor from anywhere on the site.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="anchor-id">Anchor ID</Label>
          <Input id="anchor-id" value={value} onChange={(e) => onValueChange(e.target.value)} placeholder="deliverability-checklist" />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onApply}>
            Save anchor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({
  open,
  state,
  onOpenChange,
  onChange,
  onApply,
}: {
  open: boolean;
  state: LinkState;
  onOpenChange: (next: boolean) => void;
  onChange: (next: LinkState) => void;
  onApply: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add link</DialogTitle>
          <DialogDescription>
            Paste an external URL, search a Sendloop page or blog post, or link to an anchor like #section.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              value={state.href}
              onChange={(e) => onChange({ ...state, href: e.target.value })}
              placeholder="https://example.com or /pricing or #section"
            />
          </div>

          <InternalLinkSearch onPick={(href, label) => onChange({ ...state, href, text: state.text || label })} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="link-text">Anchor text</Label>
              <Input
                id="link-text"
                value={state.text}
                onChange={(e) => onChange({ ...state, text: e.target.value })}
                placeholder="Leave blank to keep selected text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-title">Link title</Label>
              <Input
                id="link-title"
                value={state.title}
                onChange={(e) => onChange({ ...state, title: e.target.value })}
                placeholder="Shown on hover"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["newTab", "Open in new tab"],
              ["nofollow", "Add rel=nofollow"],
              ["sponsored", "Add rel=sponsored"],
              ["ugc", "Add rel=ugc"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{label}</span>
                <Switch
                  checked={Boolean(state[key as keyof LinkState])}
                  onCheckedChange={(checked) => onChange({ ...state, [key]: checked } as LinkState)}
                />
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onApply} disabled={!state.href.trim()}>
            Apply link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { Editor };
