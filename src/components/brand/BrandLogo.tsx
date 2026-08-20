/**
 * The one component that renders the platform logo.
 *
 * Every surface (marketing header/footer, app shell, admin shell, auth pages)
 * uses this so an admin logo upload propagates everywhere with no per-component
 * hard-coding. Dark-mode variants are swapped with CSS so SSR and hydration
 * render the same markup.
 */
import { BRAND_NAME, brandLogo, brandLogoDark, brandLoginLogo } from "@/lib/branding";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  context = "app",
  alt,
}: {
  className?: string;
  context?: "app" | "login";
  alt?: string;
}) {
  const light = context === "login" ? brandLoginLogo() : brandLogo();
  const dark = context === "login" ? brandLoginLogo() : brandLogoDark();
  const label = alt ?? `${BRAND_NAME} logo`;
  const base = cn("w-auto object-contain", className);

  if (light === dark) {
    return <img src={light} alt={label} className={base} loading="eager" decoding="async" />;
  }

  return (
    <>
      <img src={light} alt={label} className={cn(base, "dark:hidden")} loading="eager" decoding="async" />
      <img src={dark} alt={label} className={cn(base, "hidden dark:block")} loading="eager" decoding="async" />
    </>
  );
}
