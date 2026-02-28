const COLLAPSE_STORAGE_KEY = "nginxmusix.sidebar.collapsed";

export function initSidebar(options) {
  const {
    collapseButton,
    mobileMenuButton,
    navRoot
  } = options;

  if (!collapseButton || !mobileMenuButton || !navRoot) {
    return {
      setActive() {}
    };
  }

  let collapsed = false;

  try {
    collapsed = localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch (error) {
    collapsed = false;
  }

  function applyCollapsedState(value) {
    collapsed = Boolean(value);
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    document.documentElement.setAttribute("data-sidebar-collapsed", collapsed ? "1" : "0");
    collapseButton.textContent = collapsed ? "Expand" : "Collapse";
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
    } catch (error) {
      // Ignore localStorage errors.
    }
  }

  applyCollapsedState(collapsed);

  collapseButton.addEventListener("click", () => {
    applyCollapsedState(!collapsed);
  });

  mobileMenuButton.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
    const isOpen = document.body.classList.contains("sidebar-open");
    document.documentElement.setAttribute("data-sidebar-open", isOpen ? "1" : "0");
  });

  navRoot.addEventListener("click", (event) => {
    const target = event.target.closest("a");
    if (!target) {
      return;
    }
    if (window.matchMedia("(max-width: 980px)").matches) {
      document.body.classList.remove("sidebar-open");
      document.documentElement.setAttribute("data-sidebar-open", "0");
    }
  });

  document.addEventListener("click", (event) => {
    if (!window.matchMedia("(max-width: 980px)").matches) {
      return;
    }

    if (!document.body.classList.contains("sidebar-open")) {
      return;
    }

    const clickedInsideSidebar = event.target.closest("#sidebar");
    const clickedToggle = event.target.closest("#mobile-menu-btn");
    if (clickedInsideSidebar || clickedToggle) {
      return;
    }

    document.body.classList.remove("sidebar-open");
    document.documentElement.setAttribute("data-sidebar-open", "0");
  });

  function setActive(sectionName) {
    const navLinks = navRoot.querySelectorAll("a[data-nav]");
    navLinks.forEach((link) => {
      link.classList.toggle("active", link.dataset.nav === sectionName);
    });
  }

  return {
    setActive
  };
}
