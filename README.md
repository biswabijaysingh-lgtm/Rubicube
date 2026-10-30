# Cube — Rubik's Cube game (PC + mobile)

A 3D Rubik's cube in plain HTML/CSS/JS. No build step, no dependencies.

## Putting it online (version-5 is the upload-ready folder)
1. Upload the **contents** of `version-5/` (or `version-5.zip`) to a static host — e.g. app.netlify.com/drop,
   GitHub Pages or Cloudflare Pages. The game needs no server code.
2. Open the live `https://…` address on a phone and use "Add to Home Screen" / "Install app".
3. Link preview: in `index.html`, change `og:image` and `twitter:image` from `og-image.png` to the full address,
   e.g. `https://your-site.netlify.app/og-image.png`, then upload again. (WhatsApp and others need the full address.)
4. After any later update, bump the number in `sw.js` (`const CACHE = 'cube-v13'` → `v14`) so phones refresh their saved copy.

## Play on PC
Double-click `index.html`, or run a local server:

    python -m http.server 5173

then open http://localhost:5173

## Play on your phone
1. Run the server above on your PC.
2. Put the phone on the same Wi-Fi and open `http://<your-PC-IP>:5173`.

To **install it like an app** (Add to Home Screen) and play offline, host the folder on any
HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages — just upload the folder).

## Controls
| Action | PC | Mobile |
|---|---|---|
| Turn a layer | drag a sticker | drag a sticker |
| Rotate view | drag background / arrow keys | drag background |
| Zoom | mouse wheel | pinch |
| Face turns | `R L U D F B` (+`Shift` = counter-clockwise) | — |
| Scramble / Undo | `Space` / `Z` | buttons |

Sound: synthesised in the browser (no audio files) — a click on every turn and a chime on a win,
plus a short vibration on phones. The speaker button in the top bar mutes it (remembered).

Tools (green card): **Solver** lists the solution (play all or step one move at a time),
**Patterns** builds Checkerboard / Six Spots / Cube in a Cube / Superflip on the 3×3, **Moves** turns
the cube with buttons or typed notation (`R U R' U'`, `2R` for inner layers). Also: Undo / Redo
(`Z` / `Y`), a Speed slider, Fullscreen (top bar), and an Info sheet.

Sizes: 2×2, 3×3, 4×4, 5×5. Best times are stored per size in the browser.

Fonts (Instrument Serif, Satoshi) load from the internet; offline it falls back to Georgia / system sans.

Background: try a colour by adding `?bg=` to the address, e.g. `http://localhost:5173/?bg=sage`.
Options: `white`, `cream` (default), `butter`, `mist`, `sage`, `blush`, `lilac` (remembered in the browser).

Styles: the palette button in the top bar switches the whole look — cube, background and every card —
between Sticker (the original), Glass, Neon Glow, Plasma, Halftone, Clay, Fur, Metal, Squishy and Pixel.
Squishy also squashes and wobbles the cube when you twist. Direct link: `?theme=glass` (any id above, lowercase).
The previous version of the game (before styles) is kept in `backup-v1-classic/`.

## Files
- `themes.css` — the style/material definitions
- `index.html`, `style.css` — page and styling
- `game.js` — cube model, animation, input, timer
- `manifest.webmanifest`, `sw.js`, `icon.svg` — installable/offline support
