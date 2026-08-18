import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { amIAdmin } from "@/lib/admin.functions";

/**
 * Client-side convenience check for showing/hiding admin UI.
 * Every admin server function re-checks the role server-side, so this is
 * presentation only — never the sole line of defence.
 */
export function useIsAdmin() {
  const check = useServerFn(amIAdmin);
  const query = useQuery({
    queryKey: ["me", "is-admin"],
    queryFn: () => check(),
    staleTime: 5 * 60 * 1000,
  });
  return { isAdmin: query.data?.isAdmin === true, isLoading: query.isLoading };
}
