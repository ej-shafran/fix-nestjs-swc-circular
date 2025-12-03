#!/usr/bin/env node

import { pipe } from "effect/Function";
import * as Effect from "effect/Effect";
import * as String from "effect/String";
import * as Option from "effect/Option";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Command from "@effect/cli/Command";
import * as Args from "@effect/cli/Args";
import * as Options from "@effect/cli/Options";
import * as Span from "@effect/cli/HelpDoc/Span";

const FORWARD_REF_REGEX =
  /(@Inject\(forwardRef\(\(\)\s*=>\s*[^)]+\)\)\s*(?:(?:private|protected)\s+)?readonly\s+[^:]+:\s+)([^,<>]+),/g;
const FORWARD_REF_REPLACEMENT = "$1Relation<$2>,";

const MANY_TO_ONE_REGEX =
  /(@ManyToOne\(\s*\(\)\s*=>\s*[^,]+,\s*\([^)]+\)\s*=>\s*[^)]+\)\s+(?:@[^(]+\([^)]*\)\s+)*\s+[^:]+:\s*)([^;<>]+);/g;
const MANY_TO_ONE_REPLACEMENT = "$1Relation<$2>;";

const RELATION_IMPORT_REGEX =
  /import\s*\{[^}]*Relation[^}]*\}\s*from\s*["']typeorm["'];/;

const updateContents = (s: string): Option.Option<string> => {
  const hasForwardRef = FORWARD_REF_REGEX.test(s);
  const hasManyToOne = MANY_TO_ONE_REGEX.test(s);

  if (!hasForwardRef && !hasManyToOne) return Option.none();

  if (hasForwardRef) {
    s = s.replaceAll(FORWARD_REF_REGEX, FORWARD_REF_REPLACEMENT);
  }
  if (hasManyToOne) {
    s = s.replaceAll(MANY_TO_ONE_REGEX, MANY_TO_ONE_REPLACEMENT);
  }
  if (!RELATION_IMPORT_REGEX.test(s)) {
    s = `import { Relation } from "typeorm";\n${s}`;
  }
  return Option.some(s);
};

const processFile = Effect.fn("processFile")(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const contents = yield* fs.readFileString(filePath);
  yield* pipe(
    updateContents(contents),
    Effect.transposeMapOption((newContents) =>
      fs.writeFileString(filePath, newContents),
    ),
    Effect.map(Option.isSome),
    Effect.if({
      onTrue: () => Effect.log("Updated file", filePath),
      onFalse: () => Effect.logTrace("Skipped file", filePath),
    }),
  );
});

const rootDir = Args.directory({ name: "root-dir", exists: "yes" });
const concurrency = Options.integer("concurrency").pipe(
  Options.withAlias("j"),
  Options.withDefault(10),
  Options.withDescription("How many files to read/update in parallel."),
);

const isTsFile = String.endsWith(".ts");
const command = Command.make(
  "fix-nestjs-swc-circular",
  { rootDir, concurrency },
  Effect.fnUntraced(function* (args) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const { rootDir, concurrency } = args;
    yield* Effect.logDebug(args);

    const files = yield* fs.readDirectory(rootDir, { recursive: true });
    yield* Effect.all(
      files
        .filter(isTsFile)
        .map((file) => path.join(rootDir, file))
        .map(processFile),
      { concurrency },
    );
  }),
);

const cli = Command.run(command, {
  name: "Fix NestJS-SWC Circular",
  version: "v0.0.1",
  summary: Span.text("Fix circular dependencies in a NestJS project"),
});

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
