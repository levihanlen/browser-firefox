// The background of the .dmg window that `mach package` builds: the site's
// near-black, at the 1440x880 size Mozilla's Finder layout (dsstore) expects.
//
// usage: swift make_dmg_background.swift <out.png>

import AppKit

let width = 1440
let height = 880
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(
  data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(srgbRed: 17 / 255, green: 16 / 255, blue: 20 / 255, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(
  to: URL(fileURLWithPath: CommandLine.arguments[1]))
