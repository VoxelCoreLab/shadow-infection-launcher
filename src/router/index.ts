import { createRouter, createWebHistory } from "vue-router";
import AuthLayout from "@/layouts/AuthLayout.vue";
import AppLayout from "@/layouts/AppLayout.vue";
import LoginView from "@/views/LoginView.vue";
import PlayView from "@/views/PlayView.vue";
import PatchNotesView from "@/views/PatchNotesView.vue";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      component: AuthLayout,
      meta: { guest: true },
      children: [
        {
          path: "",
          name: "login",
          component: LoginView,
        },
      ],
    },
    {
      path: "/",
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: "",
          redirect: "/play",
        },
        {
          path: "play",
          name: "play",
          component: PlayView,
        },
        {
          path: "patch-notes",
          name: "patch-notes",
          component: PatchNotesView,
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.initialize();

  if (
    to.matched.some((record) => record.meta.requiresAuth) &&
    !auth.isLoggedIn
  ) {
    return { name: "login" };
  }

  if (to.matched.some((record) => record.meta.guest) && auth.isLoggedIn) {
    return { name: "play" };
  }
});

export default router;
