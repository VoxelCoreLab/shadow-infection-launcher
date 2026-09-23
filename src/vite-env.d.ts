/// <reference types="vite/client" />

export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string;
    readonly VITE_FIREBASE_AUTH_DOMAIN: string;
    readonly VITE_FIREBASE_PROJECT_ID: string;
    readonly VITE_FIREBASE_STORAGE_BUCKET: string;
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
    readonly VITE_FIREBASE_APP_ID: string;
    readonly VITE_WEBSITE_URL?: string;
    readonly VITE_PATCH_NOTES_API_URL?: string;
    readonly VITE_SHOP_API_URL?: string;
  }
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<
    Record<string, never>,
    Record<string, never>,
    unknown
  >;
  export default component;
}

declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    guest?: boolean;
  }
}
