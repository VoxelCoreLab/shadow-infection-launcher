<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-semibold">{{ title }}</h1>
    <div class="flex flex-wrap gap-3 text-sm">
      <slot />
    </div>
  </section>
</template>
