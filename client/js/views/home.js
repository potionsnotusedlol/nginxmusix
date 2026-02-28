import { coverImage, escapeHtml, renderTrackTableRows } from "./shared.js";

export async function renderHomeView(root, ctx) {
  root.innerHTML = '<div class="loading-panel">Loading home...</div>';

  const [summary, playlistsResponse, recentResponse] = await Promise.all([
    ctx.api.getLibrarySummary(),
    ctx.api.getPlaylists(),
    ctx.api.getTracks({
      limit: 12,
      sort: "recent"
    })
  ]);

  const playlists = playlistsResponse.items || [];
  const recentTracks = ctx.decorateTracks(recentResponse.items || []);

  root.innerHTML = `
    <section class="view-panel">
      <header class="section-header">
        <div>
          <h1>Home</h1>
          <p>Your private library with persistent playback and tag filtering.</p>
        </div>
      </header>

      <div class="summary-grid">
        <article class="summary-card">
          <strong>${summary.tracks.available}</strong>
          <span>Playable Tracks</span>
        </article>
        <article class="summary-card">
          <strong>${summary.playlists}</strong>
          <span>Playlists</span>
        </article>
        <article class="summary-card">
          <strong>${summary.tags}</strong>
          <span>Tags</span>
        </article>
        <article class="summary-card">
          <strong>${summary.tracks.unavailable}</strong>
          <span>Unavailable Files</span>
        </article>
      </div>

      <section class="view-panel">
        <header class="section-header">
          <h2>Featured Playlists</h2>
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
        ` : '<div class="empty-panel">No playlists available. Add playlists in data/library.json and run rescan.</div>'}
      </section>

      <section class="view-panel">
        <header class="section-header">
          <h2>Recently Indexed Tracks</h2>
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
            <tbody>
              ${renderTrackTableRows(recentTracks)}
            </tbody>
          </table>
        </div>
      </section>
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
      const response = await ctx.api.getPlaylistTracks(slug, {
        limit: 500,
        includeUnavailable: 1
      });
      const tracks = ctx.decorateTracks(response.items || []);
      ctx.playCollection(tracks, tracks[0] ? tracks[0].id : null);
    });
  });

  root.querySelectorAll('[data-action="play-track"]').forEach((button) => {
    button.addEventListener("click", () => {
      const trackId = button.dataset.trackId;
      ctx.playCollection(recentTracks, trackId);
    });
  });
}
