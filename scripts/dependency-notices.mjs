import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";

export async function writeDependencyNotices() {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const parts = [
    "Evidence Atlas — third-party runtime notices",
    "Dependency licenses remain independent of the original application's permission-required terms.",
    "This inventory includes installed non-development dependencies; not every package is bundled in every output.",
  ];
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || entry.dev) continue;
    let pkg;
    try {
      pkg = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" && entry.optional) continue;
      throw error;
    }
    parts.push(
      `\n\n${pkg.name} ${pkg.version} — ${pkg.license || "see package notices"}\n${"=".repeat(72)}`,
    );
    const names = await readdir(path);
    const notices = names.filter(
      (name) =>
        /^(licen[sc]e|copying|notice|copyright)([._-].*)?$/i.test(name) &&
        !/\.(m?js|cjs)$/i.test(name),
    );
    if (notices.length) {
      for (const name of notices)
        parts.push(`\n${name}\n${await readFile(join(path, name), "utf8")}`);
    } else {
      const readme = names.find((name) => /^readme(?:\..*)?$/i.test(name));
      if (readme) parts.push(await readFile(join(path, readme), "utf8"));
      else
        parts.push(
          "Package provides no standalone notice; see its upstream repository and package license metadata.",
        );
    }
  }
  await mkdir("public/licenses", { recursive: true });
  await writeFile("public/licenses/THIRD-PARTY-NOTICES.txt", parts.join("\n"));
  await copyFile("LICENSE", "public/licenses/LICENSE.txt");
  await copyFile("THIRD-PARTY-NOTICES.md", "public/licenses/README.md");
}
