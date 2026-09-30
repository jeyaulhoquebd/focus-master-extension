const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const svgPath = path.join(__dirname, "../icons/focus-master-icon.svg");
const outDir = path.join(__dirname, "../icons");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const size of [16, 48, 128]) {
  sharp(svgPath)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(outDir, `icon${size}.png`));
}

console.log("Generated: icon16.png, icon48.png, icon128.png");

