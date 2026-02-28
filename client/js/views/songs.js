import { escapeHtml, renderTrackTableRows } from "./shared.js";

function parsePage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export async function renderSongsView(root, ctx, route) {
  root.innerHTML = '<div class="loading-panel">Loading songs...</div>';

  const isSearch = route.name === "search";
  const search = isSearch ? (route.query.q || "").trim() : "";
  const sort = route.query.sort || (isSearch ? "recent" : "title");
  const page = parsePage(route.query.page);
  const limit = 50;
  const offset = (page - 1) * limit;

  const response = await ctx.api.getTracks({
    search,
    sort,
    limit,
    offset,
    includeUnavailable: 1
  });

  const tracks = ctx.decorateTracks(response.items || []);
  const totalPages = Math.max(1, Math.ceil((response.total || 0) / limit));
  const path = isSearch ? "/search" : "/songs";

  root.innerHTML = `
    <section class="view-panel">
      <header class="section-header">
        <div>
          <h1>${isSearch ? "Search Results" : "Songs"}</h1>
          <p>
            ${isSearch
              ? `Results for "${escapeHtml(search || "empty query")}"`
              : "All indexed tracks across your library."}
          </p>
        </div>
        <button class="btn btn-primary" id="play-visible-btn" ${tracks.length ? "" : "disabled"}>Play Visible</button>
      </header>

      <div class="filters-bar">
        <div class="track-meta-small">Showing ${tracks.length} of ${response.total} tracks</div>
        <label>
          Sort
          <select id="songs-sort-select">
            <option value="title" ${sort === "title" ? "selected" : ""}>Title</option>
            <option value="artist" ${sort === "artist" ? "selected" : ""}>Artist</option>
            <option value="album" ${sort === "album" ? "selected" : ""}>Album</option>
            <option value="year" ${sort === "year" ? "selected" : ""}>Year</option>
            <option value="recent" ${sort === "recent" ? "selected" : ""}>Recent</option>
          </select>
        </label>
      </div>

      <div class="table-wrap">
        <table class="track-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Album</th>
              <th>Tags</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${renderTrackTableRows(tracks)}</tbody>
        </table>
      </div>

      <div class="filters-bar">
        <button id="songs-prev-page" class="btn" ${page <= 1 ? "disabled" : ""}>Previous</button>
        <div class="track-meta-small">Page ${page} / ${totalPages}</div>
        <button id="songs-next-page" class="btn" ${page >= totalPages ? "disabled" : ""}>Next</button>
      </div>
    </section>
  `;

  const sortSelect = root.querySelector("#songs-sort-select");
  sortSelect.addEventListener("change", () => {
    const nextQuery = {
      ...route.query,
      sort: sortSelect.value,
      page: 1
    };
    if (!isSearch) {
      delete nextQuery.q;
    }
    ctx.navigate(path, nextQuery);
  });

  root.querySelector("#play-visible-btn").addEventListener("click", () => {
    ctx.playCollection(tracks, tracks[0] ? tracks[0].id : null);
  });

  root.querySelectorAll('[data-action="play-track"]').forEach((button) => {
    button.addEventListener("click", () => {
      const trackId = button.dataset.trackId;
      ctx.playCollection(tracks, trackId);
    });
  });

  root.querySelector("#songs-prev-page").addEventListener("click", () => {
    if (page <= 1) {
      return;
    }
    ctx.navigate(path, {
      ...route.query,
      sort,
      page: page - 1
    });
  });

  root.querySelector("#songs-next-page").addEventListener("click", () => {
    if (page >= totalPages) {
      return;
    }
    ctx.navigate(path, {
      ...route.query,
      sort,
      page: page + 1
    });
  });
}
