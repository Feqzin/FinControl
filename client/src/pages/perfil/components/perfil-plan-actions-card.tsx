import { Button } from "@/components/ui/button";

type PerfilPlanActionsCardProps = {
  showStartTrial: boolean;
  showSubscribe: boolean;
  showCancelSubscription: boolean;
  startTrialPending: boolean;
  subscribePending: boolean;
  cancelSubscriptionPending: boolean;
  startTrialLabel: string;
  subscribeLabel: string;
  cancelSubscriptionLabel: string;
  onStartTrial: () => void;
  onSubscribe: () => void;
  onCancelSubscription: () => void;
};

export function PerfilPlanActionsCard({
  showStartTrial,
  showSubscribe,
  showCancelSubscription,
  startTrialPending,
  subscribePending,
  cancelSubscriptionPending,
  startTrialLabel,
  subscribeLabel,
  cancelSubscriptionLabel,
  onStartTrial,
  onSubscribe,
  onCancelSubscription,
}: PerfilPlanActionsCardProps) {
  return (
    <>
      {showStartTrial && (
        <Button
          className="w-full touch-feedback"
          variant="secondary"
          onClick={onStartTrial}
          data-testid="button-start-trial"
          disabled={startTrialPending}
        >
          {startTrialLabel}
        </Button>
      )}

      {showSubscribe && (
        <Button
          className="w-full touch-feedback"
          onClick={onSubscribe}
          data-testid="button-upgrade-premium"
          disabled={subscribePending}
        >
          {subscribeLabel}
        </Button>
      )}

      {showCancelSubscription && (
        <Button
          type="button"
          variant="outline"
          className="w-full touch-feedback"
          onClick={onCancelSubscription}
          disabled={cancelSubscriptionPending}
          data-testid="button-cancel-premium"
        >
          {cancelSubscriptionLabel}
        </Button>
      )}
    </>
  );
}
