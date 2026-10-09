export interface ScoringConfig {
  codeMax: number;
  prOpenMax: number;
  prMergeMax: number;
  fullLines: number;
  fullFiles: number;
  fileWeight: number;
  excludedDirectories: string[];
  excludedNames: string[];
  excludedSuffixes: string[];
}

export interface ChangedFile {
  filename?: string;
  additions?: number;
  deletions?: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  codeMax: 100,
  prOpenMax: 10,
  prMergeMax: 40,
  fullLines: 100,
  fullFiles: 3,
  fileWeight: 0.25,
  excludedDirectories: ['dist', 'build', 'coverage', 'generated', '__generated__', 'node_modules', '.next', 'target', 'out'],
  excludedNames: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'Gemfile.lock', 'poetry.lock', 'Pipfile.lock', 'bun.lock', 'bun.lockb', 'composer.lock', 'uv.lock'],
  excludedSuffixes: ['.min.js', '.min.css', '.map', '.generated.ts', '.generated.js'],
};

export function eligibleFile(filename: string, config: ScoringConfig): boolean {
  const parts = filename.replaceAll('\\', '/').toLowerCase().split('/');
  const basename = parts[parts.length - 1];
  return !parts.slice(0, -1).some(part => config.excludedDirectories.some(excluded => excluded.toLowerCase() === part))
    && !config.excludedNames.some(excluded => excluded.toLowerCase() === basename)
    && !config.excludedSuffixes.some(suffix => basename.endsWith(suffix.toLowerCase()));
}

export function scoreDiff(files: ChangedFile[], config: ScoringConfig) {
  let added = 0, deleted = 0, fileCount = 0;
  for (const file of files) {
    if (!file.filename || !eligibleFile(file.filename, config)) continue;
    const additions = Math.max(0, Number(file.additions) || 0);
    const deletions = Math.max(0, Number(file.deletions) || 0);
    if (!additions && !deletions) continue;
    added += additions;
    deleted += deletions;
    fileCount++;
  }
  const lineFactor = Math.min(1, (added + deleted) / config.fullLines);
  const fileFactor = fileCount ? (1 - config.fileWeight) + config.fileWeight * Math.min(1, fileCount / config.fullFiles) : 0;
  const factor = lineFactor * fileFactor;
  return {
    added, deleted, fileCount, factor,
    codeXp: Math.floor(config.codeMax * factor),
    openXp: Math.floor(config.prOpenMax * factor),
    mergeXp: Math.floor(config.prMergeMax * factor),
  };
}

// Split a fixed total by actual commit authors without creating extra XP.
export function allocateXp(total: number, weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0).sort(([a], [b]) => a.localeCompare(b));
  const sum = entries.reduce((value, [, weight]) => value + weight, 0);
  if (!sum || !total) return {};
  const shares = entries.map(([login, weight]) => ({ login, raw: total * weight / sum, amount: Math.floor(total * weight / sum) }));
  let remaining = total - shares.reduce((value, share) => value + share.amount, 0);
  shares.sort((a, b) => (b.raw - b.amount) - (a.raw - a.amount) || a.login.localeCompare(b.login));
  for (const share of shares) {
    if (remaining <= 0) break;
    share.amount++;
    remaining--;
  }
  return Object.fromEntries(shares.map(share => [share.login, share.amount]));
}
