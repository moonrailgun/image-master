import JSZip from "jszip";
import { saveAs } from "file-saver";

export interface DownloadItem {
  name: string;
  blob: Blob;
  folder?: string;
}

/**
 * Download multiple files as a single ZIP archive
 */
export async function downloadAsZip(
  items: DownloadItem[],
  zipName: string = "images.zip"
): Promise<void> {
  const zip = new JSZip();

  for (const item of items) {
    const path = item.folder ? `${item.folder}/${item.name}` : item.name;
    zip.file(path, item.blob);
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, zipName);
}

/**
 * Download a single file
 */
export function downloadSingle(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}
