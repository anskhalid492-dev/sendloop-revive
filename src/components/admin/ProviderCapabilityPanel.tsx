/**
 * Admin-only panel showing exactly what a provider can and cannot do.
 *
 * Everything rendered here comes from the provider capability matrix, which is
 * derived from each provider's own public API documentation. Anything the
 * provider does not expose through its API is shown as "manual setup required"
 * or "not supported" — never quietly assumed to work.
 */
import { Badge } from "@/components/ui/badge";
import {
  CAPABILITY_LABEL,
  CAPABILITY_LEVEL_LABEL,
  CAPABILITY_LEVEL_STYLE,
  PROVIDER_CAPABILITY_KEYS,
  providerCapabilityProfile,
} from "@/lib/email-providers/capability-matrix";

export function ProviderCapabilityPanel({ providerId }: { providerId: string }) {
  const profile = providerCapabilityProfile(providerId);
  if (!profile) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-foreground">What this provider supports</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {PROVIDER_CAPABILITY_KEYS.map((key) => {
          const level = profile.capabilities[key];
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{CAPABILITY_LABEL[key]}</span>
              <Badge variant="outline" className={`text-[10px] ${CAPABILITY_LEVEL_STYLE[level]}`}>
                {CAPABILITY_LEVEL_LABEL[level]}
              </Badge>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{profile.note}</p>
    </div>
  );
}
