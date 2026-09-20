<script setup lang="ts">
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
</script>

<template>
  <div
    v-if="ui.isSettingsOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @click.self="ui.closeSettings"
  >
    <div
      class="w-full max-w-md space-y-4 rounded-lg bg-white p-6 text-zinc-900 shadow-xl"
    >
      <h2 class="text-xl font-semibold">This is the Settings page</h2>
      <button
        type="button"
        class="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
        @click="ui.closeSettings"
      >
        Close
      </button>
    </div>
  </div>
</template>
