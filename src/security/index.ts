import { resolve, isAbsolute } from "path";

export function assertInProjectRoot(
  userPath: string,
  projectRoot: string
): string {
  if (isAbsolute(userPath)) {
    throw new Error("access denied: path outside project root");
  }
  const resolved = resolve(projectRoot, userPath);
  if (resolved !== projectRoot && !resolved.startsWith(projectRoot + "/")) {
    throw new Error("access denied: path outside project root");
  }
  return resolved;
}
