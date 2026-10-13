import { nextTick, onBeforeUnmount, type Ref } from "vue";

type Options = {
  listEl: Ref<HTMLElement | null>;
  /** Must stay >= the CSS body open/close transition. */
  settleMs?: number;
};

/**
 * Scrolls an opened timeline item to the top of `listEl`.
 * One smooth scroll after expand/collapse settles — no height prediction.
 */
export function useTimelineScrollToOpen({ listEl, settleMs = 360 }: Options) {
  const itemEls = new Map<string, HTMLElement>();
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  function bindItem(id: string, el: unknown) {
    if (el instanceof HTMLElement) {
      itemEls.set(id, el);
      return;
    }
    itemEls.delete(id);
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function scrollItemToTop(id: string) {
    const list = listEl.value;
    const item = itemEls.get(id);
    if (!list || !item) {
      return;
    }

    const offset =
      item.getBoundingClientRect().top - list.getBoundingClientRect().top;

    list.scrollTo({
      top: Math.max(0, list.scrollTop + offset),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function scrollOpenItemToTop(id: string) {
    if (settleTimer !== undefined) {
      clearTimeout(settleTimer);
      settleTimer = undefined;
    }

    void nextTick(() => {
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        scrollItemToTop(id);
      }, settleMs);
    });
  }

  onBeforeUnmount(() => {
    if (settleTimer !== undefined) {
      clearTimeout(settleTimer);
    }
  });

  return { bindItem, scrollOpenItemToTop };
}
