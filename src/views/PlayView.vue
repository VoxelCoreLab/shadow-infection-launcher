<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useInstallStore } from "@/stores/install";
import titleWordmark from "@/assets/shadow-infection-title.png";

const install = useInstallStore();
const {
  phase,
  loading,
  percent,
  downloaded,
  total,
  progressPhase,
  error,
  localVersion,
  remoteVersion,
  installPath,
  isInstalled,
  updateAvailable,
  canInstallOrUpdate,
  canPlay,
  checkingUpdate,
  launching,
} = storeToRefs(install);

onMounted(async () => {
  await install.refreshStatus();
  await install.checkForUpdate({ applyAuto: true });
});

const showProgress = computed(
  () =>
    loading.value ||
    phase.value === "downloading" ||
    phase.value === "extracting",
);

const statusLabel = computed(() => {
  if (updateAvailable.value && !showProgress.value) {
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
      return "Ready to play";
    case "failed":
      return "Error";
    default:
      return phase.value;
  }
});

const statusColor = computed(() => {
  if (updateAvailable.value && !showProgress.value) {
    return "text-amber-400";
  }
  switch (phase.value) {
    case "installed":
      return "text-emerald-400";
    case "downloading":
    case "extracting":
      return "text-amber-400";
    case "failed":
      return "text-red-400";
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
    (canPlay.value || canInstallOrUpdate.value),
);

async function onPrimaryClick() {
  if (canPlay.value) {
    await install.launch();
    return;
  }
  await install.startGameInstall();
}

const progressPercent = computed(() => {
  const raw = Math.min(Math.max(percent.value ?? 0, 0), 100);
  if (showProgress.value && raw < 2) {
    return 2;
  }
  return raw;
});

const progressLabel = computed(() => {
  if (progressPhase.value === "extract") {
    return "Extracting";
  }
  return `${install.formatBytes(downloaded.value)} / ${install.formatBytes(total.value)}`;
});

const progressPercentLabel = computed(
  () => `${(percent.value ?? 0).toFixed(0)}%`,
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
          class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 font-body text-sm text-red-400"
          role="alert"
        >
          {{ error }}
        </div>

        <div
          v-if="showProgress"
          class="w-full space-y-1.5 font-body"
        >
          <div class="flex justify-between text-xs text-slate-400">
            <span>{{ progressLabel }}</span>
            <span>{{ progressPercentLabel }}</span>
          </div>
          <div
            class="h-1.5 w-full overflow-hidden rounded-full border border-launcher-border bg-black/40"
          >
            <div
              class="progress-bar-inner h-full rounded-full transition-[width] duration-200"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 font-body">
          <span :class="`text-sm font-medium ${statusColor}`">
            ● {{ statusLabel }}
          </span>
          <span
            v-if="localVersion"
            class="text-xs text-slate-500"
          >
            v{{ localVersion }}
          </span>
          <span
            v-if="updateAvailable && remoteVersion"
            class="text-xs text-amber-500/80"
          >
            → v{{ remoteVersion }}
          </span>
        </div>

        <button
          type="button"
          class="play-action disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="!primaryEnabled"
          @click="onPrimaryClick"
        >
          {{ primaryLabel }}
        </button>

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

.play-action {
  min-width: 12rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(253, 199, 135, 0.35);
  background: linear-gradient(180deg, #fdc787 0%, #c4924d 100%);
  padding: 0.75rem 1.25rem;
  font-family: var(--font-display);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1a0f04;
  cursor: pointer;
}
</style>
