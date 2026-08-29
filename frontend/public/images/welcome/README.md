# PWI Welcome Screen — Background Images

This folder contains the background images used by the application **Welcome
screen** slideshow and the **Login** authentication screens for the PWI
(Pakistan Wire Industries) ERP / MRP platform.

## How to replace with real PWI factory images

Simply drop your own photographs into this folder and overwrite the files below,
**keeping the exact same filenames and a `.jpg` extension** — no code changes
are required.

Expected filenames:

| File            | Suggested subject                                   |
| --------------- | --------------------------------------------------- |
| `welcome-01.jpg`| Wire manufacturing / wire coils                      |
| `welcome-02.jpg`| Industrial production machinery                      |
| `welcome-03.jpg`| Wire drawing / straightening machinery               |
| `welcome-04.jpg`| Spoke or metal component manufacturing               |
| `welcome-05.jpg`| Cable manufacturing                                  |
| `welcome-06.jpg`| Factory floor / production line                      |

## Recommendations

- **Size**: use large, high-resolution images (at least `1920 × 1080`) so they
  remain sharp on desktop displays. Typical source size is fine — they are
  served as-is.
- **Format**: `.jpg` (JPEG). Moderate compression is recommended to keep the
  Welcome screen fast to load.
- **Content**: landscape (16:9), reasonably dark / moody industrial scenes work
  best — a dark overlay is applied automatically to keep the PWI branding
  readable in both light and dark theme.
- **Behaviour**: images rotate automatically every ~7 seconds with a smooth
  crossfade and a slow zoom. Missing files are skipped gracefully and never show
  a broken-image icon.

## Technical notes

- The slideshow reads from this folder at
  `%PUBLIC_URL%/images/welcome/welcome-0N.jpg`.
- The slide metadata (image, title, subtitle) is defined in
  `frontend/src/components/auth/WelcomeSlideshow.tsx` (`WELCOME_SLIDES`).
- The current files are **placeholder demo images** generated for development.
  Replace these files with actual PWI factory images before production release.