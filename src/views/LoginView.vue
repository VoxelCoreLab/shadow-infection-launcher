<script setup lang="ts">
import { RouterLink } from "vue-router";
import PagePlaceholder from "@/components/PagePlaceholder.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<template>
  <PagePlaceholder title="This is the Login page">
    <RouterLink to="/play" class="underline" @click="auth.isLoggedIn = true">
      Log in
    </RouterLink>
  </PagePlaceholder>
</template>
