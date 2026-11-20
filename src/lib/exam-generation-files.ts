/** File types supported by the local lesson extraction pipeline. */
export const SUPPORTED_EXAM_SOURCE_EXTENSIONS = [
  '.pdf', '.docx', '.pptx', '.txt', '.md',
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff',
] as const;

export function isSupportedExamSourceFileName(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return SUPPORTED_EXAM_SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export const EXAM_SOURCE_FILE_ACCEPT = SUPPORTED_EXAM_SOURCE_EXTENSIONS.join(',');
