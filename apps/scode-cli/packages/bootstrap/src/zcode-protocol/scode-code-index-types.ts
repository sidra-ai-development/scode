export interface IndexedFile {
  absolutePath: string;
  relativePath: string;
  mtimeMs: number;
  size: number;
}

export interface SourceSnapshot {
  files: IndexedFile[];
  fingerprint: string;
  scanMs: number;
}

export interface CodeIndexBuildResult {
  buildMs: number;
  fileCount: number;
  occurrences: number;
  parseErrors: number;
  symbolCount: number;
}
