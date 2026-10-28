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

## Polished wordmark (Justin, October 28)

Justin approved the GPT Images refinement with two matching chamfered rectangular
O letters, brushed brass and a small rocket inside the final O. The selected plain
petrol-background version is `web/public/brand/wordmark-polished.webp` (2172 × 724,
3:1). This is a quality-95 WebP encoding of the approved generated image, not the
busy factory-background exploration. It is used by the password gate, shared app
wordmark, public welcome page and server-rendered connection pages. The gate now uses a quiet solid
background instead of loading the factory film. Password, CSRF and session behavior
are unchanged. The compact vector seal and favicons remain the existing artwork.

The generated wordmark is a separately authored asset; `scripts/brand/build.py`
continues to build the earlier vector assets and does not regenerate this image.
Generation direction: preserve SHIPTORIO lettering, match both O contours, refine
brass/bevels/rivets/kerning and the small rocket, with a plain near-black petrol
background and no additional copy. Generated with the built-in GPT Images tool.
