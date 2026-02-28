import { escapeHtml, renderTrackTableRows } from "./shared.js";

function tokenFrom(group, name) {
  return `${group}:${name}`;
}

function parseToken(token) {
  const split = String(token).indexOf(":");
  if (split === -1) {
    return { group: "custom", name: String(token) };
  }
  return {
    group: String(token).slice(0, split),
    name: String(token).slice(split + 1)
  };
}

function normalizeToken(raw) {
  const parsed = parseToken(raw);
  const group = String(parsed.group || "custom").trim();
  const name = String(parsed.name || "").trim();
  if (!name) {
    return "";
  }
  return `${group}:${name}`;
}

function extractSelectedTokens(route) {
  const selected = [];
  const seen = new Set();

  if (route.params.group && route.params.tag) {
    const token = normalizeToken(tokenFrom(route.params.group, route.params.tag));
    if (token && !seen.has(token)) {
      selected.push(token);
      seen.add(token);
    }
  }

  const extra = route.query.selected;
  const values = Array.isArray(extra) ? extra : [extra];
  values
    .filter(Boolean)
    .flatMap((entry) => String(entry).split(","))
    .map(normalizeToken)
    .filter(Boolean)
    .forEach((token) => {
      if (!seen.has(token)) {
        selected.push(token);
        seen.add(token);
      }
    });

  return selected;
}

function routeFromTokens(tokens) {
  if (!tokens.length) {
    return { path: "/tags", query: {} };
  }

  const [primary, ...rest] = tokens;
  const parsed = parseToken(primary);
  return {
    path: `/tags/${encodeURIComponent(parsed.group)}/${encodeURIComponent(parsed.name)}`,
    query: rest.length ? { selected: rest.join(",") } : {}
  };
}

export async function renderTagsView(root, ctx) {
  root.innerHTML = '<div class="loading-panel">Loading tags...</div>';

  const response = await ctx.api.getTags();
  const groups = response.grouped || {};
  const groupNames = Object.keys(groups);

  root.innerHTML = `
    <section class="view-panel">
      <header class="section-header">
        <div>
          <h1>Tags</h1>
          <p>Pick a tag to open filtered playback. Multi-tag filtering uses AND mode.</p>
        </div>
      </header>

      ${groupNames.length ? groupNames.map((groupName) => `
        <section class="view-panel">
          <div class="section-header">
            <h2>${escapeHtml(groupName)}</h2>
          </div>
          <div class="pill-row">
            ${groups[groupName].map((tag) => `
              <button
                class="pill"
                data-action="open-tag"
                data-group="${escapeHtml(tag.group)}"
                data-tag="${escapeHtml(tag.name)}"
              >
                ${escapeHtml(tag.name)}
                <span class="track-meta-small">${tag.trackCount}</span>
              </button>
            `).join("")}
          </div>
        </section>
      `).join("") : '<div class="empty-panel">No tags available.</div>'}
    </section>
  `;

  root.querySelectorAll('[data-action="open-tag"]').forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.group;
      const tag = button.dataset.tag;
      ctx.navigate(`/tags/${encodeURIComponent(group)}/${encodeURIComponent(tag)}`);
    });
  });
}

export async function renderTagDetailView(root, ctx, route) {
  root.innerHTML = '<div class="loading-panel">Loading tagged tracks...</div>';

  const selectedTokens = extractSelectedTokens(route);
  if (!selectedTokens.length) {
    ctx.navigate("/tags");
    return;
  }

  const [tagsResponse, tracksResponse] = await Promise.all([
    ctx.api.getTags(),
    ctx.api.getTracks({
      tag: selectedTokens,
      includeUnavailable: 1,
      limit: 1000
    })
  ]);

  const tagsByGroup = tagsResponse.grouped || {};
  const tracks = ctx.decorateTracks(tracksResponse.items || []);

  root.innerHTML = `
    <section class="view-panel">
      <header class="section-header">
        <div>
          <h1>Tagged Tracks</h1>
          <p>AND filter: every selected tag must exist on each track.</p>
        </div>
        <div class="card-actions">
          <button id="tag-back-btn" class="btn">All Tags</button>
          <button id="tag-play-btn" class="btn btn-primary" ${tracks.length ? "" : "disabled"}>Play Filtered</button>
        </div>
      </header>

      <section class="view-panel">
        <div class="track-meta-small">Selected filters</div>
        <div class="pill-row" id="selected-tags-row">
          ${selectedTokens.map((token) => `
            <button class="pill active" data-action="toggle-selected" data-token="${escapeHtml(token)}">
              ${escapeHtml(token)}
            </button>
          `).join("")}
        </div>
      </section>

      ${Object.keys(tagsByGroup).map((group) => `
        <section class="view-panel">
          <div class="track-meta-small">${escapeHtml(group)}</div>
          <div class="pill-row">
            ${tagsByGroup[group].map((tag) => {
              const token = tokenFrom(tag.group, tag.name);
              const active = selectedTokens.includes(token);
              return `
                <button class="pill ${active ? "active" : ""}" data-action="toggle-tag" data-token="${escapeHtml(token)}">
                  ${escapeHtml(tag.name)}
                </button>
              `;
            }).join("")}
          </div>
        </section>
      `).join("")}

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

  function navigateWithTokens(nextTokens) {
    const unique = [];
    const seen = new Set();
    nextTokens.forEach((token) => {
      const normalized = normalizeToken(token);
      if (normalized && !seen.has(normalized)) {
        unique.push(normalized);
        seen.add(normalized);
      }
    });
    const nextRoute = routeFromTokens(unique);
    ctx.navigate(nextRoute.path, nextRoute.query);
  }

  root.querySelector("#tag-back-btn").addEventListener("click", () => {
    ctx.navigate("/tags");
  });

  root.querySelector("#tag-play-btn").addEventListener("click", () => {
    ctx.playCollection(tracks, tracks[0] ? tracks[0].id : null);
  });

  root.querySelectorAll('[data-action="play-track"]').forEach((button) => {
    button.addEventListener("click", () => {
      ctx.playCollection(tracks, button.dataset.trackId);
    });
  });

  root.querySelectorAll('[data-action="toggle-tag"]').forEach((button) => {
    button.addEventListener("click", () => {
      const token = button.dataset.token;
      if (!token) {
        return;
      }
      if (selectedTokens.includes(token)) {
        navigateWithTokens(selectedTokens.filter((entry) => entry !== token));
      } else {
        navigateWithTokens([...selectedTokens, token]);
      }
    });
  });

  root.querySelectorAll('[data-action="toggle-selected"]').forEach((button) => {
    button.addEventListener("click", () => {
      const token = button.dataset.token;
      navigateWithTokens(selectedTokens.filter((entry) => entry !== token));
    });
  });
}
