# 3. Hash routing, with the workspace encoded in the URL

- Status: accepted
- Date: 2026-10-29

## Context

GitHub Pages serves static files and can't rewrite `/launchready/app/launches/HAL-77` to `index.html`. Reviewers should be able to send a link to "this launch, under this disruption, after this approval".

## Decision

- Routes live in the hash: `#/app/<view>/<id>`. A small router built on `useSyncExternalStore` replaces a routing library.
- The shareable workspace (preset scenarios, the custom what-if, approved actions) is base64url-encoded JSON in `?w=` inside the hash. The provider updates it with `history.replaceState` so editing doesn't flood the history. When the URL changes from outside (a link, or Back/Forward), the provider re-reads it.
- The activity log is not in the URL; a shared link starts its own log with a note.

## Consequences

- Deep links and sharing work on static hosting with no server config.
- URLs get long with many approvals; acceptable for a prototype, and the encoding is versionable (unknown scenarios are dropped and a broken link opens the original plan).
- Moving to a server later means swapping the router for path routes and the codec for saved workspaces with IDs.
