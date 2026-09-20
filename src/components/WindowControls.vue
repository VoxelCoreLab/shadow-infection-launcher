<script setup lang="ts">
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import IconClose from "@/components/icons/IconClose.vue";
import IconMinimize from "@/components/icons/IconMinimize.vue";

withDefaults(
  defineProps<{
    variant?: "bar" | "overlay";
  }>(),
  { variant: "bar" },
);

function currentWindow(): Window | null {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

const win = currentWindow();

function minimize() {
  void win?.minimize();
}

function closeWindow() {
  void win?.close();
}
</script>

<template>
  <div class="flex items-center gap-1" data-tauri-drag-region="false">
    <button
      type="button"
      title="Minimize"
      class="header-icon-button"
      :class="{ 'header-icon-button--overlay': variant === 'overlay' }"
      data-tauri-drag-region="false"
      @click="minimize"
    >
      <IconMinimize />
    </button>
    <button
      type="button"
      title="Close"
      class="header-icon-button header-icon-button--danger"
      :class="{ 'header-icon-button--overlay': variant === 'overlay' }"
      data-tauri-drag-region="false"
      @click="closeWindow"
    >
      <IconClose />
    </button>
  </div>
</template>

<style scoped>
.header-icon-button {
  display: flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  cursor: pointer;
  color: var(--color-launcher-gold-dim);
  transition:
    color 150ms ease,
    background-color 150ms ease;
  -webkit-app-region: no-drag;
}
.header-icon-button:hover {
  background: rgba(253, 199, 135, 0.1);
  color: var(--color-launcher-gold-bright);
}
.header-icon-button--overlay {
  color: #64748b;
}
.header-icon-button--overlay:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}
.header-icon-button--danger:hover {
  background: rgba(239, 68, 68, 0.85);
  color: white;
}
</style>
