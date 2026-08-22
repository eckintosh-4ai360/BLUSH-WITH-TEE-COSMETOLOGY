# Hero carousel images

The homepage hero rotates through the photographs in this folder. Drop in files
with these exact names and they appear automatically — no code change needed:

| File            | Slide                  |
| --------------- | ---------------------- |
| `hair.jpg`      | Hair artistry          |
| `makeup.jpg`    | Makeup artistry        |
| `nails.jpg`     | Nail craft & design    |
| `skincare.jpg`  | Skincare & spa therapy |

Until a file exists, that slide falls back to a gradient wash, so the hero still
looks intentional rather than broken.

## What works best

- **Portrait, roughly 4:5** (e.g. 1200×1500). The frame is `aspect-[4/5]` and
  crops with `object-cover`, so landscape shots lose their edges.
- **~200–400 KB each.** Next.js re-encodes to WebP/AVIF on request, but the
  source still has to be fetched and processed — avoid 5 MB camera originals.
- **Keep the subject off the bottom third.** A dark scrim sits there behind the
  caption and progress bar.
- **Darker, warmer frames sit better** on the aubergine background than bright
  white-studio shots.

To change the slide list (names, captions, links, ordering), edit `heroSlides`
in `app/page.tsx`.

## Licensing

Use photographs the school owns or has a licence for — ideally real students and
real work in the actual studio. Please don't drop in stock images without
checking the licence permits commercial web use.
