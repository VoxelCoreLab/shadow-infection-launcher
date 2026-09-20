<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useUiStore } from "@/stores/ui";
import IconLogout from "@/components/icons/IconLogout.vue";
import IconSettings from "@/components/icons/IconSettings.vue";
import WindowControls from "@/components/WindowControls.vue";
import appIcon from "../../src-tauri/icons/icon.png";

const ui = useUiStore();
</script>

<template>
  <header
    data-tauri-drag-region
    class="flex h-12 shrink-0 items-center justify-between border-b border-launcher-border bg-launcher-surface px-4"
  >
    <div class="flex items-center gap-6">
      <div class="flex select-none items-center gap-2" data-tauri-drag-region>
        <img :src="appIcon" alt="Shadow Infection" class="h-6 w-6 object-contain" />
      </div>

      <nav class="flex items-center gap-1">
        <RouterLink
          to="/play"
          class="header-nav-link"
          exact-active-class="header-nav-link--active"
          data-tauri-drag-region="false"
        >
          Play
        </RouterLink>
        <RouterLink
          to="/patch-notes"
          class="header-nav-link"
          exact-active-class="header-nav-link--active"
          data-tauri-drag-region="false"
        >
          Patch Notes
        </RouterLink>
      </nav>
    </div>

    <div class="flex items-center gap-1">
      <button
        type="button"
        title="Settings"
        class="header-icon-button"
        data-tauri-drag-region="false"
        @click="ui.openSettings"
      >
        <IconSettings />
      </button>

      <RouterLink
        to="/login"
        title="Log out"
        class="header-icon-button"
        data-tauri-drag-region="false"
      >
        <IconLogout />
      </RouterLink>

      <WindowControls />
    </div>
  </header>
</template>

<style scoped>
.header-icon-button {
  display: flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  cursor: pointer;
  color: var(--color-launcher-gold-dim);
  text-decoration: none;
  transition: color 150ms ease, background-color 150ms ease;
}
.header-icon-button:hover {
  background: rgba(253, 199, 135, 0.1);
  color: var(--color-launcher-gold-bright);
}

.header-nav-link {
  display: flex;
  align-items: center;
  padding: 0.25rem 0.625rem;
  border-radius: 0.25rem;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  text-decoration: none;
  transition: color 150ms ease, background-color 150ms ease;
}
.header-nav-link:hover {
  background: rgba(253, 199, 135, 0.1);
  color: var(--color-launcher-gold-bright);
}
.header-nav-link--active {
  color: var(--color-launcher-gold);
}
</style>
