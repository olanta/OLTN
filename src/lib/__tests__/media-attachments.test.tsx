import { render } from "preact";
import { describe, expect, it, vi } from "vitest";
import type { MediaAttachment } from "../../api/types";
import { MediaAttachments } from "../../components/compose/MediaAttachments";

const image = {
  id: "m1",
  type: "image",
  previewUrl: "",
  description: "",
} as unknown as MediaAttachment;

describe("MediaAttachments alt text AI", () => {
  it("shows and triggers the AI button when configured", () => {
    const onDescribe = vi.fn();
    const host = document.createElement("div");
    render(
      <MediaAttachments
        media={[image]}
        altTextReady
        describingId={null}
        onDescription={() => {}}
        onRemove={() => {}}
        onDescribe={onDescribe}
      />,
      host,
    );
    const button = host.querySelector<HTMLButtonElement>(".compose-media-ai");
    expect(button?.disabled).toBe(false);
    button?.click();
    expect(onDescribe).toHaveBeenCalledWith(0);
  });

  it("keeps the AI button clickable so it can explain the setup", () => {
    const host = document.createElement("div");
    render(
      <MediaAttachments
        media={[image]}
        altTextReady={false}
        describingId={null}
        onDescription={() => {}}
        onRemove={() => {}}
        onDescribe={() => {}}
      />,
      host,
    );
    expect(host.querySelector<HTMLButtonElement>(".compose-media-ai")?.disabled).toBe(false);
  });
});
