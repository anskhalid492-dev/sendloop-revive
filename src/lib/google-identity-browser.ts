/**
 * Browser helper for Google Identity Services (https://accounts.google.com/gsi/client).
 * Opens Google's normal sign-in popup and returns a one-time authorization
 * code. Never uses Supabase OAuth and never touches a client secret.
 */
const GIS_SRC = "https://accounts.google.com/gsi/client";

type CodeResponse = { code?: string; state?: string; error?: string };
type GisError = { type?: string };
type CodeClient = { requestCode: () => void };
type GoogleGlobal = {
  accounts: {
    oauth2: {
      initCodeClient: (config: {
        client_id: string;
        scope: string;
        ux_mode: "popup";
        state: string;
        callback: (r: CodeResponse) => void;
        error_callback?: (e: GisError) => void;
      }) => CodeClient;
    };
  };
};

let loading: Promise<GoogleGlobal> | null = null;

export function loadGoogleIdentityServices(): Promise<GoogleGlobal> {
  const existing = (window as unknown as { google?: GoogleGlobal }).google;
  if (existing?.accounts?.oauth2) return Promise.resolve(existing);
  if (loading) return loading;
  loading = new Promise<GoogleGlobal>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const g = (window as unknown as { google?: GoogleGlobal }).google;
      if (g?.accounts?.oauth2) resolve(g);
      else reject(new Error("gis_unavailable"));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("gis_unavailable"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type GoogleCodeResult = { kind: "code"; code: string } | { kind: "cancelled" } | { kind: "error" };

/** Opens Google's sign-in popup. Closing the popup resolves as `cancelled`. */
export async function requestGoogleAuthCode(clientId: string): Promise<GoogleCodeResult> {
  const google = await loadGoogleIdentityServices();
  const state = crypto.randomUUID();
  return new Promise<GoogleCodeResult>((resolve) => {
    const client = google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: "openid email profile",
      ux_mode: "popup",
      state,
      callback: (r) => {
        if (r.error === "access_denied") return resolve({ kind: "cancelled" });
        if (r.error || !r.code || r.state !== state) return resolve({ kind: "error" });
        resolve({ kind: "code", code: r.code });
      },
      error_callback: (e) => {
        resolve(e?.type === "popup_closed" ? { kind: "cancelled" } : { kind: "error" });
      },
    });
    client.requestCode();
  });
}
