export function initSearch(options) {
  const { form, input, navigateToSearch } = options;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      navigateToSearch("");
      return;
    }
    navigateToSearch(query);
  });

  return {
    sync(route) {
      if (route.name === "search") {
        input.value = route.query.q || "";
      } else if (!document.activeElement || document.activeElement !== input) {
        input.value = "";
      }
    }
  };
}
