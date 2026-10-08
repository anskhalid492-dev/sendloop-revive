import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import type { GoogleIdpView } from "@/lib/auth-providers-config";
import {
  adminGetGoogleIdpConfig,
  adminRemoveGoogleIdpConfig,
  adminSaveGoogleIdpConfig,
  adminSetGoogleIdpEnabled,
  adminTestGoogleIdpConfig,
} from "@/lib/auth-providers-config.functions";

const STATUS_LABEL: Record<GoogleIdpView["status"], string> = {
  not_configured: "Not configured",
  configured: "Configured",
  enabled: "Enabled",
  disabled: "Disabled",
};

/**
 * Admin → Settings → Authentication → Google Sign-In (Google Cloud Identity
 * Platform). Preparation only: saving here does not change live sign-in.
 * The Client Secret is write-only; the server only ever returns a mask.
 */
export function GoogleIdentityPlatformCard() {
  const qc = useQueryClient();
  const load = useServerFn(adminGetGoogleIdpConfig);
  const save = useServerFn(adminSaveGoogleIdpConfig);
  const test = useServerFn(adminTestGoogleIdpConfig);
  const setEnabled = useServerFn(adminSetGoogleIdpEnabled);
  const remove = useServerFn(adminRemoveGoogleIdpConfig);

  const q = useQuery({ queryKey: ["admin-google-idp"], queryFn: () => load() });
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [domain, setDomain] = useState("");

  const onDone = (view: GoogleIdpView) => {
    qc.setQueryData(["admin-google-idp"], view);
  };
  const onError = (e: Error) => toast.error(e.message);

  const saveM = useMutation({
    mutationFn: () => save({ data: { projectId, clientId, clientSecret: secret || null, authorizedDomain: domain } }),
    onSuccess: (v) => {
      onDone(v);
      setSecret("");
      setEditing(false);
      toast.success("Google configuration saved");
    },
    onError,
  });
  const testM = useMutation({ mutationFn: () => test(), onSuccess: onDone, onError });
  const enableM = useMutation({
    mutationFn: (enabled: boolean) => setEnabled({ data: { enabled } }),
    onSuccess: onDone,
    onError,
  });
  const removeM = useMutation({
    mutationFn: () => remove({ data: { confirm: "REMOVE" } }),
    onSuccess: (v) => {
      onDone(v);
      setConfirmRemove(false);
      toast.success("Google configuration removed");
    },
    onError,
  });

  const v = q.data;
  const startEdit = () => {
    setProjectId(v?.projectId ?? "");
    setClientId(v?.clientId ?? "");
    setDomain(v?.authorizedDomain ?? "munchreach.com");
    setSecret("");
    setEditing(true);
  };

  if (q.isLoading) {
    return (
      <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Google Sign-In configuration
      </div>
    );
  }
  if (q.isError || !v) {
    return (
      <div className="surface-card space-y-2 p-6 text-sm">
        <p className="text-destructive">{(q.error as Error)?.message ?? "Could not load configuration."}</p>
        <Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button>
      </div>
    );
  }

  const configured = v.status !== "not_configured";
  const showForm = editing || !configured;

  return (
    <div className="surface-card space-y-4 p-6 text-sm">
      <div>
        <h3 className="font-semibold">Authentication providers</h3>
        <p className="text-muted-foreground">Prepare future sign-in providers. Only Google is available in this phase.</p>
      </div>

      <div className="flex gap-2 rounded-md border border-border/60 bg-muted/40 p-3 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Google Sign-In configuration is prepared here. Changing the active authentication system requires a separate
          migration step. Your current Supabase authentication remains active.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GoogleIcon className="h-6 w-6" />
            <div>
              <p className="font-medium">Google Sign-In</p>
              <p className="text-xs text-muted-foreground">Google Cloud Identity Platform</p>
            </div>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary" data-testid="google-idp-status">
            {STATUS_LABEL[v.status]}
          </span>
        </div>

        {!configured && !editing ? (
          <p className="text-muted-foreground">Connect Google Cloud Identity Platform to enable Google Sign-In for MunchReach.</p>
        ) : null}

        {showForm ? (
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveM.mutate();
            }}
            autoComplete="off"
          >
            <div className="space-y-1">
              <Label htmlFor="gidp-project">Google Cloud Project ID</Label>
              <Input id="gidp-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="munchreach-prod" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gidp-domain">Authorized domain</Label>
              <Input id="gidp-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="munchreach.com" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="gidp-client">Google Web Client ID</Label>
              <Input id="gidp-client" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc.apps.googleusercontent.com" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="gidp-secret">Google Web Client Secret</Label>
              <Input
                id="gidp-secret"
                type="password"
                autoComplete="new-password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={v.hasSecret ? `${v.maskedSecret} (leave blank to keep)` : "Paste the client secret"}
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={saveM.isPending}>
                {saveM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save Configuration
              </Button>
              {configured ? (
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              ) : null}
            </div>
          </form>
        ) : (
          <dl className="grid gap-2 md:grid-cols-2">
            <Row label="Google Cloud Project ID" value={v.projectId} />
            <Row label="Authorized domain" value={v.authorizedDomain ? `https://${v.authorizedDomain}` : "—"} />
            <Row label="Google Web Client ID" value={v.clientId} />
            <Row label="Google Web Client Secret" value={v.maskedSecret} />
            <Row label="Redirect / callback status" value="Not active — current sign-in callback unchanged" />
            <Row label="Last test" value={v.lastTestedAt ? new Date(v.lastTestedAt).toLocaleString() : "Never"} />
          </dl>
        )}

        {v.lastTestMessage && !showForm ? (
          <p className={v.lastTestResult === "credentials_invalid" || v.lastTestResult === "error" ? "text-destructive" : "text-muted-foreground"}>
            {v.lastTestMessage}
          </p>
        ) : null}

        {configured && !editing ? (
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
            <Button variant="outline" onClick={startEdit}>Edit Configuration</Button>
            <Button variant="outline" onClick={() => testM.mutate()} disabled={testM.isPending}>
              {testM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Test Connection
            </Button>
            {v.status === "enabled" ? (
              <Button variant="outline" onClick={() => enableM.mutate(false)} disabled={enableM.isPending}>Disable</Button>
            ) : (
              <Button onClick={() => enableM.mutate(true)} disabled={enableM.isPending}>Enable Google Sign-In</Button>
            )}
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmRemove(true)}>
              Remove Configuration
            </Button>
          </div>
        ) : null}
        {configured && !editing && v.status === "enabled" ? (
          <p className="text-xs text-muted-foreground">
            “Enabled” marks this configuration ready for the future migration. Customers still sign in with the current system.
          </p>
        ) : null}
      </div>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Google configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the saved Project ID, Client ID and encrypted Client Secret. Current sign-in is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeM.mutate()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium">{value ?? "—"}</dd>
    </div>
  );
}
