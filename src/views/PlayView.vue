<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { openUrl } from "@tauri-apps/plugin-opener";
import PrimaryButton from "@/components/PrimaryButton.vue";
import { useInstallStore } from "@/stores/install";
import titleWordmark from "@/assets/shadow-infection-title.png";

const productUrl = `${(
  import.meta.env.VITE_WEBSITE_URL ?? "https://shadowinfection.com"
).replace(/\/$/, "")}/product`;

const install = useInstallStore();
const {
  phase,
  loading,
  percent,
  downloaded,
  total,
  progressPhase,
  error,
  lastError,
  localVersion,
  remoteVersion,
  installPath,
  isInstalled,
  updateAvailable,
  canInstallOrUpdate,
  canPlay,
  checkingUpdate,
  launching,
  hasLicence,
} = storeToRefs(install);

onMounted(async () => {
  await install.refreshStatus();
  await install.refreshLicence();
  await install.checkForUpdate({ applyAuto: true });
});

const showProgress = computed(
  () =>
    loading.value ||
    phase.value === "downloading" ||
    phase.value === "extracting",
);

const offerPurchase = computed(
  () => hasLicence.value === false && !showProgress.value,
);

const statusLabel = computed(() => {
  if (launching.value) {
    return "Starting game";
  }
  if (
    updateAvailable.value &&
    !showProgress.value &&
    hasLicence.value !== false
  ) {
    return "Update available";
  }
  switch (phase.value) {
    case "not_installed":
      return "Not installed";
    case "downloading":
      return "Downloading";
    case "extracting":
      return "Extracting";
    case "installed":
      return hasLicence.value === false ? "" : "Ready to play";
    case "failed":
      return "";
    default:
      return phase.value;
  }
});

const statusColor = computed(() => {
  if (launching.value || (updateAvailable.value && !showProgress.value)) {
    return "text-launcher-gold-bright";
  }
  switch (phase.value) {
    case "installed":
      return "text-launcher-gold";
    case "downloading":
    case "extracting":
      return "text-launcher-gold-bright";
    default:
      return "text-slate-400";
  }
});

const primaryLabel = computed(() => {
  if (phase.value === "downloading") {
    return "Downloading…";
  }
  if (phase.value === "extracting" || loading.value) {
    return "Installing…";
  }
  if (checkingUpdate.value) {
    return "Checking…";
  }
  if (launching.value) {
    return "Starting…";
  }
  if (offerPurchase.value) {
    return "Buy";
  }
  if (updateAvailable.value) {
    return "Update";
  }
  if (isInstalled.value) {
    return "Play";
  }
  if (phase.value === "failed") {
    return "Retry install";
  }
  return "Install";
});

const primaryEnabled = computed(
  () =>
    !checkingUpdate.value &&
    !launching.value &&
    (canPlay.value || canInstallOrUpdate.value || offerPurchase.value),
);

async function openProductPage() {
  try {
    await openUrl(productUrl);
  } catch (err) {
    console.error(err);
  }
}

async function onPrimaryClick() {
  if (hasLicence.value === false) {
    await openProductPage();
    return;
  }
  if (canPlay.value) {
    await install.launch();
    return;
  }
  const started = await install.startGameInstall();
  if (!started && install.hasLicence === false) {
    await openProductPage();
  }
}

const progressPercent = computed(() => {
  let raw = percent.value;
  if (raw == null || Number.isNaN(raw)) {
    const size = total.value;
    raw = size != null && size > 0 ? (downloaded.value / size) * 100 : 0;
  }
  return Math.min(Math.max(raw, 0), 100);
});

const progressLabel = computed(() => {
  if (progressPhase.value === "extract") {
    return "Extracting";
  }
  return `${install.formatBytes(downloaded.value)} / ${install.formatBytes(total.value)}`;
});

const progressPercentLabel = computed(
  () => `${progressPercent.value.toFixed(0)}%`,
);
</script>

<template>
  <div class="relative flex h-full flex-col overflow-hidden">
    <div class="relative flex h-full flex-col justify-between p-2 sm:p-4">
      <div>
        <img
          :src="titleWordmark"
          alt="Shadow Infection"
          class="title-wordmark w-72 max-w-full"
        />
      </div>

      <div class="space-y-4">
        <div
          v-if="error"
          class="flex items-start justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 font-body text-sm text-red-400"
          role="alert"
        >
          <p>{{ error }}</p>
          <button
            v-if="phase === 'installed' && lastError"
            type="button"
            class="shrink-0 text-xs font-medium text-red-300 underline decoration-red-300/50 underline-offset-2 hover:text-red-200"
            @click="install.dismissError()"
          >
            Dismiss
          </button>
        </div>

        <div v-if="showProgress" class="w-full space-y-1.5 font-body">
          <div class="flex justify-between text-xs text-slate-400">
            <span>{{ progressLabel }}</span>
            <span>{{ progressPercentLabel }}</span>
          </div>
          <div
            class="relative h-1.5 w-full overflow-hidden rounded-full border border-launcher-border bg-black/40"
          >
            <div
              :key="progressPhase"
              class="progress-bar-inner absolute inset-y-0 left-0"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 font-body">
          <span
            v-if="statusLabel"
            :class="`text-sm font-medium ${statusColor}`"
          >
            ● {{ statusLabel }}
          </span>
          <span v-if="localVersion" class="text-xs text-slate-500">
            v{{ localVersion }}
          </span>
          <span
            v-if="updateAvailable && remoteVersion"
            class="text-xs text-launcher-gold-dim"
          >
            → v{{ remoteVersion }}
          </span>
        </div>

        <p
          v-if="updateAvailable && !showProgress && !launching && !offerPurchase"
          class="font-body text-xs text-launcher-gold-dim"
        >
          A newer build is ready. Choose Update before playing.
        </p>

        <div class="flex items-center gap-3">
          <PrimaryButton
            class="min-w-48"
            :disabled="!primaryEnabled"
            :loading="showProgress || launching || checkingUpdate"
            @click="onPrimaryClick"
          >
            {{ primaryLabel }}
          </PrimaryButton>
          <button
            v-if="phase === 'failed' && !showProgress"
            type="button"
            class="font-body text-sm text-slate-400 underline decoration-slate-500/60 underline-offset-2 hover:text-slate-200"
            @click="install.dismissError()"
          >
            Cancel
          </button>
        </div>

        <p
          v-if="installPath"
          class="max-w-md truncate font-body text-xs text-slate-600"
          :title="installPath"
        >
          {{ installPath }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-wordmark {
  mix-blend-mode: lighten;
}

.progress-bar-inner {
  background: linear-gradient(
    90deg,
    var(--color-launcher-gold-dim) 0%,
    var(--color-launcher-gold) 100%
  );
}
</style>
