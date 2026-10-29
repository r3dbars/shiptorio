# Shippy calm / floor proof (#57)

The same attention demo runs before and after. Its waiting card sends Shippy to the Planner: he walks there, settles, and remains available. No API calls or real actions are made.

| View | Before | After |
| --- | --- | --- |
| 1280×720 | _arrival (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/shippy-calm/before/desktop-1280/01-settled.png`)_, _settled (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/shippy-calm/before/desktop-1280/clip-11s.png`)_ | _arrival (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/shippy-calm/after/desktop-1280/01-settled.png`)_, _settled (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/shippy-calm/after/desktop-1280/clip-11s.png`)_ |
| 390×844 | _arrival (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/shippy-calm/before/phone-390/01-settled.png`)_, _settled (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/shippy-calm/before/phone-390/clip-11s.png`)_ | _arrival (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/shippy-calm/after/phone-390/01-settled.png`)_, _settled (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/shippy-calm/after/phone-390/clip-11s.png`)_ |

Captured with `ONLY=desktop-1280` / `ONLY=phone-390`, `CLIP=12`, `DECK_PATH='/deck.html?source=attention-demo'`, and `BASE_URL=http://127.0.0.1:5257 node scripts/shots/deck.mjs <output>`. Phone screenshots use DPR 2, so their bitmap is 780×1688 while the CSS viewport is 390×844.

The bundled FFmpeg has VP9 but no H264/concat support. The script's original screencast frames were resampled at their recorded timestamps into 60fps WebM clips (12.6–12.7 seconds including capture startup). No scene frames were invented. Clips were opened in Chromium and inspected at 1, 6 and 11 seconds; metadata duration was checked.

Reports retain the drawn-canvas color count, viewport overflow and console checks. Unit tests independently prove fixed settled pixels, exact floor contact throughout every walk phase, preserved dock/charge transitions and reduced-motion work frames. No frame assets were deleted because the frame catalog/previews and approved card guide still use them.

Clips are kept out of the repo to keep clones small; they live in the project files (shiptorio/evidence/shippy-calm/).
