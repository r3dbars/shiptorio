# Foundry brand

Selected by Justin on October 26, 2026: the third S-rocket refinement from the logo exploration.
Tagline: **A little play. A lot shipped.** This supersedes the old pixel wordmark and “The factory must grow” in product branding.

The final O in SHIPTORIO is a point-up brass hexagon with near-black petrol enamel. Three fitted rocket hull plates leave an S-shaped seam. The rocket reads first, the S second. No starburst, radial rays or large flame.

- `web/public/brand/wordmark.svg`: original chamfered letter geometry, pipe rails, metal faces and fine fasteners. All paths, no embedded raster or external font dependency.
- `mark.svg`: full dimensional seal; `mark-flat.svg` and `favicon.svg`: simplified geometry for small use.
- `scripts/brand/build.py`: deterministic source of the vector artwork, PNG icons and social image. Run with Python and CairoSVG installed; no Python dependency in the app build/runtime.
- Typography: local Teko for large headings, Rajdhani SemiBold for controls/labels, existing JetBrains Mono for body/data, Georgia for the short tagline. Font licenses live beside the local fonts.
- Overlay surfaces: dark enamel, narrow brass edges, twin copper pipe rails and restrained raised titles. Keep controls, status colors and body text readable; avoid applying large display type to dense data.

The title screen and waitlist retain the existing original factory artwork/film. The password form retains its native POST, nonce script, CSRF and cookie handling. “Private preview” is removed from the title artwork; access policy is unchanged.

This UI work was explicitly requested from Codex, extending the usual backend lane. No shared protocol or factory decisions change.
