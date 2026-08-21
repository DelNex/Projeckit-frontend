/**
 * Isolated Section Print Engine
 * Renders target containers into an isolated print iframe
 * without altering or breaking the live application DOM.
 */

export function printElement(elementOrId, options = {}) {
  const targetEl =
    typeof elementOrId === 'string' ? document.getElementById(elementOrId) || document.querySelector(elementOrId) : elementOrId;

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
    if (printFrame.parentNode) printFrame.parentNode.removeChild(printFrame);
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
        <style>
          @page {
            size: ${paperSize} ${orientation};
            margin: 10mm;
          }
          body {
            background: #ffffff !important;
            color: #111827 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .print-container { width: 100% !important; margin: 0 auto !important; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #111827; padding: 6px; }
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

  setTimeout(() => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } catch (e) {
      console.error('[PrintEngine] Print failed', e);
    } finally {
      setTimeout(() => {
        if (printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame);
        }
      }, 1500);
    }
  }, 350);
}

export function printHtmlString(htmlString, options = {}) {
  if (!htmlString) return;

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
    if (printFrame.parentNode) printFrame.parentNode.removeChild(printFrame);
    return;
  }

  doc.open();
  doc.write(htmlString);
  doc.close();

  setTimeout(() => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } catch (e) {
      console.error('[PrintEngine] Print failed', e);
    } finally {
      setTimeout(() => {
        if (printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame);
        }
      }, 1500);
    }
  }, 350);
}
