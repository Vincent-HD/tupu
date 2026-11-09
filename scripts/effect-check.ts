import { spawnSync } from "node:child_process";

const projects = ["tsconfig.app.json", "tsconfig.worker.json", "tsconfig.node.json"];

interface Report {
  readonly summary: { readonly filesChecked: number; readonly filesWithoutPlugin: number };
  readonly diagnostics: ReadonlyArray<{
    readonly file: string;
    readonly line: number;
    readonly column: number;
    readonly severity: string;
    readonly name: string;
    readonly message: string;
  }>;
}

let failed = false;
for (const project of projects) {
  const result = spawnSync(
    "pnpm",
    ["exec", "effect-tsgo", "diagnostics", "--project", project, "--format", "json"],
    {
      encoding: "utf8",
    },
  );
  if (result.stderr) process.stderr.write(result.stderr);
  try {
    const report: Report = JSON.parse(result.stdout);
    console.log(
      `${project}: ${report.summary.filesChecked} files checked, ${report.summary.filesWithoutPlugin} without plugin`,
    );
    for (const diagnostic of report.diagnostics)
      if (diagnostic.severity !== "message")
        console.log(
          `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.severity} ${diagnostic.name}: ${diagnostic.message}`,
        );
    if (
      result.status !== 0 ||
      report.diagnostics.some(
        (diagnostic) => diagnostic.severity === "warning" || diagnostic.severity === "error",
      ) ||
      report.summary.filesChecked < 1 ||
      report.summary.filesWithoutPlugin !== 0
    )
      failed = true;
  } catch {
    console.error(result.stdout || result.error || "Effect diagnostics returned invalid output");
    failed = true;
  }
}
if (failed) process.exitCode = 1;
