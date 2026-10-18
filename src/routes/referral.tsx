import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { affiliateProgramQuery } from "@/lib/affiliate-program-query";
import { AffiliateLanding } from "@/components/referral/AffiliateLanding";
import { metaFor } from "@/components/site/MarketingPage";
export const Route = createFileRoute("/referral")({
  loader: ({ context }) => context.queryClient.ensureQueryData(affiliateProgramQuery),
  head: () => metaFor("MunchReach Affiliate Program — Payment-Based Commissions", "MunchReach affiliate terms, recurring monthly and lifetime earnings, tracking and reviewed payouts.", "/referral"),
  component: ReferralLanding,
});
function ReferralLanding() { const { data } = useSuspenseQuery(affiliateProgramQuery); return <AffiliateLanding program={data} />; }
