<script setup lang="ts">
import { RouterLink } from "vue-router";
import PagePlaceholder from "@/components/PagePlaceholder.vue";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
</script>

<template>
  <PagePlaceholder title="Das ist page Patch Notes">
    <RouterLink to="/spiel" class="underline">Spiel</RouterLink>
    <RouterLink to="/login" class="underline">Login</RouterLink>
    <button type="button" class="underline" @click="ui.openSettings">
      Einstellungen
    </button>
  </PagePlaceholder>
</template>
