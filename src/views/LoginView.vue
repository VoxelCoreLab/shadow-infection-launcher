<script setup lang="ts">
import { RouterLink } from "vue-router";
import PagePlaceholder from "@/components/PagePlaceholder.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<template>
  <PagePlaceholder title="Das ist page Login">
    <RouterLink to="/spiel" class="underline" @click="auth.isLoggedIn = true">
      Login
    </RouterLink>
  </PagePlaceholder>
</template>
