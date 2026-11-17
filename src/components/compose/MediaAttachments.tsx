import type { JSX } from "preact";
import type { MediaAttachment } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import { Icon } from "../ui/Icon";

interface MediaAttachmentsProps {
  media: readonly MediaAttachment[];
  onDescription: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onDescribe?: (index: number) => void;
  describingId?: string | null;
  altTextReady?: boolean;
}

function supportsAltText(type: string): boolean {
  return type === "image" || type === "video" || type === "gifv";
}

/** Attached media list with alt-text inputs and remove buttons. */
export function MediaAttachments({
  media,
  onDescription,
  onRemove,
  onDescribe,
  describingId,
  altTextReady = false,
}: MediaAttachmentsProps): JSX.Element | null {
  if (!media.length) return null;
  return (
    <div class="compose-media">
      {media.map((item, index) => {
        const busy = describingId === item.id;
        return (
          <div class="compose-media-item" key={item.id}>
            <img src={item.previewUrl || item.url || undefined} alt="" />
            <div class="compose-media-field">
              <input
                class="field"
                placeholder={t.attachAlt}
                value={item.description ?? ""}
                onInput={(e) => onDescription(index, (e.target as HTMLInputElement).value)}
              />
              {onDescribe && supportsAltText(item.type) && (
                <button
                  type="button"
                  class="icon-btn compose-media-ai"
                  title={altTextReady ? t.altTextGenerate : t.altTextConfigure}
                  aria-label={altTextReady ? t.altTextGenerate : t.altTextConfigure}
                  disabled={!!describingId}
                  onClick={() => onDescribe(index)}
                >
                  {busy ? <span class="spinner" /> : <Icon name="sparkles-line" size={17} />}
                </button>
              )}
            </div>
            <button
              type="button"
              class="icon-btn"
              aria-label={t.delete}
              onClick={() => onRemove(index)}
            >
              <Icon name="close-line" size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
