import { Button } from "@/components/ui/button";

type IconPickerManagePersonalPublicationActionsProps = {
  showPublicationActions: boolean;
  onPublish: () => Promise<void> | void;
  publishLabel: string;
  isPublishDisabled: boolean;
  showUnpublishButton: boolean;
  onUnpublish: () => Promise<void> | void;
  unpublishLabel: string;
  isUnpublishDisabled: boolean;
};

export function IconPickerManagePersonalPublicationActions({
  showPublicationActions,
  onPublish,
  publishLabel,
  isPublishDisabled,
  showUnpublishButton,
  onUnpublish,
  unpublishLabel,
  isUnpublishDisabled,
}: IconPickerManagePersonalPublicationActionsProps) {
  if (!showPublicationActions) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        disabled={isPublishDisabled}
        onClick={onPublish}
      >
        {publishLabel}
      </Button>
      {showUnpublishButton ? (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          disabled={isUnpublishDisabled}
          onClick={onUnpublish}
        >
          {unpublishLabel}
        </Button>
      ) : null}
    </>
  );
}
