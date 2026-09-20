<script setup lang="ts">
import SettingsModal from "@/components/SettingsModal.vue";

defineProps<{
  overlayHeader?: boolean;
}>();
</script>

<template>
  <div
    class="relative flex h-screen flex-col overflow-hidden bg-launcher-void text-slate-100"
    :class="{ 'bg-black': overlayHeader }"
  >
    <div :class="overlayHeader ? 'absolute inset-x-0 top-0 z-20' : 'shrink-0'">
      <slot name="header" />
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <slot />
    </div>
    <SettingsModal />
  </div>
</template>
