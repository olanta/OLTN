import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useSnapshot } from "valtio";
import type { Status } from "../../api/types";
import { t } from "../../i18n/pt-BR";
import { userMessageForError } from "../../lib/errors";
import { galleryItems, type GalleryItem } from "../../lib/gallery";
import { fetchGalleryPage } from "../../lib/gallery-feed";
import { clientFor } from "../../lib/identity";
import { scrollFeedToTop } from "../../lib/scroll";
import { currentAccount, putStatuses, setMediaViewer, statusKey, store } from "../../state/store";
import { useElementVisible, usePageVisible, usePagedFeed, type PagedFeed } from "../../state/hooks";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { fetchStatusPage, fetchTimelineUpdate } from "./timeline-fetch";
import "./home-gallery.css";

const GALLERY_FETCH_LIMIT = 20;

/** Images from the Home timeline, one tile per attachment. */
export function HomeGallery({
  instance,
  refreshKey = 0,
}: {
  instance?: string;
  refreshKey?: number;
}): JSX.Element {
  const snap = useSnapshot(store);
  const target = instance ?? currentAccount()?.instance ?? "";
  const feed = usePagedFeed<Status>({
    key: `home-media|${target}|${snap.ui.feedsRevision}|${refreshKey}`,
    enabled: !!target,
    adapter: {
      fetchPage: async (cursor) => {
        // Some servers return only a couple of images per raw Home page even
        // with only_media=true. Keep paging until the grid has enough tiles,
        // so each "load more" fills the gallery instead of adding two images.
        const page = await fetchGalleryPage(
          (maxId) =>
            fetchStatusPage(
              { type: "home", onlyMedia: true },
              GALLERY_FETCH_LIMIT,
              maxId,
              clientFor(target),
            ),
          cursor,
        );
        putStatuses([...page.items], target);
        return page;
      },
      keyOf: statusKey,
      cursorOf: (status) => status.id,
    },
  });
  const items = galleryItems(feed.items);
  const rootRef = useRef<HTMLDivElement>(null);
  const [hasUpdates, setHasUpdates] = useState(false);
  const visible = useElementVisible(rootRef) && usePageVisible();

  useEffect(() => {
    setHasUpdates(false);
  }, [target, refreshKey]);

  useEffect(() => {
    if (
      !visible ||
      !feed.ready ||
      feed.loading ||
      feed.loadingMore ||
      !feed.items.length ||
      hasUpdates
    ) {
      return;
    }
    const latestId = feed.items[0]?.id;
    if (!latestId) return;
    let cancelled = false;
    let timer = 0;

    const check = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const updated = await fetchTimelineUpdate(
          { type: "home", onlyMedia: true },
          latestId,
          clientFor(target),
        );
        if (updated) {
          if (!cancelled) setHasUpdates(true);
          return;
        }
      } catch (err) {
        console.warn("[oltn] gallery update check failed", err);
      }
      if (!cancelled) timer = window.setTimeout(check, 30_000);
    };

    timer = window.setTimeout(check, 30_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [visible, feed.ready, feed.loading, feed.loadingMore, feed.items, hasUpdates, target]);

  if (feed.loading && !feed.items.length) return <GallerySkeleton />;
  if (feed.error && !feed.items.length) {
    return (
      <div class="center-state">
        <Icon name="wifi-off-line" size={28} />
        <h3>{userMessageForError(feed.error, t.errorLoad)}</h3>
        <button type="button" class="btn ghost" onClick={feed.reload}>
          <Icon name="refresh-2-line" size={16} />
          {t.retry}
        </button>
      </div>
    );
  }
  if (!items.length && !feed.hasMore) {
    return (
      <div class="center-state">
        <Icon name="photo-album-line" size={28} />
        <h3>{t.homeImagesEmpty}</h3>
      </div>
    );
  }

  return (
    <div class="home-gallery" ref={rootRef}>
      {hasUpdates && (
        <button
          type="button"
          class="updates-pill"
          onClick={() => {
            setHasUpdates(false);
            feed.reload();
            scrollFeedToTop(rootRef.current);
          }}
        >
          <Icon name="arrow-down-line" size={15} />
          {t.newPosts}
        </button>
      )}
      <div class="home-gallery-head">
        <Icon name="photo-album-line" size={15} />
        <span>{t.homeImages}</span>
      </div>
      {items.length > 0 ? (
        <div class="home-gallery-grid">
          {items.map((item) => (
            <GalleryTile key={item.key} item={item} instance={target} />
          ))}
        </div>
      ) : (
        <p class="muted home-gallery-none">{t.homeImagesEmpty}</p>
      )}
      <GalleryPager feed={feed} />
    </div>
  );
}

function GalleryTile({ item, instance }: { item: GalleryItem; instance: string }): JSX.Element {
  const [revealed, setRevealed] = useState(false);
  const { status, attachment } = item;
  const hidden = (!!status.sensitive || !!status.spoilerText) && !revealed;
  const description = attachment.description || t.media;
  const author = status.account;
  const handle = `@${author.acct}`;
  const open = (): void => {
    setMediaViewer({
      instance,
      attachments: [...item.attachments],
      index: item.index,
    });
  };

  return (
    <button
      type="button"
      class={`home-gallery-tile ${hidden ? "is-hidden" : ""}`}
      aria-label={hidden ? `${t.showMedia}: ${handle}` : `${description} - ${handle}`}
      title={hidden ? `${t.showMedia}: ${handle}` : `${description} - ${handle}`}
      onClick={() => {
        if (hidden) setRevealed(true);
        else open();
      }}
    >
      {hidden ? (
        <span class="home-gallery-locked">
          <Icon name="eye-line" size={20} />
          <span>{t.showMedia}</span>
        </span>
      ) : (
        <img
          src={attachment.previewUrl ?? attachment.url ?? ""}
          alt={description}
          loading="lazy"
          decoding="async"
        />
      )}
      <span class="home-gallery-author">
        <Avatar
          src={author.avatarStatic || author.avatar}
          name={author.displayName || author.username}
          size={18}
        />
        <span>{handle}</span>
      </span>
      {attachment.type === "gifv" && !hidden && <span class="home-gallery-gif">GIF</span>}
    </button>
  );
}

function GalleryPager({ feed }: { feed: PagedFeed<Status> }): JSX.Element | null {
  if (feed.moreError) {
    return (
      <div class="home-gallery-more">
        <span class="muted">{userMessageForError(feed.moreError, t.errorLoad)}</span>
        <button type="button" class="btn ghost" onClick={feed.loadMore}>
          <Icon name="refresh-2-line" size={16} />
          {t.retry}
        </button>
      </div>
    );
  }
  if (!feed.hasMore) return null;
  return (
    <div class="home-gallery-more">
      <button type="button" class="btn ghost" onClick={feed.loadMore} disabled={feed.loadingMore}>
        {feed.loadingMore ? <span class="spinner" /> : <Icon name="dropdown-line" size={16} />}
        {feed.loadingMore ? t.loadingMore : t.loadMore}
      </button>
    </div>
  );
}

function GallerySkeleton(): JSX.Element {
  return (
    <div class="home-gallery" aria-hidden>
      <div class="home-gallery-grid">
        {Array.from({ length: 9 }, (_, index) => (
          <div class="home-gallery-tile skeleton" key={index} />
        ))}
      </div>
    </div>
  );
}
