import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Monitor, Moon, Sun, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { supabase } from "@/integrations/supabase/client";
import { getProfileSettings, requestEmailChange, updateProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Profile & account — Sendloop" },
      {
        name: "description",
        content: "Manage your Sendloop profile, avatar, appearance and account security.",
      },
      { property: "og:title", content: "Profile & account — Sendloop" },
      {
        property: "og:description",
        content: "Manage your Sendloop profile, avatar and account security.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Page() {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getProfileSettings);
  const saveProfile = useServerFn(updateProfile);
  const changeEmail = useServerFn(requestEmailChange);
  const { theme, setTheme } = useTheme();

  const profile = useQuery({ queryKey: ["profile-settings"], queryFn: () => fetchProfile() });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const storedAvatar = useAvatarUrl(profile.data?.avatar_url);
  const name = displayName || `${firstName} ${lastName}`.trim() || profile.data?.email || "";

  useEffect(() => {
    if (!profile.data) return;
    setFirstName(profile.data.first_name ?? "");
    setLastName(profile.data.last_name ?? "");
    setDisplayName(profile.data.display_name ?? profile.data.full_name ?? "");
    setEmail(profile.data.email ?? "");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          full_name: displayName || `${firstName} ${lastName}`.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Profile updated");
      void queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailChange = useMutation({
    mutationFn: () => changeEmail({ data: { email } }),
    onSuccess: () =>
      toast.success("Confirmation link sent. Your email changes once you confirm it."),
    onError: (e: Error) => toast.error(e.message),
  });

  const passwordChange = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error("Use at least 8 characters");
      if (password !== confirm) throw new Error("Passwords do not match");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPassword("");
      setConfirm("");
      toast.success("Password updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error("Use a JPG, PNG or WebP image");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Images must be 3 MB or smaller");
      return;
    }
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar() {
    if (!pendingFile || !profile.data) return;
    setUploading(true);
    try {
      const ext = pendingFile.type === "image/png" ? "png" : pendingFile.type === "image/webp" ? "webp" : "jpg";
      // Files live under a folder named after the user id; storage policies only
      // allow a customer to read or write inside their own folder.
      const path = `${profile.data.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
      if (error) throw new Error(error.message);

      const previousPath = profile.data.avatar_url;
      await saveProfile({ data: { avatar_url: path } });
      if (previousPath && !previousPath.startsWith("http")) {
        await supabase.storage.from("avatars").remove([previousPath]);
      }

      setPendingFile(null);
      setPreview(null);
      toast.success("Profile picture updated");
      void queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["avatar-url"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    const path = profile.data?.avatar_url;
    if (!path) return;
    if (!path.startsWith("http")) await supabase.storage.from("avatars").remove([path]);
    await saveProfile({ data: { avatar_url: null } });
    toast.success("Profile picture removed");
    void queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
    void queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  const themeOptions: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <AppShell title="Profile & account" description="Your personal details and security">
      <div className="mx-auto max-w-3xl">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <section className="surface-card space-y-4 p-6">
              <div>
                <h2 className="text-base font-semibold">Profile picture</h2>
                <p className="text-sm text-muted-foreground">
                  JPG, PNG or WebP up to 3 MB. Only you can access your uploaded file.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Avatar className="size-20">
                  {preview || storedAvatar ? (
                    <AvatarImage src={preview ?? storedAvatar ?? ""} alt="Your profile picture" />
                  ) : null}
                  <AvatarFallback className="text-lg">{initialsOf(name) || "S"}</AvatarFallback>
                </Avatar>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                  />
                  <Button variant="outline" onClick={() => fileInput.current?.click()}>
                    <Upload className="mr-2 size-4" /> Choose image
                  </Button>
                  {pendingFile ? (
                    <Button onClick={uploadAvatar} disabled={uploading}>
                      {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Save picture
                    </Button>
                  ) : null}
                  {profile.data?.avatar_url && !pendingFile ? (
                    <Button variant="ghost" onClick={removeAvatar}>
                      <Trash2 className="mr-2 size-4" /> Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="surface-card space-y-4 p-6">
              <h2 className="text-base font-semibold">Your details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="first">First name</Label>
                  <Input id="first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last">Last name</Label>
                  <Input id="last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="display">Display name</Label>
                  <Input
                    id="display"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <section className="surface-card space-y-4 p-6">
              <div>
                <h2 className="text-base font-semibold">Email address</h2>
                <p className="text-sm text-muted-foreground">
                  Changing your email sends a confirmation link. The change only applies once you
                  confirm it from the new address.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => emailChange.mutate()}
                disabled={emailChange.isPending || !email || email === profile.data?.email}
              >
                {emailChange.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Send confirmation link
              </Button>
            </section>

            <section className="surface-card space-y-4 p-6">
              <h2 className="text-base font-semibold">Password</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pw">New password</Label>
                  <Input
                    id="pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw2">Confirm password</Label>
                  <Input
                    id="pw2"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={() => passwordChange.mutate()}
                disabled={passwordChange.isPending || !password}
              >
                {passwordChange.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Update password
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="appearance">
            <section className="surface-card space-y-4 p-6">
              <div>
                <h2 className="text-base font-semibold">Appearance</h2>
                <p className="text-sm text-muted-foreground">
                  Applies across your dashboard and is remembered on this account.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setTheme(option.value);
                      void saveProfile({ data: { theme: option.value } });
                    }}
                    className={`flex items-center gap-2 rounded-lg border p-4 text-sm transition ${
                      theme === option.value
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <option.icon className="size-4" />
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
