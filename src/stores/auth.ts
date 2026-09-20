import { ref } from "vue";
import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", () => {
  const isLoggedIn = ref(false);

  return { isLoggedIn };
});
