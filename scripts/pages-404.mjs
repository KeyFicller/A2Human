import { copyFileSync, writeFileSync } from "node:fs"

// GitHub Pages serves this file for unknown agent and task URLs.
copyFileSync("out/index.html", "out/404.html")
writeFileSync("out/.nojekyll", "")
