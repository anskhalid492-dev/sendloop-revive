import { mergeHelpArticles, type HelpCmsRow } from "./help-center-cms";

export const HELP_CMS_COLUMNS = "id,slug,title,category,summary,body,published,updated_at,deleted_at,help_metadata";

export async function readHelpCatalogue(client: any) {
  const rows: HelpCmsRow[] = [];
  const overridden: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const [articles, slugs] = await Promise.all([
      client.from("guide_articles").select(HELP_CMS_COLUMNS).eq("help_center", true)
        .eq("published", true).is("deleted_at", null).order("id").range(offset, offset + 999),
      client.rpc("help_center_override_slugs").order("slug").range(offset, offset + 999),
    ]);
    // Older installations keep the original catalogue until owner-applied SQL is ready.
    if (articles.error || slugs.error) {
      const code = articles.error?.code ?? slugs.error?.code;
      if (["42703", "PGRST204", "PGRST202"].includes(code)) return mergeHelpArticles([], []);
      throw new Error("Help Center articles could not be loaded");
    }
    rows.push(...(articles.data ?? []));
    overridden.push(...(slugs.data ?? []).map((r: { slug: string }) => r.slug));
    if ((articles.data?.length ?? 0) < 1000 && (slugs.data?.length ?? 0) < 1000) break;
  }
  return mergeHelpArticles(rows, overridden);
}