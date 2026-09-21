<script setup lang="ts">
import { RouterView } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<template>
  <div
    v-if="!auth.ready"
    class="flex h-full items-center justify-center bg-launcher-void"
  >
    <div class="auth-spinner" aria-label="Loading" />
  </div>
  <RouterView v-else />
</template>

<style scoped>
.auth-spinner {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 9999px;
  border: 2px solid rgba(253, 199, 135, 0.2);
  border-top-color: var(--color-launcher-gold);
  animation: auth-spin 0.8s linear infinite;
}

@keyframes auth-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
