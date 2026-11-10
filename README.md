# SMIF Post Studio

A small web page the SMIF Club marketing team uses to make on-brand Instagram posts, stories and LinkedIn images. Pick a template, type your text, add a photo, download a PNG. It runs entirely in your browser. There is no account, no server, no tracking, and photos never leave your device.

## Make a post in 5 steps

1. Open `index.html` (double click it, or use the published link).
2. Pick a template on the left. On a phone, tap Templates, then Edit.
3. Choose a size (Post, Story, Square or LinkedIn) and a color theme, then type your text. Yellow "Text is too long" notes mean you should shorten it.
4. Add a photo if the template has one. Drag the picture in the preview to move it and use the Zoom slider.
5. Press Download PNG. On an iPhone, press and hold the picture that appears and choose Save to Photos.

Other buttons: Save design (a `.smif.json` file you can open later, photo included), Open design, and Start over (clears what the browser remembered). The browser remembers your text, template, size and theme on this device, but never photos.

The Brand kit tab has the logo downloads, color codes (click to copy), fonts and a short do and don't list.

## Files

- `index.html` page layout
- `styles.css` look of the editor
- `brand.js` the only place colors, fonts, sizes, themes and the footer tagline are defined
- `templates.js` drawing helpers and the 8 templates
- `app.js` the editor (form, photo handling, preview, export, save and open)
- `assets/` logo PNGs, plus `logos.js` (the same logos embedded as text so the exported PNG is never blocked when the page is opened as a file)
- `fonts/` Playfair Display and Montserrat as local font files (SIL Open Font License, license text included). The app makes no third party requests.

## Add a template

Open `templates.js`. Copy one whole object in the `SMIF.templates` list (for example the Quote card), then:

1. Give it a new `id`, `name` and `slug` (the slug is used in the download file name).
2. Edit `fields`. Each field is `{ id, label, type, default, maxLength, placeholder }`. Types are `text`, `textarea`, `select` (also give `options`) and `date`. The `default` is the sample text, so keep it made up.
3. Edit `photoSlots` (use `[]` for none). Each is `{ id, label, required }`. Use `kind: 'qr'` for a code that must stay square.
4. Rewrite `draw`. It gets `(ctx, W, H, data, theme, assets)`. Start with `var c = D.ctx(...)`, then `D.bg(c)`, `D.eyebrow(c, ...)` and `D.footer(c)`. Use `c.k` (`tall`, `portrait`, `square` or `wide`) to change the layout by size, and `c.px(n)` to scale numbers. `D.fit` and `D.drawFit` shrink text to fit a box and report "too long" back to the form.
5. Optional: add `sizes: ['post', 'story']` to grey out sizes the template does not support.

Refresh the page. The new template shows up in the gallery by itself.

## Change the brand colors or fonts

Open `brand.js` and edit `colors`, `themes`, `divisions` or `tagline`. Refresh. Everything else reads from there. To use different fonts, put new `.woff2` files in `fonts/`, update the `@font-face` lines at the top of `styles.css`, and update `fonts` and `fontLoads` in `brand.js`.

## Publish (only when the club says yes)

The folder is plain static files. Put the contents of this folder in a GitHub repository and turn on GitHub Pages. Only brand assets belong in the repo, never member photos, names, phone numbers or emails.

## Notes

- The tagline "Student Managed Investment Fund" at the bottom right of each post is set in `brand.js` and can be changed or emptied there.
- Story size shows a dashed red safe area guide in the preview only (Instagram covers the top and bottom of stories). It is never in the downloaded PNG.
- Supported photos: JPEG, PNG, WebP up to 25 MB. iPhone HEIC photos need to be shared as JPEG first.
- Tested in Chrome. Safari and iPhone behavior is written to the spec but has not been tried on a real iPhone yet.
