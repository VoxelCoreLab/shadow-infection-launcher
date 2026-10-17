<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  PrimaryButtonEffect,
  type PrimaryButtonEffectState,
} from "@/lib/primary-button-effect";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    loading?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    disabled: false,
    loading: false,
    type: "button",
  },
);

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const buttonEl = ref<HTMLButtonElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const isDisabled = computed(() => props.disabled || props.loading);

const state: PrimaryButtonEffectState = {
  hover: 0,
  press: 0,
  pointerX: 0,
  pointerY: 0,
  reducedMotion: false,
};

let effect: PrimaryButtonEffect | null = null;
let frameId = 0;
let running = false;
let alive = true;
let lastTime = 0;
let targetHover = 0;
let targetPress = 0;
let resizeObserver: ResizeObserver | null = null;
let mediaQuery: MediaQueryList | null = null;

function shouldRun(): boolean {
  return (
    alive &&
    effect !== null &&
    !isDisabled.value &&
    !state.reducedMotion &&
    document.visibilityState === "visible"
  );
}

function haltLoop(): void {
  running = false;
  if (frameId !== 0) {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
  effect?.clear();
}

function frame(now: number): void {
  frameId = 0;
  if (!shouldRun() || !effect) {
    running = false;
    if (alive) effect?.clear();
    return;
  }

  const deltaSeconds = Math.min(Math.max(now - lastTime, 0), 100) / 1000;
  lastTime = now;
  const ease = 1 - Math.pow(0.001, deltaSeconds);
  state.hover += (targetHover - state.hover) * ease;
  state.press += (targetPress - state.press) * ease;
  effect.update(state, deltaSeconds);
  frameId = requestAnimationFrame(frame);
}

function startLoop(): void {
  if (running || !shouldRun()) return;
  running = true;
  lastTime = performance.now();
  frameId = requestAnimationFrame(frame);
}

function syncLoop(): void {
  if (isDisabled.value) {
    targetHover = 0;
    targetPress = 0;
    state.hover = 0;
    state.press = 0;
  }
  if (shouldRun()) {
    startLoop();
    return;
  }
  haltLoop();
}

function updatePointer(event: PointerEvent): void {
  const rect = buttonEl.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return;
  state.pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
}

function onPointerEnter(event: PointerEvent): void {
  if (isDisabled.value) return;
  targetHover = 1;
  updatePointer(event);
}

function onPointerMove(event: PointerEvent): void {
  if (isDisabled.value) return;
  updatePointer(event);
}

function onPointerLeave(): void {
  targetPress = 0;
  if (document.activeElement !== buttonEl.value) targetHover = 0;
}

function onPointerDown(): void {
  if (isDisabled.value) return;
  targetPress = 1;
}

function onPointerUp(): void {
  targetPress = 0;
}

function onPointerCancel(): void {
  targetPress = 0;
}

function onFocus(): void {
  if (isDisabled.value) return;
  targetHover = 1;
}

function onBlur(): void {
  targetPress = 0;
  if (!buttonEl.value?.matches(":hover")) targetHover = 0;
}

function onClick(): void {
  if (isDisabled.value || state.reducedMotion) return;
  effect?.triggerRelease();
}

function onReducedMotionChange(event: MediaQueryListEvent): void {
  state.reducedMotion = event.matches;
  syncLoop();
}

onMounted(() => {
  const canvas = canvasEl.value;
  const button = buttonEl.value;
  if (!canvas || !button) return;

  mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  state.reducedMotion = mediaQuery.matches;
  mediaQuery.addEventListener("change", onReducedMotionChange);
  document.addEventListener("visibilitychange", syncLoop);

  effect = new PrimaryButtonEffect(canvas);
  const syncSize = () => {
    effect?.resize(button.clientWidth, button.clientHeight);
  };
  syncSize();
  resizeObserver = new ResizeObserver(syncSize);
  resizeObserver.observe(button);
  void document.fonts.ready.then(() => {
    if (alive) syncSize();
  });

  if (!isDisabled.value && button.matches(":hover")) targetHover = 1;
  syncLoop();
});

watch(isDisabled, (disabled) => {
  if (!disabled && buttonEl.value?.matches(":hover")) {
    targetHover = 1;
  }
  syncLoop();
});

onBeforeUnmount(() => {
  alive = false;
  haltLoop();
  mediaQuery?.removeEventListener("change", onReducedMotionChange);
  document.removeEventListener("visibilitychange", syncLoop);
  resizeObserver?.disconnect();
  effect = null;
});
</script>

<template>
  <button
    ref="buttonEl"
    :type="type"
    :disabled="isDisabled"
    class="primary-button"
    @pointerenter="onPointerEnter"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @focus="onFocus"
    @blur="onBlur"
    @click="onClick"
  >
    <span class="primary-button-effects" aria-hidden="true">
      <canvas ref="canvasEl"></canvas>
    </span>
    <span class="primary-button-texture" aria-hidden="true"></span>
    <span class="primary-button-content">
      <span v-if="loading" class="primary-button-spinner" aria-hidden="true" />
      <slot />
    </span>
  </button>
</template>

<style scoped>
.primary-button {
  position: relative;
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  overflow: hidden;
  padding: 0.7rem 2.25rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-radius: 0.5rem;
  border: 1px solid var(--color-launcher-gold-dim);
  background:
    linear-gradient(180deg, rgba(253, 199, 135, 0.06) 0%, transparent 40%),
    linear-gradient(
      180deg,
      var(--color-launcher-surface) 0%,
      var(--color-launcher-bg) 100%
    );
  background-size: 100% 100%;
  color: var(--color-launcher-gold);
  box-shadow:
    inset 0 1px 0 rgba(253, 199, 135, 0.12),
    inset 0 -6px 10px -6px rgba(0, 0, 0, 0.6);
  cursor: pointer;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    transform 120ms ease,
    box-shadow 180ms ease;
}

.primary-button:hover:not(:disabled) {
  border-color: var(--color-launcher-gold);
  color: var(--color-launcher-gold-bright);
}

.primary-button:focus-visible {
  outline: 2px solid var(--color-launcher-gold);
  outline-offset: 2px;
}

.primary-button:active:not(:disabled) {
  transform: scale(0.985);
  color: var(--color-launcher-gold-dim);
  border-color: var(--color-launcher-gold-dim);
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.25) 0%, transparent 40%),
    linear-gradient(
      180deg,
      var(--color-launcher-void) 0%,
      var(--color-launcher-surface) 100%
    );
}

.primary-button:disabled {
  cursor: not-allowed;
  filter: grayscale(0.55) brightness(0.65);
  opacity: 0.65;
  transform: none;
}

.primary-button-effects,
.primary-button-texture {
  position: absolute;
  inset: 0;
  display: block;
  pointer-events: none;
  border-radius: inherit;
}

.primary-button-effects canvas {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.primary-button-texture {
  opacity: 0.05;
  background-image: repeating-linear-gradient(
    45deg,
    #fff 0,
    #fff 1px,
    transparent 1px,
    transparent 5px
  );
  mix-blend-mode: overlay;
}

.primary-button-content {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.primary-button-spinner {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  box-sizing: border-box;
  border-radius: 9999px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: primary-button-spin 0.8s linear infinite;
}

@keyframes primary-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .primary-button {
    transition-duration: 1ms;
  }

  .primary-button:active:not(:disabled) {
    transform: none;
  }
}
</style>
