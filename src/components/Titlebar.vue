<script setup lang="ts">
import WindowControls from "@/components/WindowControls.vue";
</script>

<template>
  <header
    data-tauri-drag-region
    class="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-end px-4"
  >
    <WindowControls variant="overlay" />
  </header>
</template>
