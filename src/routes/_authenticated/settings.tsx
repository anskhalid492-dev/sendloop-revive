import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Building2,
  KeyRound,
  CreditCard,
  Loader2,
  Monitor,
  Moon,
  Palette,
  Plug,
  Send,
  Shield,
  ShieldAlert,
  Sun,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getProfileSettings, requestEmailChange, updateProfile } from "@/lib/profile.functions";
import { getSecurityOverview } from "@/lib/settings.functions";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { SendingTab } from "@/components/settings/SendingTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { ApiKeysTab } from "@/components/settings/ApiKeysTab";
import { BillingTab } from "@/components/settings/BillingTab";
import { DeleteAccountCard } from "@/components/settings/DeleteAccountCard";
import {
  DangerTab,
  GeneralTab,
  PermissionsTab,
  TeamTab,
} from "@/routes/_authenticated/workspace";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MunchReach" },
      {
        name: "description",
        content:
          "Manage your MunchReach profile, workspace, team, notifications, sending schedule, security, appearance and billing.",
      },
      { property: "og:title", content: "Settings — MunchReach" },
      {
        property: "og:description",
        content: "Profile, workspace, team, notifications, sending, security and billing settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "sending", label: "Email & Sending", icon: Send },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "api", label: "Developer API", icon: KeyRound },
  { id: "security", label: "Security", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "danger", label: "Danger Zone", icon: ShieldAlert },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function roleRank(role: string) {
  return role === "owner" ? 3 : role === "admin" ? 2 : 1;
}

function Page() {
  const [section, setSection] = useState<SectionId>("profile");
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? null;
  const myRole = workspace?.role ?? "member";
  const canManage = roleRank(myRole) >= 2;
  const isOwner = myRole === "owner";

  return (
    <AppShell title="Settings" description="Your account, workspace and sending preferences">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="surface-card h-fit p-2 lg:sticky lg:top-4">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((item) => (
              <li key={item.id} className="shrink-0 lg:w-full">
                <button
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition",
                    section === item.id
                      ? "bg-primary/10 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    item.id === "danger" && section === item.id ? "text-destructive" : "",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {section === "profile" ? <ProfileSection /> : null}

          {section === "workspace" ? (
            workspaceId ? (
              <GeneralTab workspaceId={workspaceId} canEdit={canManage} />
            ) : (
              <div className="surface-card p-6 text-sm text-muted-foreground">
                Create a workspace to manage its settings.
              </div>
            )
          ) : null}

          {section === "team" ? (
            workspaceId ? (
              <div className="space-y-6">
                <TeamTab workspaceId={workspaceId} myRole={myRole} canManage={canManage} />
                <PermissionsTab myRole={myRole} />
              </div>
            ) : (
              <div className="surface-card p-6 text-sm text-muted-foreground">
                Create a workspace to invite teammates.
              </div>
            )
          ) : null}

          {section === "notifications" ? <NotificationsTab /> : null}
          {section === "sending" ? <SendingTab workspaceId={workspaceId} /> : null}
          {section === "integrations" ? <IntegrationsTab /> : null}
          {section === "api" ? <ApiKeysTab workspaceId={workspaceId} /> : null}
          {section === "security" ? <SecuritySection /> : null}
          {section === "appearance" ? <AppearanceSection /> : null}
          {section === "billing" ? <BillingTab workspaceId={workspaceId} /> : null}

          {section === "danger" ? (
            <div className="space-y-6">
              {workspaceId ? <DangerTab workspaceId={workspaceId} isOwner={isOwner} /> : null}
              <DeleteAccountCard />
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function ProfileSection() {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getProfileSettings);
  const saveProfile = useServerFn(updateProfile);

  const profile = useQuery({ queryKey: ["profile-settings"], queryFn: () => fetchProfile() });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
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
    setTimezone(profile.data.timezone ?? "UTC");
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          full_name: displayName || `${firstName} ${lastName}`.trim() || undefined,
          timezone,
        },
      }),
    onSuccess: () => {
      toast.success("Profile updated");
      void queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
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

  /**
   * The avatar reference is written straight from the authenticated browser
   * client. Routing this through a server function added a round-trip that
   * could stall behind the edge proxy and surface as an HTTP 504, while the
   * storage upload itself had already succeeded.
   */
  async function setAvatarPath(userId: string, avatarPath: string | null) {
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarPath })
      .eq("id", userId);
    if (error) throw new Error(error.message);
  }

  function refreshAvatarQueries() {
    void queryClient.invalidateQueries({ queryKey: ["profile-settings"] });
    void queryClient.invalidateQueries({ queryKey: ["profile"] });
    void queryClient.invalidateQueries({ queryKey: ["avatar-url"] });
  }

  async function uploadAvatar() {
    if (!pendingFile || !profile.data) return;
    setUploading(true);
    try {
      const ext =
        pendingFile.type === "image/png" ? "png" : pendingFile.type === "image/webp" ? "webp" : "jpg";
      // Files live under a folder named after the user id; storage policies only
      // allow a customer to read or write inside their own folder. The random
      // suffix keeps every upload on a unique, cache-safe path.
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `${profile.data.id}/avatar-${unique}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
      if (error) throw new Error(error.message);

      const previousPath = profile.data.avatar_url;
      await setAvatarPath(profile.data.id, path);
      if (previousPath && !previousPath.startsWith("http") && previousPath !== path) {
        // Best effort cleanup; a leftover old file must never fail the upload.
        void supabase.storage.from("avatars").remove([previousPath]);
      }

      setPendingFile(null);
      setPreview(null);
      toast.success("Profile picture updated");
      refreshAvatarQueries();
    } catch (e) {
      toast.error((e as Error).message || "Upload failed, please try again");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    const path = profile.data?.avatar_url;
    if (!path || !profile.data) return;
    setUploading(true);
    try {
      await setAvatarPath(profile.data.id, null);
      if (!path.startsWith("http")) {
        void supabase.storage.from("avatars").remove([path]);
      }
      toast.success("Profile picture removed");
      refreshAvatarQueries();
    } catch (e) {
      toast.error((e as Error).message || "Could not remove the picture");
    } finally {
      setUploading(false);
    }
  }

  if (profile.isLoading) {
    return (
      <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([timezone, ...TIMEZONES])).map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={profile.data?.email ?? ""} readOnly disabled />
            <p className="text-xs text-muted-foreground">Change your email under Security.</p>
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </section>
    </div>
  );
}

function SecuritySection() {
  const fetchProfile = useServerFn(getProfileSettings);
  const fetchSecurity = useServerFn(getSecurityOverview);
  const changeEmail = useServerFn(requestEmailChange);

  const profile = useQuery({ queryKey: ["profile-settings"], queryFn: () => fetchProfile() });
  const overview = useQuery({ queryKey: ["security-overview"], queryFn: () => fetchSecurity() });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (profile.data?.email) setEmail(profile.data.email);
  }, [profile.data]);

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

  async function signOutOthers() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw new Error(error.message);
      toast.success("Signed out of your other sessions");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface-card space-y-3 p-6">
        <h2 className="text-base font-semibold">Account</h2>
        {overview.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Account email</dt>
              <dd>{overview.data?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email confirmed</dt>
              <dd>{overview.data?.emailConfirmed ? "Yes" : "Not yet"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sign-in method</dt>
              <dd className="capitalize">{overview.data?.provider ?? "email"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd>
                {overview.data?.lastSignInAt
                  ? new Date(overview.data.lastSignInAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
        )}
        <p className="text-xs text-muted-foreground">
          MunchReach never shows API keys, connection credentials or encryption secrets in the
          dashboard.
        </p>
      </section>

      <section className="surface-card space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold">Email address</h2>
          <p className="text-sm text-muted-foreground">
            Changing your email sends a confirmation link. The change only applies once you confirm
            it from the new address.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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

      <section className="surface-card space-y-3 p-6">
        <h2 className="text-base font-semibold">Sessions</h2>
        <p className="text-sm text-muted-foreground">
          Signed in on another device? Sign out everywhere except this browser.
        </p>
        <Button variant="outline" onClick={signOutOthers} disabled={signingOut}>
          {signingOut ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Sign out of other sessions
        </Button>
      </section>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const saveProfile = useServerFn(updateProfile);
  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <section className="surface-card space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Applies across your dashboard and is remembered on this account.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setTheme(option.value);
              void saveProfile({ data: { theme: option.value } });
            }}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-4 text-sm transition",
              theme === option.value
                ? "border-primary bg-primary/5 font-medium"
                : "border-border hover:border-primary/40",
            )}
          >
            <option.icon className="size-4" />
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
