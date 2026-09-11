/**
 * Shared media library for the blog CMS.
 *
 * Uploads go straight from the browser to the private storage bucket (admin
 * write policy), then a server function records the file so alt text and
 * captions live in the database with the rest of the content.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadFileToR2 } from "@/lib/file-storage";
import { formatBytes, mediaPublicUrl, type MediaItem } from "@/lib/blog-media";
import {
  deleteBlogMedia,
  listBlogMedia,
  registerBlogMedia,
  updateBlogMedia,
} from "@/lib/blog.functions";

export function useMediaLibrary() {
  const list = useServerFn(listBlogMedia);
  return useQuery({
    queryKey: ["blog-media"],
    queryFn: () => list(),
    staleTime: 30_000,
  });
}

export function useMediaUpload(folder = "library") {
  const queryClient = useQueryClient();
  const register = useServerFn(registerBlogMedia);

  return useMutation({
    mutationFn: async (file: File) => {
      const path = buildStoragePath(folder, file.name);
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/png",
      });
      if (error) throw new Error(error.message);
      const result = await register({
        data: {
          storagePath: path,
          publicUrl: mediaPublicUrl(path),
          fileName: file.name,
          mimeType: file.type || "image/png",
          sizeBytes: file.size,
          altText: "",
          caption: "",
          folder,
        },
      });
      return result.item as MediaItem;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["blog-media"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function UploadButton({
  folder = "library",
  label = "Upload image",
  onUploaded,
}: {
  folder?: string;
  label?: string;
  onUploaded?: (item: MediaItem) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const upload = useMediaUpload(folder);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const item = await upload.mutateAsync(file);
          toast.success("Image uploaded");
          onUploaded?.(item);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
        {upload.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
        {label}
      </Button>
    </>
  );
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSelect: (item: MediaItem) => void;
}) {
  const { data, isLoading } = useMediaLibrary();
  const items = (data?.items ?? []) as MediaItem[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>Pick an existing image or upload a new one.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{items.length} images</p>
          <UploadButton onUploaded={(item) => onSelect(item)} />
        </div>
        <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="group overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-primary"
              onClick={() => onSelect(item)}
            >
              <img src={item.public_url} alt={item.alt_text || item.file_name} className="h-24 w-full object-cover" />
              <span className="block truncate px-2 py-1.5 text-[11px] text-muted-foreground">{item.file_name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MediaLibraryPanel() {
  const { data, isLoading } = useMediaLibrary();
  const queryClient = useQueryClient();
  const update = useServerFn(updateBlogMedia);
  const remove = useServerFn(deleteBlogMedia);
  const [drafts, setDrafts] = useState<Record<string, { alt: string; caption: string }>>({});

  const items = (data?.items ?? []) as MediaItem[];

  const save = useMutation({
    mutationFn: (input: { id: string; altText: string; caption: string }) => update({ data: input }),
    onSuccess: () => {
      toast.success("Image details saved");
      void queryClient.invalidateQueries({ queryKey: ["blog-media"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const destroy = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Image deleted");
      void queryClient.invalidateQueries({ queryKey: ["blog-media"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Media library</h2>
          <p className="text-xs text-muted-foreground">
            Images available to every post, featured image slot and author avatar.
          </p>
        </div>
        <UploadButton />
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading library…</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const draft = drafts[item.id] ?? { alt: item.alt_text, caption: item.caption };
          return (
            <div key={item.id} className="surface-card space-y-3 p-3">
              <img src={item.public_url} alt={item.alt_text || item.file_name} className="h-36 w-full rounded-md object-cover" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">{item.file_name}</span>
                <span>{formatBytes(item.size_bytes)}</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Alt text</Label>
                <Input
                  value={draft.alt}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, alt: e.target.value } }))}
                  placeholder="Describe the image"
                />
                <Label className="text-xs">Caption</Label>
                <Input
                  value={draft.caption}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, caption: e.target.value } }))}
                  placeholder="Shown under the image"
                />
              </div>
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => save.mutate({ id: item.id, altText: draft.alt, caption: draft.caption })}
                  disabled={save.isPending}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => destroy.mutate(item.id)}
                  disabled={destroy.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
