<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "@/lib/markdown";

const props = defineProps<{
  content: string;
  open?: boolean;
}>();

const html = computed(() => renderMarkdown(props.content));
</script>

<template>
  <div
    class="patch-note-content"
    :class="{ 'patch-note-content--open': open }"
    v-html="html"
  />
</template>

<style scoped>
.patch-note-content {
  margin-top: 0.65rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(253, 199, 135, 0.14);
  background: rgba(0, 0, 0, 0.6);
  padding: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  font-family: var(--font-body);
  font-size: 0.875rem;
  line-height: 1.6;
  color: rgb(203 213 225);
  opacity: 0;
  transform: translateY(-0.35rem);
  transition:
    opacity 240ms ease,
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (min-width: 640px) {
  .patch-note-content {
    padding: 1.25rem;
  }
}

.patch-note-content--open {
  opacity: 1;
  transform: translateY(0);
  transition-delay: 40ms;
}

.patch-note-content :deep(:first-child) {
  margin-top: 0;
}

.patch-note-content :deep(:last-child) {
  margin-bottom: 0;
}

.patch-note-content :deep(h1),
.patch-note-content :deep(h2),
.patch-note-content :deep(h3),
.patch-note-content :deep(h4) {
  margin: 1rem 0 0.45rem;
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgb(241 245 249);
}

.patch-note-content :deep(h1) {
  font-size: 1.15rem;
}

.patch-note-content :deep(h2) {
  font-size: 1.05rem;
  color: var(--color-launcher-gold);
}

.patch-note-content :deep(h3),
.patch-note-content :deep(h4) {
  font-size: 0.95rem;
}

.patch-note-content :deep(p) {
  margin: 0.45rem 0;
}

.patch-note-content :deep(ul),
.patch-note-content :deep(ol) {
  margin: 0.35rem 0 0.65rem;
  padding-left: 1.15rem;
}

.patch-note-content :deep(li) {
  margin: 0.2rem 0;
}

.patch-note-content :deep(ul) {
  list-style: disc;
}

.patch-note-content :deep(ol) {
  list-style: decimal;
}

.patch-note-content :deep(a) {
  color: var(--color-launcher-gold);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.patch-note-content :deep(code) {
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.1rem 0.3rem;
  font-size: 0.8em;
}

.patch-note-content :deep(pre) {
  margin: 0.65rem 0;
  overflow-x: auto;
  border-radius: 0.4rem;
  background: rgba(0, 0, 0, 0.45);
  padding: 0.75rem 0.9rem;
}

.patch-note-content :deep(pre code) {
  background: transparent;
  padding: 0;
}

.patch-note-content :deep(blockquote) {
  margin: 0.65rem 0;
  border-left: 2px solid rgba(253, 199, 135, 0.4);
  padding-left: 0.75rem;
  color: rgb(148 163 184);
}

.patch-note-content :deep(hr) {
  margin: 0.85rem 0;
  border: none;
  border-top: 1px solid rgba(253, 199, 135, 0.18);
}

.patch-note-content :deep(strong) {
  color: rgb(241 245 249);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .patch-note-content {
    transition: none;
    transform: none;
  }
}
</style>
