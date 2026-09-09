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

  if (!isOpen) return null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print the answer sheet.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${geometry.templateId} — Master Answer Sheet</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              background-color: white;
            }
            svg {
              width: 100vw;
              max-width: 681px;
              height: auto;
              max-height: 100vh;
            }
          </style>
        </head>
        <body>
          ${svgContent}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => window.close(), 1000);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl bg-gray-900 border border-gray-800 shadow-2xl text-white">
        {/* Modal Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-800 px-4 sm:px-6 py-4">
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

        {/* Modal Body: Vector SVG Preview */}
        <div className="flex-1 overflow-auto p-6 flex justify-center bg-gray-950">
          <div
            className="bg-white rounded-lg shadow-lg overflow-hidden"
            style={{ width: `${geometry.page.width}px`, maxWidth: '100%' }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        </div>
      </div>
    </div>
  );
}

