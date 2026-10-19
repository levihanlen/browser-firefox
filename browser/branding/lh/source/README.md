# lh browser logo

The mark is "lh" in EB Garamond, the typeface of levihanlen.com, followed by
the hollow diamond the site uses to mark the end of an essay. It sits on the
site's near-black, rgb(17, 16, 20), in its strongest white.

Everything in `browser/branding/lh` is generated from here:

```bash
swift make_logo.swift ../../../custom/content/fonts/eb-garamond-latin.woff2 out mark
iconutil -c icns out/lh.iconset -o ../firefox.icns
xcrun actool AppIcon.icon --compile out --platform macosx \
  --minimum-deployment-target 11.0 --app-icon AppIcon \
  --output-partial-info-plist out/partial.plist
```

Then copy from `out/`: `Assets.car` and `firefox.icns` (also used as
`document.icns`) to `browser/branding/lh/`, `default*.png` to the same place,
and the `about-*` files and wordmarks to `browser/branding/lh/content/`.

`AppIcon.icon` is an Icon Composer document: the site's near-black as a solid
fill and the mark on it, with glass, specular highlights and shadows turned
off so the macOS 26 icon stays as flat as the system allows. macOS still adds
its own rim light and lifts very dark fills a little.

The glyph outlines come from EB Garamond, which is under the SIL Open Font
License 1.1.
