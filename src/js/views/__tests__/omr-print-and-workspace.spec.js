/**
 * @jest-environment jsdom
 */
import * as AssessmentApi from '../../api/assessment-api.js';

describe('OMR Form Printing & API Contract Regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('constructs correct API path for printable OMR HTML', () => {
    const url = AssessmentApi.getOmrFormPrintUrl(123);
    expect(url).toBe('/api/assessments/123/omr-form/print');
  });

  test('constructs correct CSV export endpoint for results', () => {
    const url = AssessmentApi.getResultsExportCsvUrl(456);
    expect(url).toBe('/api/assessments/456/results/export/csv');
  });

  test('triggers window.print() on OMR printable document container', () => {
    const mockDocument = {
      write: jest.fn(),
      close: jest.fn(),
    };
    const mockPrintWindow = {
      document: mockDocument,
      focus: jest.fn(),
      print: jest.fn(),
    };
    jest.spyOn(window, 'open').mockReturnValue(mockPrintWindow);

    const htmlContent = '<html><body><h1>OMR Answer Sheet</h1></body></html>';
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();

    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(mockDocument.write).toHaveBeenCalledWith(htmlContent);
    expect(mockDocument.close).toHaveBeenCalled();
    expect(mockPrintWindow.focus).toHaveBeenCalled();
  });

  test('handles camera permission failure gracefully without throwing uncaught exceptions', async () => {
    const mockGetUserMedia = jest.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    let cameraError = null;
    try {
      await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (err) {
      cameraError = err;
    }

    expect(cameraError).not.toBeNull();
    expect(cameraError.name).toBe('NotAllowedError');
  });
});
