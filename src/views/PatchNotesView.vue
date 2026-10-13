<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { PatchNoteDto } from "@/api/generated/patch-notes/Api";
import PatchNoteContent from "@/components/PatchNoteContent.vue";
import { useTimelineScrollToOpen } from "@/composables/useTimelineScrollToOpen";
import { usePatchNotesStore } from "@/stores/patch-notes";

/** Keep in sync with `.patch-timeline__body` transition (320ms). */
const BODY_SETTLE_MS = 360;

const patchNotes = usePatchNotesStore();
const { notes, focusNote, loading, error, hasNotes } = storeToRefs(patchNotes);

const expandedId = ref<string | null>(null);
const listEl = ref<HTMLElement | null>(null);
const { bindItem, scrollOpenItemToTop } = useTimelineScrollToOpen({
  listEl,
  settleMs: BODY_SETTLE_MS,
});

onMounted(() => {
  void patchNotes.load();
});

watch(
  notes,
  (list) => {
    if (!list.length) {
      expandedId.value = null;
      return;
    }
    const preferred = focusNote.value?.id ?? list[0]?.id ?? null;
    if (
      expandedId.value === null ||
      !list.some((note) => note.id === expandedId.value)
    ) {
      expandedId.value = preferred;
    }
  },
  { immediate: true },
);

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function isExpanded(note: PatchNoteDto): boolean {
  return expandedId.value === note.id;
}

function toggle(note: PatchNoteDto) {
  if (isExpanded(note)) {
    expandedId.value = null;
    return;
  }
  expandedId.value = note.id;
  scrollOpenItemToTop(note.id);
}
</script>

<template>
  <div class="flex h-full flex-col gap-5 overflow-hidden">
    <header class="shrink-0">
      <h1
        class="font-display text-3xl font-bold tracking-[0.08em] text-launcher-gold uppercase"
      >
        Patch Notes
      </h1>
    </header>

    <div
      v-if="error"
      class="shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 font-body text-sm text-red-400 backdrop-blur-md"
      role="alert"
    >
      <p>{{ error }}</p>
      <button
        type="button"
        class="mt-2 text-xs font-medium text-red-300 underline decoration-red-300/50 underline-offset-2 hover:text-red-200"
        :disabled="loading"
        @click="patchNotes.load()"
      >
        Try again
      </button>
    </div>

    <div
      v-else-if="loading"
      class="flex flex-1 items-center justify-center font-body text-sm text-slate-400"
      role="status"
      aria-live="polite"
    >
      Loading patch notes…
    </div>

    <div
      v-else-if="!hasNotes"
      class="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-launcher-border/60 bg-black/55 px-6 py-10 text-center backdrop-blur-md"
      role="status"
    >
      <p class="font-display text-lg text-launcher-gold-dim">No patch notes yet</p>
      <p class="max-w-sm font-body text-sm text-slate-400">
        When a note is published for your game version, it will appear here.
      </p>
      <button
        type="button"
        class="mt-2 rounded-md border border-launcher-border px-3 py-1.5 font-body text-xs text-slate-300 hover:border-launcher-gold/40 hover:text-launcher-gold"
        @click="patchNotes.load()"
      >
        Refresh
      </button>
    </div>

    <ol
      v-else
      ref="listEl"
      class="patch-timeline min-h-0 flex-1 list-none overflow-y-auto pr-1"
    >
      <li
        v-for="note in notes"
        :key="note.id"
        :ref="(el) => bindItem(note.id, el)"
        class="patch-timeline__item"
      >
        <span
          class="patch-timeline__dot"
          :class="
            isExpanded(note)
              ? 'patch-timeline__dot--active'
              : 'patch-timeline__dot--idle'
          "
          aria-hidden="true"
        />

        <button
          type="button"
          class="patch-timeline__row"
          :aria-expanded="isExpanded(note)"
          @click="toggle(note)"
        >
          <span
            class="flex min-w-0 items-baseline gap-3 truncate font-body text-sm text-slate-100 sm:text-base"
          >
            <span class="shrink-0 font-semibold text-launcher-gold">{{
              note.version
            }}</span>
            <span class="truncate text-slate-300">{{ note.title }}</span>
          </span>
          <time
            class="shrink-0 font-body text-xs text-slate-500 sm:text-sm"
            :datetime="note.createdAt"
          >
            {{ formatDate(note.createdAt) }}
          </time>
        </button>

        <div
          class="patch-timeline__body"
          :class="{ 'patch-timeline__body--open': isExpanded(note) }"
        >
          <div class="patch-timeline__body-clip">
            <PatchNoteContent
              :content="note.content"
              :open="isExpanded(note)"
            />
          </div>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.patch-timeline {
  --rail-x: 0.55rem;
  --dot-size: 0.7rem;
  position: relative;
  margin: 0;
  padding: 0.25rem 0 1.5rem;
}

.patch-timeline__item {
  position: relative;
  padding: 0 0 1.35rem 1.85rem;
}

.patch-timeline__item:last-child {
  padding-bottom: 0;
}

.patch-timeline__item:not(:last-child)::before {
  content: "";
  position: absolute;
  top: calc(0.45rem + var(--dot-size) / 2);
  bottom: calc(-0.45rem - var(--dot-size) / 2);
  left: var(--rail-x);
  z-index: 0;
  width: 1px;
  background: rgba(253, 199, 135, 0.28);
  transform: translateX(-50%);
}

.patch-timeline__dot {
  position: absolute;
  top: 0.45rem;
  left: var(--rail-x);
  z-index: 1;
  box-sizing: border-box;
  width: var(--dot-size);
  height: var(--dot-size);
  border-radius: 9999px;
  transform: translateX(-50%);
  transition:
    background-color 280ms ease,
    border-color 280ms ease,
    box-shadow 280ms ease;
}

.patch-timeline__dot--active {
  border: 1px solid var(--color-launcher-gold);
  background: var(--color-launcher-gold);
  box-shadow: 0 0 10px rgba(253, 199, 135, 0.45);
}

.patch-timeline__dot--idle {
  border: 1.5px solid rgba(253, 199, 135, 0.55);
  background: rgba(2, 19, 52, 0.85);
}

.patch-timeline__row {
  display: flex;
  width: 100%;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.15rem 0;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  color: inherit;
}

.patch-timeline__row:hover .font-semibold {
  color: var(--color-launcher-gold-bright);
}

.patch-timeline__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.patch-timeline__body--open {
  grid-template-rows: 1fr;
}

.patch-timeline__body-clip {
  min-height: 0;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .patch-timeline__body,
  .patch-timeline__dot {
    transition: none;
  }
}
</style>
