export type Clip = {
  id: number;
  filePath: string;
  relPath: string;
  game: string;
  filename: string;
  displayName: string | null;
  extension: string;
  sizeBytes: number;
  fileModifiedAt: string;
  published?: boolean;
  publishedUrl?: string | null;
  starred?: boolean;
  tags?: string[];
  notes?: string | null;
};


