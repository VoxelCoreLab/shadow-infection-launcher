import { createRouter, createWebHistory } from "vue-router";
import AuthLayout from "@/layouts/AuthLayout.vue";
import AppLayout from "@/layouts/AppLayout.vue";
import LoginView from "@/views/LoginView.vue";
import SpielView from "@/views/SpielView.vue";
import PatchNotesView from "@/views/PatchNotesView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      component: AuthLayout,
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
      children: [
        {
          path: "",
          redirect: "/spiel",
        },
        {
          path: "spiel",
          name: "spiel",
          component: SpielView,
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

export default router;
