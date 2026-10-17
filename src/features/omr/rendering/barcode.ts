/**
 * Project KIT — Pure Vector SVG Barcode Generator (Code 39)
 * Used for high-reliability, zero-dependency machine-readable optical identifiers on OMR answer sheets.
 * Encodes alphanumeric strings (UUIDs, assessment IDs, random learner IDs).
 */

const CODE39_PATTERNS: Record<string, string> = {
  '0': 'bwbwwwbbwbw',
  '1': 'bbbwbwwwbwb',
  '2': 'bwbwwwbbbwb',
  '3': 'bbbwbwwwbbbwb',
  '4': 'bwbwwwbwbwb',
  '5': 'bbbwbwwwbwbwb',
  '6': 'bwbwwwbbbwbwb',
  '7': 'bwbwwwbwbwwwb',
  '8': 'bbbwbwwwbwbwwwb',
  '9': 'bwbwwwbbbwbwwwb',
  'A': 'bbwbwbbbwbwwwb',
  'B': 'bwbwbbbbbwbwwwb',
  'C': 'bbwbwbbbbbwbwwwb',
  'D': 'bwbwbbbwbwwwbbwb',
  'E': 'bbwbwbbbwbwwwbbwb',
  'F': 'bwbwbbbbbwbwwwbbwb',
  'G': 'bwbwbbbwbwwwbwb',
  'H': 'bbwbwbbbwbwwwbwb',
  'I': 'bwbwbbbbbwbwwwbwb',
  'J': 'bwbwbbbwbwbbbbbwb',
  'K': 'bbwbwwwbwbwbbwb',
  'L': 'bwbwwwbbwbwbbwb',
  'M': 'bbwbwwwbbwbwbbwb',
  'N': 'bwbwwwbwbwbbbbbwb',
  'O': 'bbwbwwwbwbwbbbbbwb',
  'P': 'bwbwwwbbwbwbbbbbwb',
  'Q': 'bwbwwwbwbwwwbbwb',
  'R': 'bbwbwwwbwbwwwbbwb',
  'S': 'bwbwwwbbwbwwwbbwb',
  'T': 'bwbwwwbwbwwwbbbbbwb',
  'U': 'bbbwbwwwbwbwbbwb',
  'V': 'bwbwwwbbbwbwbbwb',
  'W': 'bbbwbwwwbbbwbwbbwb',
  'X': 'bwbwwwbwbwbbbbbwb',
  'Y': 'bbbwbwwwbwbwbbbbbwb',
  'Z': 'bwbwwwbbbwbwbbbbbwb',
  '-': 'bwbwwwbwbwwwbbwb',
  '.': 'bbbwbwwwbwbwwwbwb',
  ' ': 'bwbwwwbbbwbwwwbwb',
  '$': 'bwbwbwbwwwb',
  '/': 'bwbwbwwwbwb',
  '+': 'bwbwwwbwbwb',
  '%': 'bwwwbwbwbwb',
  '*': 'bwbwwwbbwbwwwb', // Start/Stop delimiter
};

/**
 * Standard Code 39 barcode encoding table:
 * 9 elements: 5 bars (B/b) and 4 spaces (W/w)
 * 1 = wide (3x), 0 = narrow (1x)
 */
const CODE39_ENCODINGS: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  'A': '100001001',
  'B': '001001001',
  'C': '101001000',
  'D': '000011001',
  'E': '100011000',
  'F': '001011000',
  'G': '000001101',
  'H': '100001100',
  'I': '001001100',
  'J': '000011100',
  'K': '100000011',
  'L': '001000011',
  'M': '101000010',
  'N': '000010011',
  'O': '100010010',
  'P': '001010010',
  'Q': '000000111',
  'R': '100000110',
  'S': '001000110',
  'T': '000010110',
  'U': '110000001',
  'V': '011000001',
  'W': '111000000',
  'X': '010010001',
  'Y': '110010000',
  'Z': '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  '$': '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
  '*': '010010100',
};

export interface BarcodeRenderOptions {
  x: number;
  y: number;
  height: number;
  narrowBarWidth?: number;
  wideBarRatio?: number;
  showText?: boolean;
}

/**
 * Generates an SVG group containing Code 39 bars.
 */
export function generateCode39Svg(text: string, options: BarcodeRenderOptions): string {
  const clean = text.toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+\%]/g, '-');
  const fullText = `*${clean}*`;
  const narrow = options.narrowBarWidth || 0.85;
  const wide = narrow * (options.wideBarRatio || 2.5);
  const interGap = narrow;

  let currentX = options.x;
  let rects = '';

  for (let i = 0; i < fullText.length; i++) {
    const char = fullText[i];
    const encoding = CODE39_ENCODINGS[char] || CODE39_ENCODINGS['-'];

    // 9 elements: alternating bar, space, bar, space... (5 bars, 4 spaces)
    for (let el = 0; el < 9; el++) {
      const isBar = el % 2 === 0;
      const isWide = encoding[el] === '1';
      const width = isWide ? wide : narrow;

      if (isBar) {
        rects += `    <rect x="${currentX.toFixed(2)}" y="${options.y}" width="${width.toFixed(2)}" height="${options.height}" fill="#000000"/>\n`;
      }
      currentX += width;
    }

    // Inter-character space
    if (i < fullText.length - 1) {
      currentX += interGap;
    }
  }

  const textLabel = options.showText
    ? `    <text x="${(options.x + (currentX - options.x) / 2).toFixed(2)}" y="${options.y + options.height + 9}" font-family="monospace" font-size="7" font-weight="bold" text-anchor="middle" fill="#374151">${clean}</text>\n`
    : '';

  return `  <!-- Code 39 Barcode: ${clean} -->\n  <g class="omr-barcode" data-code="${clean}">\n${rects}${textLabel}  </g>\n`;
}

