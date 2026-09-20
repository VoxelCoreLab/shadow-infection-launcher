<script setup lang="ts">
import { RouterView } from "vue-router";
import AppShell from "@/layouts/AppShell.vue";
import Titlebar from "@/components/Titlebar.vue";
import loginBg from "@/assets/login-bg-banner-gate.png";
</script>

<template>
  <AppShell overlay-header>
    <template #header>
      <Titlebar />
    </template>
    <div class="relative h-full">
      <div class="absolute inset-0 overflow-hidden" aria-hidden="true">
        <img :src="loginBg" alt="" class="h-full w-full object-cover object-center" />
      </div>
      <div class="relative z-10 flex h-full items-center justify-center p-6 text-white">
        <RouterView />
      </div>
    </div>
  </AppShell>
</template>
