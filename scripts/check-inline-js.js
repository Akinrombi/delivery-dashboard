const fs = require("fs");
const vm = require("vm");

const files = process.argv.slice(2);
if (!files.length) throw new Error("Pass one or more HTML files to validate.");

let checked = 0;
for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  let index = 0;
  while ((match = pattern.exec(html))) {
    index += 1;
    const attrs = match[1] || "";
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type)) continue;
    const source = match[2].trim();
    if (!source) continue;
    new vm.Script(source, { filename: file + "#inline-script-" + index });
    checked += 1;
  }
}
console.log("Validated " + checked + " inline JavaScript blocks across " + files.length + " HTML files.");
