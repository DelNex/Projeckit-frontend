/**
 * Project KIT — Dynamic OMR Master Answer Sheet Print & Preview Modal
 * Allows teachers to preview and print the generated master answer sheet SVG
 * tailored dynamically to the assessment's item count and class size.
 */

'use client';

import { Printer, X } from 'lucide-react';
import { useMemo } from 'react';
import { CanonicalOmrGeometry } from '../geometry/geometry-types';
import { renderOmrMasterSvg } from '../rendering/svg-renderer';

export interface OmrPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  geometry: CanonicalOmrGeometry;
}

export function OmrPrintModal({ isOpen, onClose, geometry }: OmrPrintModalProps) {
  const svgContent = useMemo(() => {
    if (!geometry) return '';
    return renderOmrMasterSvg(geometry);
  }, [geometry]);

  const printPageConfig = useMemo(() => {
    const widthMm = geometry.page.width / 3.779528; // px to mm approximation
    const heightMm = geometry.page.height / 3.779528;

    if (heightMm > 297) {
      return {
        paper: `${Math.ceil(widthMm)}mm ${Math.ceil(heightMm)}mm`,
        viewport: 'long',
      };
    }

    if (widthMm <= 148 && heightMm <= 210) {
      return {
        paper: 'A5 portrait',
        viewport: 'a5',
      };
    }

    return {
      paper: 'A4 portrait',
      viewport: 'a4',
    };
  }, [geometry]);

  if (!isOpen) return null;

  const handlePrint = () => {
    const printHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${geometry.templateId} — Master Answer Sheet</title>
    <style>
      @page {
        size: ${printPageConfig.paper};
        margin: 0;
      }
      *, *::before, *::after { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        width: 100%;
      }
      .omr-print-shell {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        background: #ffffff;
      }
      .omr-print-shell svg {
        display: block;
        width: 100%;
        max-width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>
    <div class="omr-print-shell">${svgContent}</div>
    <script>
      window.addEventListener('load', function () {
        window.print();
        setTimeout(function () { window.close(); }, 1500);
      });
    </script>
  </body>
</html>`;

    // Use a Blob URL so the new tab loads a real page (not about:blank).
    // document.write on about:blank is unreliable — browsers may block it or
    // race the load event, leaving the tab blank.
    const blob = new Blob([printHtml], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const printTab = window.open(blobUrl, '_blank');
    if (!printTab) {
      URL.revokeObjectURL(blobUrl);
      alert('Popups are blocked. Please allow popups for this site to print.');
      return;
    }

    // Revoke after enough time for the page to load and print dialog to open
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative flex flex-col w-full max-w-5xl h-[95vh] sm:h-[92vh] rounded-3xl bg-gray-900 border border-gray-800 shadow-2xl text-white overflow-hidden">

        {/* Modal Header — sticky, never scrolls away */}
        <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-800 px-4 sm:px-6 py-3.5">
          <div className="min-w-0">
            <h3 className="text-base font-bold truncate">Printable Master Answer Sheet</h3>
            <p className="text-xs text-gray-400 truncate">
              Template: <span className="font-mono text-blue-400">{geometry.templateId}</span> • Items: {geometry.config.itemCount} • Class Size: {geometry.config.classSize}
            </p>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <Printer className="h-4 w-4" />
              <span>Print Sheet</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body — independently scrollable both axes */}
        <div className="flex-1 min-h-0 overflow-auto bg-gray-950">
          {/* Padding wrapper — centres sheet with breathing room */}
          <div className="p-4 sm:p-8 flex justify-center">
            {/* Sheet at exact native pixel dimensions — no squashing, scroll reveals rest */}
            <div
              className="bg-white rounded-lg shadow-2xl shrink-0"
              style={{
                width: geometry.page.width,
                height: geometry.page.height,
              }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
        </div>

        {/* Footer — sticky size/scroll hint */}
        <div className="shrink-0 border-t border-gray-800 px-5 py-2 flex items-center justify-between text-[11px] text-gray-500 bg-gray-900 select-none">
          <span>↕ Scroll to view full sheet</span>
          <span className="font-mono">{geometry.page.width} × {geometry.page.height} px · {printPageConfig.paper}</span>
        </div>

      </div>
    </div>
  );
}

