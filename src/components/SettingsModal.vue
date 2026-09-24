<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useUiStore } from "@/stores/ui";
import { useSettingsStore } from "@/stores/settings";
import { useInstallStore } from "@/stores/install";
import IconClose from "@/components/icons/IconClose.vue";

const ui = useUiStore();
const settings = useSettingsStore();
const install = useInstallStore();

const confirmUninstall = ref(false);

/** Path edits are blocked while busy or while a local install/download is tracked. */
const pathLocked = computed(
  () =>
    install.isBusy ||
    install.uninstalling ||
    install.isInstalled ||
    install.phase === "failed" ||
    install.phase === "downloading" ||
    install.phase === "extracting",
);

const settingsBusy = computed(
  () => settings.loading || settings.saving || install.uninstalling || install.isBusy,
);

watch(
  () => ui.isSettingsOpen,
  (open) => {
    if (open) {
      confirmUninstall.value = false;
      void settings.load();
      void install.refreshStatus();
    }
  },
);

async function handleSave() {
  const ok = await settings.save();
  if (ok) {
    await install.refreshStatus();
    ui.closeSettings();
  }
}

function handleCancel() {
  settings.discard();
  confirmUninstall.value = false;
  ui.closeSettings();
}

async function handleUninstall() {
  const ok = await install.uninstall();
  if (ok) {
    confirmUninstall.value = false;
  }
}
</script>

<template>
  <div
    v-if="ui.isSettingsOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @click.self="handleCancel"
  >
    <div
      class="w-full max-w-lg space-y-5 rounded-lg border border-zinc-300 bg-white p-6 text-zinc-900 shadow-xl"
      role="dialog"
      aria-labelledby="settings-title"
    >
      <header class="flex items-start justify-between gap-3">
        <h2 id="settings-title" class="text-lg font-semibold tracking-wide">
          SETTINGS
        </h2>
        <button
          type="button"
          class="settings-close"
          aria-label="Close"
          @click="handleCancel"
        >
          <IconClose />
        </button>
      </header>

      <p
        v-if="settings.error || install.error"
        class="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        role="alert"
      >
        {{ settings.error || install.error }}
      </p>

      <section class="space-y-2">
        <label
          class="block text-xs font-semibold tracking-wide text-zinc-500"
          for="install-path"
        >
          INSTALL PATH
        </label>
        <div class="flex gap-2">
          <input
            id="install-path"
            v-model="settings.installPath"
            type="text"
            class="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
            :disabled="settingsBusy || pathLocked"
          />
          <button
            type="button"
            class="shrink-0 rounded border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-60"
            :disabled="settingsBusy || pathLocked"
            @click="settings.browse()"
          >
            Browse
          </button>
          <button
            type="button"
            class="shrink-0 rounded border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 disabled:opacity-60"
            :disabled="settingsBusy || pathLocked"
            @click="settings.resetToDefaultPath()"
          >
            Reset
          </button>
        </div>
        <p
          v-if="pathLocked && !install.isBusy && !install.uninstalling"
          class="text-xs text-zinc-500"
        >
          Uninstall the game before changing the install path.
        </p>
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            class="text-zinc-600 underline-offset-2 hover:underline disabled:opacity-60"
            :disabled="settingsBusy"
            @click="settings.openFolder()"
          >
            Open folder
          </button>
          <template v-if="install.canUninstall || confirmUninstall">
            <button
              v-if="!confirmUninstall"
              type="button"
              class="text-zinc-600 transition-colors hover:text-red-600"
              :disabled="!install.canUninstall || install.uninstalling"
              @click="confirmUninstall = true"
            >
              Uninstall
            </button>
            <span v-else class="flex items-center gap-2">
              <span class="text-red-600">Uninstall game?</span>
              <button
                type="button"
                class="font-medium text-red-700 hover:text-red-500 disabled:opacity-40"
                :disabled="install.uninstalling"
                @click="handleUninstall"
              >
                {{ install.uninstalling ? "…" : "Yes" }}
              </button>
              <button
                type="button"
                class="text-zinc-500 hover:text-zinc-800"
                :disabled="install.uninstalling"
                @click="confirmUninstall = false"
              >
                No
              </button>
            </span>
          </template>
        </div>
      </section>

      <section
        class="flex items-center justify-between gap-4 border-t border-zinc-200 pt-4"
      >
        <div>
          <p class="font-medium">Automatic updates</p>
          <p class="text-sm text-zinc-500">
            Apply new versions on launch
          </p>
        </div>
        <button
          type="button"
          role="switch"
          class="relative h-7 w-12 rounded-full transition-colors"
          :class="
            settings.updateMode === 'auto' ? 'bg-emerald-500' : 'bg-zinc-300'
          "
          :aria-checked="settings.updateMode === 'auto'"
          :disabled="settingsBusy"
          @click="settings.setAutoUpdates(settings.updateMode !== 'auto')"
        >
          <span
            class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform"
            :class="
              settings.updateMode === 'auto' ? 'translate-x-5' : 'translate-x-0'
            "
          />
        </button>
      </section>

      <footer class="flex justify-end gap-2 border-t border-zinc-200 pt-4">
        <button
          type="button"
          class="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
          :disabled="settings.saving || install.uninstalling || install.isBusy"
          @click="handleCancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded border-2 border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          :disabled="settingsBusy"
          @click="handleSave"
        >
          Save
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.settings-close {
  display: flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  color: #71717a;
  cursor: pointer;
  transition:
    color 150ms ease,
    background-color 150ms ease;
}
.settings-close:hover {
  background: rgba(239, 68, 68, 0.85);
  color: white;
}
</style>
