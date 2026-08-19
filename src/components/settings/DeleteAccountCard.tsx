import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/settings.functions";

const PHRASE = "DELETE MY ACCOUNT";

export function DeleteAccountCard() {
  const deleteFn = useServerFn(deleteMyAccount);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState("");

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { confirm } }),
    onSuccess: async () => {
      toast.success("Your account has been deleted");
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="surface-card space-y-4 border-destructive/30 p-6">
      <div>
        <h2 className="text-base font-semibold text-destructive">Delete your account</h2>
        <p className="text-sm text-muted-foreground">
          This permanently removes your personal account and sign-in. Transfer or delete any
          workspace you own first, so your team does not lose their data.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="delete-account">
          Type <span className="font-mono">{PHRASE}</span> to confirm
        </Label>
        <Input
          id="delete-account"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder={PHRASE}
        />
      </div>
      <Button
        variant="destructive"
        disabled={confirm.trim().toUpperCase() !== PHRASE || remove.isPending}
        onClick={() => remove.mutate()}
      >
        {remove.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Delete my account
      </Button>
    </section>
  );
}
