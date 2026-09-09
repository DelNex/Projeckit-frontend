declare module '@armghan3071/omrchecker' {
  export interface OmrCheckerConfig {
    cv?: unknown;
    includeOutputImages?: boolean;
  }

  export interface OmrCheckerResult {
    fileName: string;
    score?: number | string;
    response: Record<string, string>;
    imagePath?: string;
    markedImagePath?: string;
    markedImage?: string;
    multiMarked?: boolean;
    error?: string;
  }

  export class OMRChecker {
    constructor(config?: OmrCheckerConfig);
    process(
      files: File[],
      template: unknown,
      marker: Blob,
      setLayout?: boolean
    ): Promise<OmrCheckerResult[]>;
    terminate(): void;
  }
}

