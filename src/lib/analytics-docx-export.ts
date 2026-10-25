import { AlignmentType, Document, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { AssessmentReportData } from './reports-generator';

function table(headers: string[], rows: string[][]): Table {
  const widths = headers.map(() => 100 / headers.length);
  const row = (values: string[], header = false) => new TableRow({
    tableHeader: header,
    children: values.map((value, index) => new TableCell({
      width: { size: widths[index], type: WidthType.PERCENTAGE },
      shading: header ? { fill: 'E8EEF5' } : undefined,
      margins: { top: 80, bottom: 80, left: 80, right: 80 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, bold: header, font: 'Arial', size: 18 })] })],
    })),
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row(headers, true), ...rows.map((values) => row(values))] });
}

function heading(text: string): Paragraph {
  return new Paragraph({ spacing: { before: 180, after: 100 }, children: [new TextRun({ text, bold: true, font: 'Arial', size: 24 })] });
}

export async function downloadAnalyticsReportDocx(report: AssessmentReportData): Promise<void> {
  const { metadata, classSummary, itemAnalysis, competencyMastery, cognitiveMastery, learnerScores } = report;
  const document = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 680, bottom: 680, left: 680, right: 680 } } }, children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: metadata.schoolName || 'School Report', bold: true, font: 'Arial', size: 28 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ASSESSMENT AND ITEM ANALYSIS REPORT', bold: true, font: 'Arial', size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `${metadata.title} · ${metadata.subject} · ${metadata.section} · ${metadata.term} · S.Y. ${metadata.schoolYear}`, font: 'Arial', size: 18 })] }),
      heading('Class Summary'),
      table(['Cases', 'Items', 'Mean', 'MPS', 'Highest', 'Lowest', 'Passing rate'], [[String(classSummary.totalScanned), String(metadata.targetItems), classSummary.meanScore.toFixed(2), `${classSummary.mps.toFixed(2)}%`, String(classSummary.highestScore), String(classSummary.lowestScore), `${classSummary.passingRate.toFixed(1)}%`]]),
      heading('Item Analysis and Answer Choices'),
      table(['Item', 'Key', 'A', 'B', 'C', 'D', 'Correct', 'Cases', 'P', 'D', 'Action'], itemAnalysis.rows.map((item) => [
        String(item.itemNumber), item.correctAnswer || '—', ...['A', 'B', 'C', 'D'].map((choice) => `${item.choiceCounts[choice] || 0}${item.correctAnswer === choice ? ' ✓' : ''}`), String(item.correctCount), String(item.totalCount), item.pIndex.toFixed(2), item.dIndex.toFixed(2), item.decision,
      ])),
      heading('Competency Mastery'),
      table(['Competency', 'Items', 'Mastery', 'Level'], competencyMastery.map((item) => [item.statement, item.itemNumbers.join(', '), `${item.masteryPct.toFixed(1)}%`, item.masteryLevel])),
      heading('Cognitive Domain Mastery'),
      table(['Domain', 'Items', 'Item numbers', 'Mastery'], cognitiveMastery.map((item) => [item.domain, String(item.itemCount), item.itemNumbers.join(', '), `${item.masteryPct.toFixed(1)}%`])),
      heading('Learner Scores'),
      table(['Learner', 'LRN', 'Score', 'Percent', 'Status'], learnerScores.map((learner) => [learner.name, learner.lrn || '—', `${learner.score}/${learner.totalItems}`, `${learner.percentage.toFixed(1)}%`, learner.status])),
      new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: `Prepared by ${metadata.teacherName || '____________________'} · ${metadata.date}`, font: 'Arial', size: 18 })] }),
    ] }],
  });
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `Assessment_Report_${metadata.schoolYear}_${metadata.section}.docx`.replace(/[^a-zA-Z0-9_.-]+/g, '_');
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadConsolidatedReportDocx(input: {
  schoolName: string;
  schoolYear: string;
  rows: Array<{
    sectionName: string;
    enrolledStudents: number;
    scannedStudents: number;
    meanScore: number | null;
    standardDeviation: number | null;
    mps: number | null;
    outstandingCount: number;
    didNotMeetCount: number;
  }>;
}): Promise<void> {
  const document = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 680, bottom: 680, left: 680, right: 680 } } }, children: [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: input.schoolName || 'Department of Education', bold: true, font: 'Arial', size: 28 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [new TextRun({ text: `CONSOLIDATED ACADEMIC MASTERY REPORT · S.Y. ${input.schoolYear}`, bold: true, font: 'Arial', size: 24 })] }),
    table(['Section', 'Enrolled', 'Cases', 'Mean', 'Std. dev.', 'MPS', 'Outstanding', 'Did not meet'], input.rows.map((row) => [
      row.sectionName, String(row.enrolledStudents), String(row.scannedStudents), row.meanScore?.toFixed(1) || '—', row.standardDeviation?.toFixed(2) || '—', row.mps === null ? '—' : `${row.mps.toFixed(1)}%`, String(row.outstandingCount), String(row.didNotMeetCount),
    ])),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: `Generated ${new Date().toLocaleDateString()}`, font: 'Arial', size: 18 })] }),
  ] }] });
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `Consolidated_Report_${input.schoolYear}.docx`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
