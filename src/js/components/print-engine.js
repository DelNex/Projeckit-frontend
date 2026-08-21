/**
 * Isolated Section Print Engine
 * Renders target containers into an isolated print iframe or print-only overlay
 * without altering or breaking the live application DOM.
 */

export function printElement(elementOrId, options = {}) {
  const targetEl =
    typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;

  if (!targetEl) {
    console.error(`[PrintEngine] Target print container not found:`, elementOrId);
    alert('Target print section could not be found.');
    return;
  }

  // Warn user before printing OMR sheet to ensure 100% scale accuracy
  if (options.isOmrSheet) {
    const confirmPrint = confirm(
      `IMPORTANT FOR ACCURATE OMR SCANNING:\n\n` +
        `• Set Scale to 100% (Actual Size)\n` +
        `• Disable "Fit to Page" or Custom Shrink\n` +
        `• Ensure registration corner markers are unclipped\n\n` +
        `Proceed to print OMR sheet?`
    );
    if (!confirmPrint) return;
  }

  // Create isolated print iframe
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';

  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow?.document;
  if (!doc) {
    console.error('[PrintEngine] Unable to access print iframe window.');
    document.body.removeChild(printFrame);
    return;
  }

  const paperSize = options.paperSize || 'A4';
  const orientation = options.orientation || 'portrait';
  const docTitle = options.title || 'Project KIT Document';

  doc.open();
  doc.write(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${docTitle}</title>
        <link rel="stylesheet" href="/css/style.css">
        <style>
          @page {
            size: ${paperSize} ${orientation};
            margin: 12mm;
          }
          body {
            background: #ffffff !important;
            color: #111827 !important;
            font-family: Outfit, sans-serif !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          .print-container { width: 100% !important; margin: 0 auto !important; }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${targetEl.outerHTML}
        </div>
      </body>
    </html>
  `);
  doc.close();

  // Trigger print once styles/iframe load
  setTimeout(() => {
    printFrame.contentWindow?.focus();
    printFrame.contentWindow?.print();

    // Clean up iframe after print dialog resolves
    setTimeout(() => {
      if (printFrame.parentNode) {
        printFrame.parentNode.removeChild(printFrame);
      }
    }, 1000);
  }, 300);
}
