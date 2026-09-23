<script setup lang="ts">
import { onMounted, ref } from "vue";
import PagePlaceholder from "@/components/PagePlaceholder.vue";
import {
  fetchDownloadForPlatform,
  fetchLatestVersions,
  patchNotesApi,
  shopApi,
} from "@/api";
import { detectGameDownloadPlatform } from "@/lib/platform";

type ApiProbe = {
  label: string;
  status: "pending" | "ok" | "error";
  detail: string;
};

const platform = detectGameDownloadPlatform();

const probes = ref<ApiProbe[]>([
  { label: "Patch Notes API (öffentlich)", status: "pending", detail: "…" },
  { label: "Shop API (öffentlich)", status: "pending", detail: "…" },
  { label: "Shop API Lizenz (Bearer)", status: "pending", detail: "…" },
  {
    label: "Shop API Versionen (/game-downloads/latest)",
    status: "pending",
    detail: "…",
  },
  {
    label: `Shop API Download-URL (${platform})`,
    status: "pending",
    detail: "…",
  },
]);

async function probe(
  index: number,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    const data = await run();
    probes.value[index] = {
      ...probes.value[index],
      status: "ok",
      detail: JSON.stringify(data, null, 2),
    };
  } catch (err) {
    probes.value[index] = {
      ...probes.value[index],
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

onMounted(() => {
  void probe(0, async () => {
    const res = await patchNotesApi.appControllerGetRoot();
    return res.data;
  });
  void probe(1, async () => {
    const res = await shopApi.appControllerGetHello();
    return res.data;
  });
  void probe(2, async () => {
    const res = await shopApi.gameLicences.gameLicencesControllerGetMyLicence();
    return res.data;
  });
  void probe(3, () => fetchLatestVersions());
  void probe(4, () => fetchDownloadForPlatform(platform));
});
</script>

<template>
  <PagePlaceholder title="This is the Play page">
    <div class="flex w-full flex-col gap-3 text-sm">
      <p class="text-muted-foreground opacity-80">
        Smoke-Test der API-Clients inkl. Versions- und Download-Endpunkte
        (ohne Datei-Download).
      </p>
      <article
        v-for="probeItem in probes"
        :key="probeItem.label"
        class="rounded border border-white/10 bg-black/20 p-3"
      >
        <header
          class="mb-2 flex items-center justify-between gap-2 font-medium"
        >
          <span>{{ probeItem.label }}</span>
          <span
            :class="{
              'text-amber-300': probeItem.status === 'pending',
              'text-emerald-300': probeItem.status === 'ok',
              'text-rose-300': probeItem.status === 'error',
            }"
          >
            {{ probeItem.status }}
          </span>
        </header>
        <pre
          class="overflow-x-auto whitespace-pre-wrap break-all text-xs opacity-90"
          >{{ probeItem.detail }}</pre>
      </article>
    </div>
  </PagePlaceholder>
</template>
