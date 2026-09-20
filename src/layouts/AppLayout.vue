<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
</script>

<template>
  <div class="min-h-screen bg-zinc-100 text-zinc-900">
    <header class="flex items-center justify-between border-b border-zinc-300 bg-white px-6 py-3">
      <nav class="flex gap-4 text-sm font-medium">
        <RouterLink
          to="/spiel"
          class="hover:underline"
          active-class="underline"
        >
          Spiel
        </RouterLink>
        <RouterLink
          to="/patch-notes"
          class="hover:underline"
          active-class="underline"
        >
          Patch Notes
        </RouterLink>
      </nav>
      <div class="flex items-center gap-4 text-sm">
        <button type="button" class="hover:underline" @click="ui.openSettings">
          Einstellungen
        </button>
        <RouterLink to="/login" class="hover:underline">Login</RouterLink>
      </div>
    </header>
    <main class="p-6">
      <RouterView />
    </main>
  </div>
</template>
