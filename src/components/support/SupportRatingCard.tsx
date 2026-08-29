import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupportStars } from "@/components/support/SupportStars";
import { cn } from "@/lib/utils";
import { submitSupportRating } from "@/lib/support.functions";
import {
  SUPPORT_RATING_LABEL,
  SUPPORT_RATING_VALUES,
  type SupportRatingValue,
  type SupportTicketRating,
} from "@/lib/support-rating";

/**
 * Lets a customer rate their SUPPORT EXPERIENCE once a ticket is resolved or
 * closed. One rating per ticket — after submitting, the score is shown read-only.
 */
export function SupportRatingCard({
  ticketId,
  rating,
}: {
  ticketId: string;
  rating: SupportTicketRating | null;
}) {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitSupportRating);
  const [value, setValue] = useState<SupportRatingValue | null>(null);
  const [hover, setHover] = useState<SupportRatingValue | null>(null);
  const [feedback, setFeedback] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      submit({ data: { ticketId, rating: value as number, feedback: feedback.trim() || null } }),
    onSuccess: async () => {
      setJustSubmitted(true);
      toast.success("Thanks for your feedback!");
      await queryClient.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (rating) {
    return (
      <div className="surface-card space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Your support experience rating</p>
          {justSubmitted ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Thanks for your feedback!
            </span>
          ) : null}
        </div>
        <SupportStars value={rating.rating} size="md" showLabel />
        {rating.feedback ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{rating.feedback}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Submitted {new Date(rating.created_at).toLocaleString()}
        </p>
      </div>
    );
  }

  const preview = hover ?? value;

  return (
    <div className="surface-card space-y-3 p-4">
      <div>
        <p className="text-sm font-medium">How was your support experience?</p>
        <p className="text-xs text-muted-foreground">
          Rate how the MunchReach support team handled this request.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
          {SUPPORT_RATING_VALUES.map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star — ${SUPPORT_RATING_LABEL[star]}`}
              aria-pressed={value === star}
              onMouseEnter={() => setHover(star)}
              onFocus={() => setHover(star)}
              onBlur={() => setHover(null)}
              onClick={() => setValue(star)}
              className="rounded p-0.5 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star
                className={cn(
                  "h-7 w-7",
                  preview && star <= preview
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          {preview ? `${preview} = ${SUPPORT_RATING_LABEL[preview]}` : "Select 1 to 5 stars"}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`support-rating-feedback-${ticketId}`}>
          Tell us more about your experience (optional)
        </Label>
        <Textarea
          id={`support-rating-feedback-${ticketId}`}
          rows={3}
          value={feedback}
          maxLength={2000}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="What went well, or what could we do better?"
        />
      </div>

      <Button disabled={!value || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
        Submit Rating
      </Button>
    </div>
  );
}
