<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppShell from "@/layouts/AppShell.vue";
import Header from "@/components/Header.vue";
import mainBg from "@/assets/main-bg-mountain-lake.png";
import patchNotesBg from "@/assets/patch-notes-bg-twilight-lake.png";

const route = useRoute();
const isPatchNotes = computed(() => route.name === "patch-notes");
const backgroundSrc = computed(() => (isPatchNotes.value ? patchNotesBg : mainBg));
const backgroundPosition = computed(() =>
  isPatchNotes.value ? "center 45%" : "center 40%",
);
</script>

<template>
  <AppShell>
    <template #header>
      <Header />
    </template>
    <div class="relative h-full">
      <div class="absolute inset-0 overflow-hidden" aria-hidden="true">
        <img
          :src="backgroundSrc"
          alt=""
          class="h-full w-full object-cover"
          :style="{ objectPosition: backgroundPosition }"
        />
      </div>
      <main class="relative z-10 h-full p-6">
        <RouterView />
      </main>
    </div>
  </AppShell>
</template>
