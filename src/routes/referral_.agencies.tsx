import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { affiliateProgramQuery } from '@/lib/affiliate-program-query';
import { AffiliateLanding } from '@/components/referral/AffiliateLanding';
import { metaFor } from '@/components/site/MarketingPage';
export const Route = createFileRoute('/referral_/agencies')({
  loader: ({ context }) => context.queryClient.ensureQueryData(affiliateProgramQuery),
  head: () => metaFor('MunchReach Agency Partners — Affiliate Program', 'Recommend MunchReach to new agency clients with payment-backed affiliate tracking and reviewed payouts.', '/referral/agencies'),
  component: AgencyPartners,
});
function AgencyPartners() { const { data } = useSuspenseQuery(affiliateProgramQuery); return <AffiliateLanding program={data} agency />; }