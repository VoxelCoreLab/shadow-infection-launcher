<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    src: string;
    objectPosition?: string;
    variant?: "app" | "login";
  }>(),
  { objectPosition: "center 40%", variant: "app" },
);

interface Layer {
  src: string;
  objectPosition: string;
}

const layers = ref<[Layer, Layer]>([
  { src: props.src, objectPosition: props.objectPosition },
  { src: props.src, objectPosition: props.objectPosition },
]);
const active = ref<0 | 1>(0);
const ready = ref(false);

let loadToken = 0;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const swapTo = async (src: string, objectPosition: string) => {
  const token = ++loadToken;
  const incoming: 0 | 1 = active.value === 0 ? 1 : 0;

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load background: ${src}`));
    img.src = src;
  }).catch(() => {
    /* still swap so a missing frame does not stall the transition */
  });

  if (token !== loadToken) return;

  layers.value[incoming] = { src, objectPosition };
  await nextTick();

  if (prefersReducedMotion()) {
    active.value = incoming;
    return;
  }

  requestAnimationFrame(() => {
    if (token !== loadToken) return;
    active.value = incoming;
  });
};

watch(
  () => [props.src, props.objectPosition] as const,
  ([src, objectPosition]) => {
    const current = layers.value[active.value];
    if (current.src === src && current.objectPosition === objectPosition) return;
    void swapTo(src, objectPosition);
  },
);

onMounted(() => {
  requestAnimationFrame(() => {
    ready.value = true;
  });
});
</script>

<template>
  <div class="fantasy-background" aria-hidden="true">
    <img
      v-for="(layer, index) in layers"
      :key="index"
      :src="layer.src"
      alt=""
      class="fantasy-background-image"
      :class="{
        'is-ready': ready,
        'is-active': index === active,
      }"
      :style="{ objectPosition: layer.objectPosition }"
    />
    <div
      class="fantasy-background-scrim"
      :class="{ 'fantasy-background-scrim--login': variant === 'login' }"
    />
  </div>
</template>

<style scoped>
.fantasy-background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--color-launcher-void);
}

.fantasy-background::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  opacity: 0.035;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.fantasy-background::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 40%, transparent 35%, rgba(0, 4, 10, 0.55) 100%),
    linear-gradient(180deg, rgba(0, 4, 10, 0.35) 0%, transparent 18%, transparent 82%, rgba(0, 4, 10, 0.55) 100%);
}

.fantasy-background-image {
  position: absolute;
  inset: 0;
  height: 100%;
  width: 100%;
  object-fit: cover;
  opacity: 0;
  transform: scale(1.045);
  will-change: opacity, transform;
}

.fantasy-background-image.is-ready {
  transition:
    opacity 1.1s cubic-bezier(0.4, 0, 0.2, 1),
    transform 1.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.fantasy-background-image.is-active {
  opacity: 1;
  transform: scale(1);
}

.fantasy-background-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(0, 4, 10, 0.82) 0%, rgba(0, 4, 10, 0.42) 38%, rgba(0, 4, 10, 0.08) 68%, transparent 100%),
    linear-gradient(180deg, rgba(0, 4, 10, 0.5) 0%, transparent 22%, transparent 58%, rgba(0, 4, 10, 0.7) 100%);
}

.fantasy-background-scrim--login {
  background: radial-gradient(
    ellipse 42% 68% at 50% 48%,
    rgba(0, 4, 10, 0.5) 0%,
    transparent 72%
  );
}

@media (prefers-reduced-motion: reduce) {
  .fantasy-background-image,
  .fantasy-background-image.is-ready {
    transform: none;
    transition: none;
  }
}
</style>
