const THEME_STORAGE_KEY = "nginxmusix.theme.mode";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode) {
  const root = document.documentElement;
  const next = mode === "system" ? getSystemTheme() : mode;
  root.setAttribute("data-theme", next);
  root.setAttribute("data-theme-mode", mode);
  document.body.setAttribute("data-theme", next);
}

export function initTheme(selectElement) {
  if (!selectElement) {
    return;
  }

  let mode = "system";
  try {
    const saved = String(localStorage.getItem(THEME_STORAGE_KEY) || "").trim().toLowerCase();
    if (saved && ["system", "dark", "light"].includes(saved)) {
      mode = saved;
    }
  } catch (error) {
    mode = "system";
  }

  selectElement.value = mode;
  applyTheme(mode);

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const mediaListener = () => {
    if (mode === "system") {
      applyTheme(mode);
    }
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", mediaListener);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(mediaListener);
  }

  selectElement.addEventListener("change", () => {
    mode = selectElement.value;
    if (!["system", "dark", "light"].includes(mode)) {
      mode = "system";
    }
    applyTheme(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      // Ignore localStorage errors.
    }
  });
}
