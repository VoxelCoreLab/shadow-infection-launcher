<script setup lang="ts">
import { RouterLink } from "vue-router";
import PagePlaceholder from "@/components/PagePlaceholder.vue";
import { useUiStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";

const ui = useUiStore();
const auth = useAuthStore();
</script>

<template>
  <PagePlaceholder title="Das ist page Login">
    <RouterLink to="/spiel" class="underline" @click="auth.isLoggedIn = true">
      Spiel
    </RouterLink>
    <RouterLink to="/patch-notes" class="underline" @click="auth.isLoggedIn = true">
      Patch Notes
    </RouterLink>
    <button type="button" class="underline" @click="ui.openSettings">
      Einstellungen
    </button>
  </PagePlaceholder>
</template>
