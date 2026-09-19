/**
 * Settings → Email Signature.
 *
 * One place to manage a signature per connected mailbox. The editor writes
 * simple, email-client friendly HTML; the same pure renderer the sending
 * pipeline uses produces the preview, and the server sanitizes and stores it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Globe,
  Image as ImageIcon,
  Italic,
  Link2,
  Loader2,
  Mail,
  Phone,
  Trash2,
  Underline,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MAX_SIGNATURE_IMAGE_BYTES,
  isSignatureImageMimeType,
} from "@/lib/files-model";
import {
  PREVIEW_DISCLAIMER,
  PREVIEW_SENDER_FIELDS,
  SIGNATURE_SENDER_TOKENS,
  emptySenderFields,
  renderSignature,
  sanitizeSignatureHtml,
  signatureHtmlToText,
  type SignatureSenderFields,
} from "@/lib/signature-model";
import {
  confirmSignatureImageUpload,
  deleteMailboxSignature,
  listMailboxSignatures,
  requestSignatureImageUpload,
  saveMailboxSignature,
  type SignatureMailbox,
} from "@/lib/signatures.functions";

const DEFAULT_HTML =
  '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">' +
  "Best regards,<br><br>" +
  "<strong>{{first_name}} {{last_name}}</strong><br>" +
  "{{job_title}}<br>" +
  "{{company}}<br>" +
  "{{phone}}<br>" +
  '<a href="{{website}}">{{website}}</a>' +
  "</div>";

const FONT_SIZES = [
  { value: "2", label: "Small" },
  { value: "3", label: "Normal" },
  { value: "4", label: "Large" },
  { value: "5", label: "Extra large" },
];

function exec(command: string, value?: string) {
  try {
    document.execCommand(command, false, value);
  } catch {
    /* Older engines simply ignore an unsupported command. */
  }
}

export function SignatureTab({ workspaceId }: { workspaceId: string | null }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMailboxSignatures);
  const saveFn = useServerFn(saveMailboxSignature);
  const deleteFn = useServerFn(deleteMailboxSignature);
  const uploadFn = useServerFn(requestSignatureImageUpload);
  const confirmFn = useServerFn(confirmSignatureImageUpload);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [mailboxId, setMailboxId] = useState<string>("");
  const [name, setName] = useState("Signature");
  const [enabled, setEnabled] = useState(true);
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [plainText, setPlainText] = useState("");
  const [fields, setFields] = useState<SignatureSenderFields>(emptySenderFields());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const query = useQuery({
    queryKey: ["mailbox-signatures", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const mailboxes: SignatureMailbox[] = query.data?.mailboxes ?? [];
  const selected = mailboxes.find((m) => m.mailboxId === mailboxId) ?? mailboxes[0] ?? null;

  // Load the selected mailbox's stored signature into the editor.
  useEffect(() => {
    if (!selected) return;
    if (mailboxId !== selected.mailboxId) setMailboxId(selected.mailboxId);
    const row = selected.signature;
    setName(row?.name ?? "Signature");
    setEnabled(row?.enabled ?? true);
    setHtml(row?.html || DEFAULT_HTML);
    setPlainText(row?.text ?? "");
    setFields(row?.senderFields ?? emptySenderFields());
    if (editorRef.current) editorRef.current.innerHTML = row?.html || DEFAULT_HTML;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.mailboxId, selected?.signature?.updatedAt]);

  const previewFields = useMemo(() => {
    const merged: SignatureSenderFields = { ...emptySenderFields() };
    let examples = false;
    for (const token of SIGNATURE_SENDER_TOKENS) {
      const own = fields[token];
      const mailboxValue =
        token === "email" ? (selected?.email ?? "") : token === "first_name" ? (selected?.displayName ?? "").split(" ")[0] ?? "" : "";
      const value = own || mailboxValue;
      if (value) merged[token] = value;
      else {
        merged[token] = PREVIEW_SENDER_FIELDS[token];
        examples = true;
      }
    }
    return { merged, examples };
  }, [fields, selected?.email, selected?.displayName]);

  const preview = useMemo(
    () =>
      renderSignature(
        { html_signature: html, plain_text_signature: plainText, enabled: true },
        previewFields.merged,
      ),
    [html, plainText, previewFields.merged],
  );

  const readEditor = () => {
    const value = editorRef.current?.innerHTML ?? "";
    setHtml(value);
    return value;
  };

  const save = useMutation({
    mutationFn: (ids: string[]) =>
      saveFn({
        data: {
          workspaceId: workspaceId!,
          mailboxIds: ids,
          name: name.trim() || "Signature",
          html: sanitizeSignatureHtml(readEditor()),
          text: plainText.trim() || signatureHtmlToText(sanitizeSignatureHtml(readEditor())),
          enabled,
          senderFields: fields,
        },
      }),
    onSuccess: (result, ids) => {
      void queryClient.invalidateQueries({ queryKey: ["mailbox-signatures", workspaceId] });
      if (result.failedCount) {
        toast.warning(
          `Signature applied to ${result.updated} mailbox${result.updated === 1 ? "" : "es"}, ${result.failedCount} failed.`,
        );
      } else if (ids.length > 1) {
        toast.success(`Signature applied to ${result.updated} mailboxes.`);
      } else {
        toast.success("Signature saved.");
      }
      setBulkOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { workspaceId: workspaceId!, mailboxId: selected!.mailboxId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mailbox-signatures", workspaceId] });
      setHtml(DEFAULT_HTML);
      setPlainText("");
      if (editorRef.current) editorRef.current.innerHTML = DEFAULT_HTML;
      toast.success("Signature removed. Emails from this mailbox send without a signature.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function insertImage(file: File) {
    if (!workspaceId) return;
    if (!isSignatureImageMimeType(file.type)) {
      toast.error("Signature images must be PNG, JPEG, WebP or GIF.");
      return;
    }
    if (file.size > MAX_SIGNATURE_IMAGE_BYTES) {
      toast.error("Signature images must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const prepared = await uploadFn({
        data: {
          workspaceId,
          mailboxId: selected?.mailboxId ?? null,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        },
      });
      const response = await fetch(prepared.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!response.ok) throw new Error("The image could not be uploaded.");
      const confirmed = await confirmFn({ data: { key: prepared.key, status: "ready" } });
      const url = confirmed.url || prepared.url;
      editorRef.current?.focus();
      exec("insertHTML", `<img src="${url}" alt="" width="140" style="max-width:220px;height:auto;">`);
      readEditor();
      toast.success("Image added to the signature.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  function insertLink(kind: "url" | "email" | "phone") {
    const question =
      kind === "email" ? "Email address" : kind === "phone" ? "Phone number" : "Link address (https://…)";
    const value = window.prompt(question, kind === "url" ? "https://" : "");
    if (!value) return;
    const href =
      kind === "email" ? `mailto:${value.trim()}` : kind === "phone" ? `tel:${value.replace(/\s+/g, "")}` : value.trim();
    editorRef.current?.focus();
    exec("insertHTML", `<a href="${href}">${value.trim()}</a>`);
    readEditor();
  }

  if (!workspaceId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
          <CardDescription>Select a workspace to manage signatures.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
          <CardDescription>
            Each connected mailbox has its own signature. It is added to campaign emails, follow-ups,
            manual emails and inbox replies sent from that mailbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading mailboxes…
            </div>
          ) : mailboxes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Connect a mailbox under Email Accounts first — signatures belong to a mailbox.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Mailbox</Label>
                  <Select value={selected?.mailboxId ?? ""} onValueChange={setMailboxId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a mailbox" />
                    </SelectTrigger>
                    <SelectContent>
                      {mailboxes.map((mailbox) => (
                        <SelectItem key={mailbox.mailboxId} value={mailbox.mailboxId}>
                          {mailbox.email}
                          {mailbox.signature ? "" : " — no signature"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signature-name">Signature name</Label>
                  <Input
                    id="signature-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {selected?.signature ? "Signature configured" : "No signature configured"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selected?.signature
                      ? "Disabled signatures are simply left out of outgoing emails."
                      : "Write one below and save it to start using it."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="signature-enabled" className="text-sm">
                    Enabled
                  </Label>
                  <Switch id="signature-enabled" checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>

              {/* Editor */}
              <div className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
                  <Button type="button" variant="ghost" size="icon" onClick={() => exec("bold")} title="Bold">
                    <Bold className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => exec("italic")} title="Italic">
                    <Italic className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => exec("underline")}
                    title="Underline"
                  >
                    <Underline className="size-4" />
                  </Button>
                  <Select onValueChange={(value) => exec("fontSize", value)}>
                    <SelectTrigger className="h-9 w-32">
                      <SelectValue placeholder="Font size" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => exec("justifyLeft")}
                    title="Align left"
                  >
                    <AlignLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => exec("justifyCenter")}
                    title="Align centre"
                  >
                    <AlignCenter className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => exec("justifyRight")}
                    title="Align right"
                  >
                    <AlignRight className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => insertLink("url")} title="Website link">
                    <Link2 className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => insertLink("email")} title="Email link">
                    <Mail className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => insertLink("phone")} title="Phone link">
                    <Phone className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileRef.current?.click()}
                    title="Insert image or logo"
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void insertImage(file);
                    }}
                  />
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={readEditor}
                  onBlur={readEditor}
                  className="min-h-32 p-3 text-sm outline-none [&_a]:text-primary [&_a]:underline"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {SIGNATURE_SENDER_TOKENS.map((token) => (
                  <Button
                    key={token}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="font-mono text-xs"
                    onClick={() => {
                      editorRef.current?.focus();
                      exec("insertText", `{{${token}}}`);
                      readEditor();
                    }}
                  >
                    {`{{${token}}}`}
                  </Button>
                ))}
              </div>

              {/* Sender details used by the variables above */}
              <div className="grid gap-3 sm:grid-cols-2">
                {SIGNATURE_SENDER_TOKENS.map((token) => (
                  <div key={token} className="space-y-1.5">
                    <Label htmlFor={`sig-${token}`} className="capitalize">
                      {token.replace(/_/g, " ")}
                    </Label>
                    <Input
                      id={`sig-${token}`}
                      value={fields[token]}
                      placeholder={
                        token === "email" ? (selected?.email ?? PREVIEW_SENDER_FIELDS[token]) : PREVIEW_SENDER_FIELDS[token]
                      }
                      onChange={(event) =>
                        setFields((current) => ({ ...current, [token]: event.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signature-text">Plain-text version (optional)</Label>
                <Textarea
                  id="signature-text"
                  rows={4}
                  value={plainText}
                  placeholder="Left empty, a readable text version is generated from the signature above."
                  onChange={(event) => setPlainText(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => selected && save.mutate([selected.mailboxId])}
                  disabled={save.isPending || !selected}
                >
                  {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Save signature
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkIds(selected ? [selected.mailboxId] : []);
                    setBulkOpen(true);
                  }}
                  disabled={mailboxes.length < 2}
                >
                  <Users className="mr-2 size-4" />
                  Apply to multiple mailboxes
                </Button>
                {selected?.signature ? (
                  <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
                    <Trash2 className="mr-2 size-4" />
                    Delete signature
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {mailboxes.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              {previewFields.examples ? PREVIEW_DISCLAIMER : "Using this mailbox's own details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Hi John,
                <br />
                <br />I wanted to follow up regarding the proposal.
              </p>
              <div
                className="text-sm [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: preview?.html ?? "" }}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Plain-text version</p>
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs">
                {preview?.text || "—"}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply signature to multiple mailboxes</DialogTitle>
            <DialogDescription>
              Only the mailboxes you tick are changed. Everything else stays exactly as it is.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {mailboxes.map((mailbox) => (
              <label
                key={mailbox.mailboxId}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border border-border p-2 text-sm",
                  bulkIds.includes(mailbox.mailboxId) && "border-primary/50 bg-primary/5",
                )}
              >
                <Checkbox
                  checked={bulkIds.includes(mailbox.mailboxId)}
                  onCheckedChange={(checked) =>
                    setBulkIds((current) =>
                      checked
                        ? [...new Set([...current, mailbox.mailboxId])]
                        : current.filter((id) => id !== mailbox.mailboxId),
                    )
                  }
                />
                <span className="flex-1">{mailbox.email}</span>
                {mailbox.signature ? (
                  <Badge variant="outline" className="text-xs">
                    Will be replaced
                  </Badge>
                ) : null}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate(bulkIds)}
              disabled={bulkIds.length === 0 || save.isPending}
            >
              {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Apply this signature to {bulkIds.length} mailbox{bulkIds.length === 1 ? "" : "es"}?
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {query.data && query.data.storageReady === false ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="size-3.5" /> Signature storage is not ready yet — emails keep sending
          normally until it is.
        </p>
      ) : null}
    </div>
  );
}
