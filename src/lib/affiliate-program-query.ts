import { getPublicReferralProgram } from '@/lib/referral.functions';
export const affiliateProgramQuery = {
  queryKey: ['referral', 'public-program'], queryFn: () => getPublicReferralProgram(), staleTime: 60_000,
};