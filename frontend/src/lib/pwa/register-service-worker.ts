const SERVICE_WORKER_PATH = "/sw.js";

export async function registerServiceWorker() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!("serviceWorker" in navigator)) {
    return null;
  }

  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
      scope: "/",
      updateViaCache: "none",
    });
  } catch {
    return null;
  }
}