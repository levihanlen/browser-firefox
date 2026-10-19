// Draws the lh browser mark from EB Garamond outlines and exports every
// icon, logo and wordmark the branding directory needs.
//
// usage: swift make_logo.swift <font file> <out dir> [variant]
//   variant: "plain" (lh) or "mark" (lh plus the site's diamond end mark)

import AppKit
import CoreText
import Foundation

let args = CommandLine.arguments
let fontURL = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
let variant = args.count > 3 ? args[3] : "mark"
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

// life-nextjs palette
let bg = CGColor(srgbRed: 17 / 255, green: 16 / 255, blue: 20 / 255, alpha: 1)
let darkest = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.85)
let medium = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.3)
let purple = CGColor(srgbRed: 0.80, green: 0.68, blue: 1.0, alpha: 0.85)

guard
  let descriptors = CTFontManagerCreateFontDescriptorsFromURL(fontURL as CFURL)
    as? [CTFontDescriptor],
  let descriptor = descriptors.first
else {
  fatalError("could not read \(fontURL.path)")
}

func font(size: CGFloat) -> CTFont {
  CTFontCreateWithFontDescriptor(descriptor, size, nil)
}

/// Outlines of `text` set at `size`, with the baseline at y = 0 (y up).
func textPath(_ text: String, size: CGFloat) -> CGPath {
  let attributed = NSAttributedString(
    string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font(size: size)])
  let line = CTLineCreateWithAttributedString(attributed)
  let path = CGMutablePath()
  for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let attributes = CTRunGetAttributes(run) as NSDictionary
    let runFont = attributes[kCTFontAttributeName as String] as! CTFont
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
    for i in 0..<count {
      if let glyphPath = CTFontCreatePathForGlyph(runFont, glyphs[i], nil) {
        path.addPath(
          glyphPath,
          transform: CGAffineTransform(translationX: positions[i].x, y: positions[i].y))
      }
    }
  }
  return path
}

/// The mark: "lh", optionally followed by the site's diamond end mark, centered
/// on (cx, cy) with the letters `capHeight` tall. Returns (filled, stroked).
struct Mark {
  var letters: CGPath
  var diamond: CGPath?
  var diamondStroke: CGFloat
}

func mark(center: CGPoint, height: CGFloat) -> Mark {
  let unit: CGFloat = 1000
  let letters = textPath("lh", size: unit)
  let box = letters.boundingBoxOfPath
  var width = box.width
  var diamondSize: CGFloat = 0
  var gap: CGFloat = 0
  if variant == "mark" {
    diamondSize = unit * 0.11
    gap = unit * 0.07
    width += gap + diamondSize * 1.41
  }
  let scale = height / box.height
  let originX = center.x - width * scale / 2 - box.minX * scale
  let originY = center.y - box.height * scale / 2 - box.minY * scale
  var t = CGAffineTransform(translationX: originX, y: originY).scaledBy(x: scale, y: scale)
  let placed = letters.copy(using: &t)!

  var diamond: CGPath?
  if variant == "mark" {
    let side = diamondSize * scale
    let half = side * 1.41 / 2
    let dx = originX + (box.maxX + gap) * scale + half
    let dy = originY + half
    let p = CGMutablePath()
    p.move(to: CGPoint(x: dx, y: dy - half))
    p.addLine(to: CGPoint(x: dx + half, y: dy))
    p.addLine(to: CGPoint(x: dx, y: dy + half))
    p.addLine(to: CGPoint(x: dx - half, y: dy))
    p.closeSubpath()
    diamond = p
  }
  return Mark(letters: placed, diamond: diamond, diamondStroke: max(1, height * 0.022))
}

// MARK: - Raster output

func png(size: Int, to name: String, draw: (CGContext, CGFloat) -> Void) {
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  let ctx = CGContext(
    data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setShouldAntialias(true)
  draw(ctx, CGFloat(size))
  let image = ctx.makeImage()!
  let rep = NSBitmapImageRep(cgImage: image)
  try! rep.representation(using: .png, properties: [:])!.write(to: outDir.appendingPathComponent(name))
}

/// A tile filling `rect` with the given corner radius, and the mark on it.
func drawTile(_ ctx: CGContext, rect: CGRect, radius: CGFloat, ink: CGColor) {
  ctx.addPath(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
  ctx.setFillColor(bg)
  ctx.fillPath()
  let m = mark(center: CGPoint(x: rect.midX, y: rect.midY), height: rect.height * 0.46)
  ctx.addPath(m.letters)
  ctx.setFillColor(ink)
  ctx.fillPath()
  if let diamond = m.diamond {
    ctx.addPath(diamond)
    ctx.setStrokeColor(medium)
    ctx.setLineWidth(m.diamondStroke)
    ctx.strokePath()
  }
}

/// macOS app icon grid: an 824/1024 tile, corner radius ~22% of the tile.
func appIcon(_ ctx: CGContext, _ size: CGFloat) {
  let inset = size * 100 / 1024
  let rect = CGRect(x: inset, y: inset, width: size - 2 * inset, height: size - 2 * inset)
  drawTile(ctx, rect: rect, radius: rect.width * 0.2237, ink: darkest)
}

/// Small, full-bleed tile for favicons and in-page logos.
func badge(ink: CGColor) -> (CGContext, CGFloat) -> Void {
  return { ctx, size in
    drawTile(ctx, rect: CGRect(x: 0, y: 0, width: size, height: size), radius: size * 0.18, ink: ink)
  }
}

let iconset = outDir.appendingPathComponent("lh.iconset")
try? FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
for (base, scale) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] {
  let suffix = scale == 2 ? "@2x" : ""
  png(size: base * scale, to: "lh.iconset/icon_\(base)x\(base)\(suffix).png", draw: appIcon)
}
for size in [16, 22, 24, 32, 48, 64, 128, 256] {
  png(size: size, to: "default\(size).png", draw: badge(ink: darkest))
}
png(size: 192, to: "about-logo.png", draw: badge(ink: darkest))
png(size: 384, to: "about-logo@2x.png", draw: badge(ink: darkest))
png(size: 192, to: "about-logo-private.png", draw: badge(ink: purple))
png(size: 384, to: "about-logo-private@2x.png", draw: badge(ink: purple))
png(size: 1024, to: "preview-appicon.png", draw: appIcon)

// MARK: - Vector output

func svgPathData(_ path: CGPath, flipHeight: CGFloat) -> String {
  var d = ""
  func p(_ point: CGPoint) -> String {
    String(format: "%.2f %.2f", point.x, flipHeight - point.y)
  }
  path.applyWithBlock { element in
    let e = element.pointee
    switch e.type {
    case .moveToPoint: d += "M\(p(e.points[0]))"
    case .addLineToPoint: d += "L\(p(e.points[0]))"
    case .addQuadCurveToPoint: d += "Q\(p(e.points[0])) \(p(e.points[1]))"
    case .addCurveToPoint: d += "C\(p(e.points[0])) \(p(e.points[1])) \(p(e.points[2]))"
    case .closeSubpath: d += "Z"
    @unknown default: break
    }
  }
  return d
}

let license = """
  <!-- This Source Code Form is subject to the terms of the Mozilla Public
     - License, v. 2.0. If a copy of the MPL was not distributed with this
     - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->

  """

func write(_ text: String, _ name: String) {
  try! text.write(to: outDir.appendingPathComponent(name), atomically: true, encoding: .utf8)
}

func markSVG(size: CGFloat, height: CGFloat, ink: String, includeTile: Bool, tileRect: CGRect? = nil) -> String {
  let center = tileRect.map { CGPoint(x: $0.midX, y: $0.midY) } ?? CGPoint(x: size / 2, y: size / 2)
  let m = mark(center: center, height: height)
  var body = ""
  if includeTile, let r = tileRect {
    let radius = r.width * 0.18
    body += "<rect x=\"\(r.minX)\" y=\"\(r.minY)\" width=\"\(r.width)\" height=\"\(r.height)\" rx=\"\(radius)\" fill=\"#111014\"/>"
  }
  body += "<path fill=\"\(ink)\" d=\"\(svgPathData(m.letters, flipHeight: size))\"/>"
  if let diamond = m.diamond {
    body += "<path fill=\"none\" stroke=\"\(ink)\" stroke-opacity=\"0.35\" stroke-width=\"\(String(format: "%.2f", m.diamondStroke))\" d=\"\(svgPathData(diamond, flipHeight: size))\"/>"
  }
  return body
}

// The in-page logo (Settings, About, Welcome): the tile with the mark.
let tile512 = CGRect(x: 0, y: 0, width: 512, height: 512)
write(license + "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\">" + markSVG(size: 512, height: 512 * 0.46, ink: "#dbdbdc", includeTile: true, tileRect: tile512) + "</svg>\n", "about-logo.svg")

// Icon Composer layers: a full-bleed background and the mark on its own.
write("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1024\" height=\"1024\" viewBox=\"0 0 1024 1024\"><rect width=\"1024\" height=\"1024\" fill=\"#111014\"/></svg>\n", "icon-background.svg")
write("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1024\" height=\"1024\" viewBox=\"0 0 1024 1024\">" + markSVG(size: 1024, height: 1024 * 0.38, ink: "#dbdbdc", includeTile: false) + "</svg>\n", "icon-mark.svg")

// The wordmark, "lh browser" in EB Garamond, colored by its context.
let wordmark = textPath("lh browser", size: 100)
let wbox = wordmark.boundingBoxOfPath
var shift = CGAffineTransform(translationX: -wbox.minX, y: -wbox.minY)
let wordmarkPlaced = wordmark.copy(using: &shift)!
let wordmarkSVG = license + String(
  format: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 %.2f %.2f\"><path fill=\"context-fill\" d=\"%@\"/></svg>\n",
  wbox.width, wbox.height, svgPathData(wordmarkPlaced, flipHeight: wbox.height))
write(wordmarkSVG, "about-wordmark.svg")
write(wordmarkSVG, "firefox-wordmark.svg")

print("wrote assets to \(outDir.path)")
