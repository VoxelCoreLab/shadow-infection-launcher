<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAuthStore } from "@/stores/auth";
import titleLogo from "@/assets/shadow-infection-logo.png";

const router = useRouter();
const auth = useAuthStore();

const email = ref("");
const password = ref("");

const websiteUrl = (
  import.meta.env.VITE_WEBSITE_URL ?? "https://shadowinfection.com"
).replace(/\/$/, "");

watch([email, password], () => auth.clearError());

async function handleSubmit() {
  const ok = await auth.login(email.value, password.value);
  if (ok) {
    await router.push({ name: "play" });
  }
}

async function openWebsitePath(path: string) {
  try {
    await openUrl(`${websiteUrl}${path}`);
  } catch (err) {
    console.error(err);
  }
}
</script>

<template>
  <div class="w-full max-w-sm px-2">
    <div class="text-center">
      <img
        :src="titleLogo"
        alt="Shadow Infection"
        class="title-logo mx-auto w-full"
      />
    </div>

    <form class="space-y-3" @submit.prevent="handleSubmit">
      <input
        v-model="email"
        type="email"
        placeholder="Email address"
        required
        autocomplete="email"
        class="launcher-input"
      />

      <input
        v-model="password"
        type="password"
        placeholder="Password"
        required
        autocomplete="current-password"
        class="launcher-input"
      />

      <div
        v-if="auth.error"
        class="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-center font-body text-sm text-red-400"
      >
        {{ auth.error }}
      </div>

      <button type="submit" class="login-submit" :disabled="auth.loading">
        {{ auth.loading ? "Logging in" : "Log In" }}
      </button>
    </form>

    <div class="mt-5 flex items-center justify-center gap-4 text-center">
      <button
        type="button"
        class="font-body text-sm text-slate-500 transition-colors hover:text-launcher-gold"
        @click="openWebsitePath('/forgot-password')"
      >
        Forgot password?
      </button>
      <button
        type="button"
        class="font-body text-sm text-slate-500 transition-colors hover:text-launcher-gold"
        @click="openWebsitePath('/register')"
      >
        Create account
      </button>
    </div>
  </div>
</template>

<style scoped>
.launcher-input {
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid var(--color-launcher-border);
  background:
    linear-gradient(180deg, rgba(253, 199, 135, 0.06) 0%, transparent 50%),
    var(--color-launcher-surface);
  padding: 0.75rem 1rem;
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: white;
  outline: none;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease;
}
.launcher-input::placeholder {
  color: #64748b;
}
.launcher-input:focus {
  border-color: var(--color-launcher-gold-dim);
  background:
    linear-gradient(180deg, rgba(253, 199, 135, 0.1) 0%, transparent 50%),
    var(--color-launcher-bg);
  box-shadow: 0 0 0 3px rgba(253, 199, 135, 0.12);
}

.login-submit {
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid rgba(253, 199, 135, 0.35);
  background: linear-gradient(180deg, #fdc787 0%, #c4924d 100%);
  padding: 0.75rem 1rem;
  font-family: var(--font-display);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1a0f04;
  cursor: pointer;
  transition:
    filter 150ms ease,
    opacity 150ms ease;
}
.login-submit:hover:not(:disabled) {
  filter: brightness(1.08);
}
.login-submit:disabled {
  cursor: wait;
  opacity: 0.7;
}

.title-logo {
  mix-blend-mode: lighten;
}
</style>
