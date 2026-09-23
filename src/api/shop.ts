import { Api } from "./generated/shop/Api";
import { fetchWithAuthRetry, firebaseSecurityWorker } from "./firebase-auth";

const DEFAULT_SHOP_API_URL = "https://shop-api.shadowinfection.com";

export const shopApi = new Api({
  baseUrl: import.meta.env.VITE_SHOP_API_URL ?? DEFAULT_SHOP_API_URL,
  securityWorker: firebaseSecurityWorker,
  customFetch: fetchWithAuthRetry,
});
