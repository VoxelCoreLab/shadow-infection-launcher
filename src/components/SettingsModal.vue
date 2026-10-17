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
  () =>
    settings.loading ||
    settings.saving ||
    install.uninstalling ||
    install.isBusy,
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
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    @click.self="handleCancel"
  >
    <div
      class="settings-panel w-full max-w-lg space-y-5 rounded-lg border border-launcher-border bg-launcher-surface p-6 text-slate-100"
      role="dialog"
      aria-labelledby="settings-title"
    >
      <header class="flex items-start justify-between gap-3">
        <h2
          id="settings-title"
          class="font-display text-lg font-bold tracking-[0.08em] text-launcher-gold uppercase"
        >
          Settings
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
        class="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 font-body text-sm text-red-400"
        role="alert"
      >
        {{ settings.error || install.error }}
      </p>

      <section class="space-y-2">
        <label class="settings-label" for="install-path"> Install path </label>
        <div class="flex gap-2">
          <input
            id="install-path"
            v-model="settings.installPath"
            type="text"
            class="settings-input min-w-0 flex-1"
            :disabled="settingsBusy || pathLocked"
          />
          <button
            type="button"
            class="settings-ghost shrink-0"
            :disabled="settingsBusy || pathLocked"
            @click="settings.browse()"
          >
            Browse
          </button>
          <button
            type="button"
            class="settings-ghost shrink-0"
            :disabled="settingsBusy || pathLocked"
            @click="settings.resetToDefaultPath()"
          >
            Reset
          </button>
        </div>
        <p
          v-if="pathLocked && !install.isBusy && !install.uninstalling"
          class="font-body text-xs text-slate-500"
        >
          Uninstall the game before changing the install path.
        </p>
        <div class="flex flex-wrap items-center gap-3 font-body text-sm">
          <button
            type="button"
            class="cursor-pointer text-slate-400 underline decoration-slate-500/60 underline-offset-2 transition-colors hover:text-launcher-gold disabled:opacity-60"
            :disabled="settingsBusy"
            @click="settings.openFolder()"
          >
            Open folder
          </button>
          <template v-if="install.canUninstall || confirmUninstall">
            <button
              v-if="!confirmUninstall"
              type="button"
              class="cursor-pointer text-slate-400 transition-colors hover:text-red-400 disabled:opacity-60"
              :disabled="!install.canUninstall || install.uninstalling"
              @click="confirmUninstall = true"
            >
              Uninstall
            </button>
            <span v-else class="flex items-center gap-2">
              <span class="text-red-400">Uninstall game?</span>
              <button
                type="button"
                class="cursor-pointer font-medium text-red-300 hover:text-red-400 disabled:opacity-40"
                :disabled="install.uninstalling"
                @click="handleUninstall"
              >
                {{ install.uninstalling ? "…" : "Yes" }}
              </button>
              <button
                type="button"
                class="cursor-pointer text-slate-500 transition-colors hover:text-slate-200"
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
        class="flex items-center justify-between gap-4 border-t border-launcher-border pt-4"
      >
        <div>
          <p class="font-body font-medium text-slate-100">Automatic updates</p>
          <p class="font-body text-sm text-slate-500">
            Apply new versions on launch
          </p>
        </div>
        <button
          type="button"
          role="switch"
          class="settings-switch"
          :class="
            settings.updateMode === 'auto'
              ? 'settings-switch--on'
              : 'settings-switch--off'
          "
          :aria-checked="settings.updateMode === 'auto'"
          :disabled="settingsBusy"
          @click="settings.setAutoUpdates(settings.updateMode !== 'auto')"
        >
          <span
            class="settings-switch__knob"
            :class="{
              'settings-switch__knob--on': settings.updateMode === 'auto',
            }"
          />
        </button>
      </section>

      <footer
        class="flex justify-end gap-2 border-t border-launcher-border pt-4"
      >
        <button
          type="button"
          class="settings-ghost"
          :disabled="settings.saving || install.uninstalling || install.isBusy"
          @click="handleCancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="settings-save"
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
.settings-panel {
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(253, 199, 135, 0.06);
}

.settings-label {
  display: block;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-launcher-gold-dim);
}

.settings-input {
  border-radius: 0.5rem;
  border: 1px solid var(--color-launcher-border);
  background:
    linear-gradient(180deg, rgba(253, 199, 135, 0.06) 0%, transparent 50%),
    var(--color-launcher-surface);
  padding: 0.5rem 0.75rem;
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: white;
  outline: none;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease,
    opacity 150ms ease;
}
.settings-input:focus {
  border-color: var(--color-launcher-gold-dim);
  background:
    linear-gradient(180deg, rgba(253, 199, 135, 0.1) 0%, transparent 50%),
    var(--color-launcher-bg);
  box-shadow: 0 0 0 3px rgba(253, 199, 135, 0.12);
}
.settings-input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.settings-ghost {
  border-radius: 0.5rem;
  border: 1px solid var(--color-launcher-border);
  background: transparent;
  padding: 0.5rem 0.75rem;
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #e2e8f0;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    color 150ms ease,
    opacity 150ms ease;
}
.settings-ghost:hover:not(:disabled) {
  border-color: var(--color-launcher-gold-dim);
  color: var(--color-launcher-gold);
}
.settings-ghost:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.settings-save {
  border-radius: 0.5rem;
  border: 1px solid rgba(253, 199, 135, 0.35);
  background: linear-gradient(180deg, #fdc787 0%, #c4924d 100%);
  padding: 0.5rem 1rem;
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1a0f04;
  cursor: pointer;
  transition:
    filter 150ms ease,
    opacity 150ms ease;
}
.settings-save:hover:not(:disabled) {
  filter: brightness(1.08);
}
.settings-save:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.settings-switch {
  position: relative;
  height: 1.75rem;
  width: 3rem;
  border-radius: 9999px;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    opacity 150ms ease;
}
.settings-switch:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.settings-switch--on {
  border: 1px solid rgba(253, 199, 135, 0.55);
  background: var(--color-launcher-gold);
}
.settings-switch--off {
  border: 1px solid var(--color-launcher-border);
  background: var(--color-launcher-void);
}
.settings-switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  height: calc(1.75rem - 6px);
  width: calc(1.75rem - 6px);
  border-radius: 9999px;
  background: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  transition: transform 150ms ease;
}
.settings-switch__knob--on {
  transform: translateX(calc(3rem - 1.75rem));
}

.settings-close {
  display: flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  color: var(--color-launcher-gold-dim);
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
