const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const version = require("../desktop/package.json").version;
const release = path.join(root, "release");
fs.mkdirSync(release, { recursive: true });
const status = execFileSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
});
if (status.trim())
  throw new Error(
    "Commit the reviewed changes before exporting a matching source release.",
  );
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
execFileSync(
  "git",
  [
    "archive",
    "--format=zip",
    `--prefix=LuluBoard-${version}/`,
    `--output=${path.join(release, `LuluBoard-${version}-source.zip`)}`,
    "HEAD",
    "--",
    ".",
    ":(exclude).env*",
    ":(exclude)**/Yutong.*",
    ":(exclude).github/**",
    ":(exclude)design/branding/*.txt",
  ],
  { cwd: root },
);
fs.writeFileSync(
  path.join(release, "SOURCE_VERSION.txt"),
  `LuluBoard ${version}\nSource commit: ${sha}\nAuthor: lulucati\nAuthor profile: https://github.com/lulucati-lab\nSource snapshot omits environment files, superseded Yutong binary and upstream automation.\n`,
);
fs.copyFileSync(
  path.join(root, "docs/RELEASE.md"),
  path.join(release, "RELEASE_NOTES.md"),
);
const files = fs
  .readdirSync(release)
  .filter(
    (name) =>
      /\.(exe|zip)$/.test(name) ||
      ["SOURCE_VERSION.txt", "RELEASE_NOTES.md"].includes(name),
  )
  .sort();
const hashes = files.map(
  (name) =>
    `${createHash("sha256")
      .update(fs.readFileSync(path.join(release, name)))
      .digest("hex")}  ${name}`,
);
fs.writeFileSync(
  path.join(release, "SHA256SUMS.txt"),
  `${hashes.join("\n")}\n`,
);
console.log(`Prepared ${files.length} release files for ${version} at ${sha}`);
