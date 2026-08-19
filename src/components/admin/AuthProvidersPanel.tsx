import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { getAuthProviderSettings, saveAuthProviderSettings } from "@/lib/auth-settings.functions";

/** Admin → Settings → Authentication. Controls the Google sign-in button. */
export function AuthProvidersPanel() {
  const fetchSettings = useServerFn(getAuthProviderSettings);
  const saveSettings = useServerFn(saveAuthProviderSettings);
  const queryClient = useQueryClient();
  const [google, setGoogle] = useState(true);

  const q = useQuery({ queryKey: ["admin-auth-providers"], queryFn: () => fetchSettings() });

  useEffect(() => {
    if (q.data) setGoogle(q.data.googleEnabled);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (googleEnabled: boolean) => saveSettings({ data: { googleEnabled } }),
    onSuccess: (result) => {
      setGoogle(result.googleEnabled);
      queryClient.invalidateQueries({ queryKey: ["admin-auth-providers"] });
      queryClient.invalidateQueries({ queryKey: ["public-auth-settings"] });
      toast.success(
        result.googleEnabled ? "Google sign-in enabled" : "Google sign-in disabled",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="surface-card space-y-4 p-6 text-sm">
      <div>
        <h3 className="font-semibold">Authentication</h3>
        <p className="text-muted-foreground">
          Which sign-in methods customers can use. Email and password is always available.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
        <div>
          <p className="font-medium">Google Sign-In</p>
          <p className="text-muted-foreground">
            Shows &ldquo;Continue with Google&rdquo; on sign-in and sign-up. When off, the button is
            hidden and Google sessions are rejected server-side.
          </p>
        </div>
        <Switch
          checked={google}
          disabled={q.isLoading || save.isPending}
          onCheckedChange={(next) => {
            setGoogle(next);
            save.mutate(next);
          }}
          aria-label="Google Sign-In"
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4">
        <div>
          <p className="font-medium">Email &amp; password</p>
          <p className="text-muted-foreground">
            Always enabled so customers keep a working way in.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Enabled
        </span>
      </div>
    </div>
  );
}
