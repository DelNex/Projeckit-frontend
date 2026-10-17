declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFParseOptions {
    pagerender?: (pageData: any) => string | Promise<string>;
    max?: number;
    version?: string;
  }

  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: any;
    text: string;
  }

  function PDFParse(dataBuffer: Buffer | Uint8Array, options?: PDFParseOptions): Promise<PDFParseResult>;
  export = PDFParse;
}

declare module 'mammoth' {
  interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export function extractRawText(input: { buffer: Buffer } | { path: string } | { arrayBuffer: ArrayBuffer }): Promise<ExtractResult>;
}

