<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppShell from "@/layouts/AppShell.vue";
import FantasyBackground from "@/components/FantasyBackground.vue";
import Header from "@/components/Header.vue";
import mainBg from "@/assets/main-bg-mountain-lake.png";
import patchNotesBg from "@/assets/patch-notes-bg-twilight-lake.png";

const route = useRoute();
const isPatchNotes = computed(() => route.name === "patch-notes");
const backgroundSrc = computed(() =>
  isPatchNotes.value ? patchNotesBg : mainBg,
);
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
      <FantasyBackground
        :src="backgroundSrc"
        :object-position="backgroundPosition"
      />
      <main class="relative z-10 h-full p-6">
        <RouterView />
      </main>
    </div>
  </AppShell>
</template>
