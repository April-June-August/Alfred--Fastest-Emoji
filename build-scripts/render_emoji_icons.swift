import AppKit
import Foundation

struct IconJob: Decodable {
  let emoji: String
  let filename: String
}

func renderEmojiPngData(_ emoji: String, size: CGFloat) -> Data? {
  let canvas = NSSize(width: size, height: size)
  let image = NSImage(size: canvas)

  image.lockFocus()
  NSColor.clear.setFill()
  NSBezierPath(rect: NSRect(origin: .zero, size: canvas)).fill()

  let paragraphStyle = NSMutableParagraphStyle()
  paragraphStyle.alignment = .center

  let fontSize = size * 1
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "AppleColorEmoji", size: fontSize)
      ?? NSFont.systemFont(ofSize: fontSize),
    .paragraphStyle: paragraphStyle
  ]

  let textSize = (emoji as NSString).size(withAttributes: attrs)
  let drawRect = NSRect(
    x: (size - textSize.width) / 2.0,
    y: (size - textSize.height) / 2.0,
    width: textSize.width,
    height: textSize.height
  )
  (emoji as NSString).draw(in: drawRect, withAttributes: attrs)
  image.unlockFocus()

  guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
  else {
    return nil
  }

  return png
}

func printUsageAndExit() -> Never {
  fputs(
    "usage: swift render_emoji_icons.swift <batch_json> <size> <out_dir>\n",
    stderr
  )
  exit(1)
}

let args = CommandLine.arguments
guard args.count == 4 else {
  printUsageAndExit()
}

let batchFile = args[1]
let size = CGFloat(Int(args[2]) ?? 64)
let outDir = args[3]

let fm = FileManager.default
let outURL = URL(fileURLWithPath: outDir, isDirectory: true)

do {
  try fm.createDirectory(at: outURL, withIntermediateDirectories: true)
} catch {
  fputs("failed to create output dir: \(error)\n", stderr)
  exit(1)
}

let jobs: [IconJob]
do {
  let batchData = try Data(contentsOf: URL(fileURLWithPath: batchFile))
  jobs = try JSONDecoder().decode([IconJob].self, from: batchData)
} catch {
  fputs("failed to decode batch json: \(error)\n", stderr)
  exit(1)
}

var failures = [String]()

for job in jobs {
  autoreleasepool {
    guard let pngData = renderEmojiPngData(job.emoji, size: size) else {
      failures.append(job.filename)
      return
    }
    let outFile = outURL.appendingPathComponent(job.filename)
    do {
      try pngData.write(to: outFile)
    } catch {
      failures.append(job.filename)
    }
  }
}

if !failures.isEmpty {
  fputs("failed to render \(failures.count) icons\n", stderr)
  for filename in failures.prefix(20) {
    fputs("  \(filename)\n", stderr)
  }
  exit(1)
}

print("Rendered \(jobs.count) icons")
