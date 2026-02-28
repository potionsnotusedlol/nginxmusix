import { coverImage, escapeHtml, renderTrackTableRows } from "./shared.js";

export async function renderPlaylistsView(root, ctx) {
  root.innerHTML = '<div class="loading-panel">Loading playlists...</div>';

  const response = await ctx.api.getPlaylists();
  const playlists = response.items || [];

  root.innerHTML = `
    <section class="view-panel">
      <header class="section-header">
        <div>
          <h1>Playlists</h1>
          <p>Collections generated from your metadata file.</p>
        </div>
      </header>

      ${playlists.length ? `
        <div class="card-grid">
          ${playlists.map((playlist) => `
            <article class="card">
              <div class="card-cover">${coverImage(playlist.coverUrl, `${playlist.name} cover`)}</div>
              <h3>${escapeHtml(playlist.name)}</h3>
              <p>${escapeHtml(playlist.description || "No description.")}</p>
              <div class="track-meta-small">${playlist.trackCount} tracks</div>
              <div class="card-actions">
                <button class="btn" data-action="open-playlist" data-playlist-slug="${escapeHtml(playlist.slug)}">Open</button>
                <button class="btn btn-primary" data-action="play-playlist" data-playlist-slug="${escapeHtml(playlist.slug)}">Play</button>
              </div>
            </article>
          `).join("")}
        </div>
      ` : '<div class="empty-panel">No playlists found.</div>'}
    </section>
  `;

  root.querySelectorAll('[data-action="open-playlist"]').forEach((button) => {
    button.addEventListener("click", () => {
      ctx.navigate(`/playlists/${encodeURIComponent(button.dataset.playlistSlug)}`);
    });
  });

  root.querySelectorAll('[data-action="play-playlist"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const slug = button.dataset.playlistSlug;
      const playlistData = await ctx.api.getPlaylistTracks(slug, {
        limit: 1000,
        includeUnavailable: 1
      });
      const tracks = ctx.decorateTracks(playlistData.items || []);
      ctx.playCollection(tracks, tracks[0] ? tracks[0].id : null);
    });
  });
}

export async function renderPlaylistDetailView(root, ctx, route) {
  root.innerHTML = '<div class="loading-panel">Loading playlist...</div>';

  const slug = route.params.slug;
  const response = await ctx.api.getPlaylistTracks(slug, {
    limit: 1000,
    includeUnavailable: 1
  });
  const tracks = ctx.decorateTracks(response.items || []);
  const playlist = response.playlist;

  root.innerHTML = `
    <section class="view-panel">
      <header class="section-header">
        <div>
          <h1>${escapeHtml(playlist.name)}</h1>
          <p>${escapeHtml(playlist.description || "Playlist view.")}</p>
          <div class="track-meta-small">${response.total} tracks</div>
        </div>
        <div class="card-actions">
          <button id="playlist-back-btn" class="btn">Back</button>
          <button id="playlist-play-btn" class="btn btn-primary" ${tracks.length ? "" : "disabled"}>Play</button>
        </div>
      </header>

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
    </section>
  `;

  root.querySelector("#playlist-back-btn").addEventListener("click", () => {
    ctx.navigate("/playlists");
  });

  root.querySelector("#playlist-play-btn").addEventListener("click", () => {
    ctx.playCollection(tracks, tracks[0] ? tracks[0].id : null);
  });

  root.querySelectorAll('[data-action="play-track"]').forEach((button) => {
    button.addEventListener("click", () => {
      const trackId = button.dataset.trackId;
      ctx.playCollection(tracks, trackId);
    });
  });
}
