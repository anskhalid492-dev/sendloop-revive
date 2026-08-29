/**
 * Client-safe model for customer satisfaction ratings of the SUPPORT EXPERIENCE.
 *
 * A rating is always about how the MunchReach support team handled a ticket —
 * never about the customer.
 */

export const SUPPORT_RATING_VALUES = [1, 2, 3, 4, 5] as const;
export type SupportRatingValue = (typeof SUPPORT_RATING_VALUES)[number];

export const SUPPORT_RATING_LABEL: Record<SupportRatingValue, string> = {
  1: "Very Poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

/** Statuses where a customer is invited to rate their support experience. */
export const RATEABLE_TICKET_STATUSES = ["resolved", "closed"] as const;

export function isRateableStatus(status: string | null | undefined): boolean {
  return RATEABLE_TICKET_STATUSES.includes((status ?? "") as (typeof RATEABLE_TICKET_STATUSES)[number]);
}

export type SupportTicketRating = {
  id: string;
  ticket_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type SupportSatisfactionSummary = {
  averageRating: number;
  totalRated: number;
  /** Closed/resolved tickets that could have been rated. */
  eligibleTickets: number;
  /** Share of eligible tickets that received a rating, 0–100. */
  responseRate: number;
  distribution: Record<SupportRatingValue, number>;
  percentages: Record<SupportRatingValue, number>;
};

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Aggregate satisfaction metrics from raw rating rows.
 * `eligibleTickets` is the count of resolved/closed tickets in the same scope.
 */
export function summarizeSupportRatings(
  ratings: Array<{ rating: number }>,
  eligibleTickets = 0,
): SupportSatisfactionSummary {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<SupportRatingValue, number>;
  let sum = 0;
  let total = 0;

  for (const row of ratings) {
    const value = Math.round(Number(row?.rating));
    if (!SUPPORT_RATING_VALUES.includes(value as SupportRatingValue)) continue;
    distribution[value as SupportRatingValue] += 1;
    sum += value;
    total += 1;
  }

  const percentages = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<SupportRatingValue, number>;
  for (const value of SUPPORT_RATING_VALUES) {
    percentages[value] = total === 0 ? 0 : round((distribution[value] / total) * 100, 1);
  }

  const eligible = Math.max(eligibleTickets, total);

  return {
    averageRating: total === 0 ? 0 : round(sum / total, 2),
    totalRated: total,
    eligibleTickets: eligible,
    responseRate: eligible === 0 ? 0 : round((total / eligible) * 100, 1),
    distribution,
    percentages,
  };
}
