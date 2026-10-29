# Shippy calm / floor proof (#57)

The same attention demo runs before and after. Its waiting card sends Shippy to the Planner: he walks there, settles, and remains available. No API calls or real actions are made.

| View | Before | After |
| --- | --- | --- |
| 1280×720 | [arrival](before/desktop-1280/01-settled.png), [settled](before/desktop-1280/clip-11s.png), [clip](before/desktop-1280/clip.webm) | [arrival](after/desktop-1280/01-settled.png), [settled](after/desktop-1280/clip-11s.png), [clip](after/desktop-1280/clip.webm) |
| 390×844 | [arrival](before/phone-390/01-settled.png), [settled](before/phone-390/clip-11s.png), [clip](before/phone-390/clip.webm) | [arrival](after/phone-390/01-settled.png), [settled](after/phone-390/clip-11s.png), [clip](after/phone-390/clip.webm) |

Captured with `ONLY=desktop-1280` / `ONLY=phone-390`, `CLIP=12`, `DECK_PATH='/deck.html?source=attention-demo'`, and `BASE_URL=http://127.0.0.1:5257 node scripts/shots/deck.mjs <output>`. Phone screenshots use DPR 2, so their bitmap is 780×1688 while the CSS viewport is 390×844.

The bundled FFmpeg has VP9 but no H264/concat support. The script's original screencast frames were resampled at their recorded timestamps into 60fps WebM clips (12.6–12.7 seconds including capture startup). No scene frames were invented. Clips were opened in Chromium and inspected at 1, 6 and 11 seconds; metadata duration was checked.

Reports retain the drawn-canvas color count, viewport overflow and console checks. Unit tests independently prove fixed settled pixels, exact floor contact throughout every walk phase, preserved dock/charge transitions and reduced-motion work frames. No frame assets were deleted because the frame catalog/previews and approved card guide still use them.
