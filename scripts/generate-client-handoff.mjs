import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Paragraph,
  Packer,
  TextRun,
} from 'docx';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../docs/handoff/Project-KIT-Client-Handoff.docx');

const body = [];
const para = (text, options = {}) => body.push(new Paragraph({ spacing: { after: 120 }, ...options, children: [new TextRun(text)] }));
const heading = (text, level = HeadingLevel.HEADING_1) => body.push(new Paragraph({ text, heading: level, keepNext: true, spacing: { before: 240, after: 100 } }));
const bullet = (text) => body.push(new Paragraph({ bullet: { indent: 360 }, spacing: { after: 80 }, children: [new TextRun(text)] }));
const numbered = (text) => body.push(new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { after: 100 }, children: [new TextRun(text)] }));

body.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 800, after: 180 },
  children: [new TextRun({ text: 'PROJECT KIT', bold: true, color: '1747D1', size: 18 })],
}));
body.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 160 },
  children: [new TextRun({ text: 'Client Handoff and Everyday User Guide', bold: true, size: 34, color: '16233C' })],
}));
body.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 320 },
  children: [new TextRun({ text: 'A practical guide for teachers and school administrators', size: 22, color: '53637D' })],
}));
body.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 440 },
  children: [new TextRun({ text: 'Prepared October 26, 2026', size: 20, color: '53637D' })],
}));
para('This guide explains the main Project KIT tasks in everyday language. You do not need to know programming to use the system.');

heading('What Project KIT helps you do');
para('Project KIT helps a school prepare examinations, print student answer sheets, read marked answer sheets, review results, and download reports. Your school records are organized by sections and assessments.');
bullet('A Table of Specifications (TOS) is your exam plan. It connects the lessons and skills taught to the questions on the exam.');
bullet('An assessment is the exam students take. Its questions, sections, and answer key belong together.');
bullet('Item Analysis shows how students answered each question and helps you find questions that may need a closer look.');
bullet('Print & Reports is the central place to download or print documents for a selected section.');

heading('Your usual exam-to-report process');
numbered('Prepare the exam plan. Open Table of Specifications, create or choose a TOS, select the sections that use it, and enter the competencies and days taught. Check the item counts before saving.');
numbered('Prepare the exam. Create or open the assessment linked to that TOS. Generate or enter questions, read through them, and save the exam.');
numbered('Set the answer key. Open Answer Key Setup and choose the correct answer for every question. Save the key before scanning papers.');
numbered('Print the student materials. Open Print & Reports, choose the class section, and select the question paper or OMR answer sheet. For a question paper, choose A4 or A5, one or two columns, and whether you need a teacher copy with answers.');
numbered('Scan and review. Open the assessment scanner. First identify the student using the barcode or roll number on the sheet, then scan the marked answers. The system may ask you to review a faint, erased, or multiple mark. Check the student and each uncertain answer before confirming.');
numbered('Check the results. Open Item Analysis to see the saved answer and how many students chose each option. Open Print & Reports again to download the reports for the section.');

heading('Understanding the scan review');
para('A scan that needs review is not yet a confirmed result. The teacher should check that the student is matched to the correct paper and that every uncertain answer is read correctly. If a mark was erased or more than one choice was marked, the current scoring rule treats that item as wrong. The teacher can correct an incorrect machine reading before the final result is saved.');
para('A repeat scan of a student should not make that student count twice in analysis. Reports use the newest confirmed scan where the student can be identified.');

heading('Finding your documents');
para('Open Print & Reports in the left menu, then choose a section. The list shows documents connected to that section. Depending on what has been prepared, you can download the TOS, test results, most/least learned report, item analysis, question paper, or print OMR sheets. If a report is missing, first check that the assessment is linked to the TOS and section and that results have been saved.');
para('Word documents use the DOCX format. Open the downloaded file in Microsoft Word or a compatible document app. You can review the pages and then print them. A printer may show its own paper-size setting, so confirm it matches the size selected in Project KIT.');

heading('How to read Item Analysis');
para('Each question lists the answer key and counts for the answer choices. The keyed correct choice is highlighted in green. Other choices are shown in red as incorrect selections. Click a count when the page offers that action to see which learners selected that answer. Use this information to decide whether a question was clear and whether students need more instruction.');

heading('Understanding the test-results calculations');
bullet('Cases means learners who have at least one saved response for the selected examination.');
bullet('Mean is the total of learner scores divided by the number of cases.');
bullet('PL is the mean divided by the number of exam questions, multiplied by 100.');
bullet('MPS is PL multiplied by 0.98, then increased by 2.');
bullet('The average row is the simple average of the section rows shown in that report.');

heading('If something does not work');
bullet('If the AI helper is unavailable, wait briefly and try again. Keep your saved exam plan and draft; do not repeatedly start new generation requests. A saved job or draft should be reused when the page offers that option.');
bullet('If a scan shows the wrong learner, stop and correct the student match before confirming the sheet.');
bullet('If an answer looks uncertain, reposition the sheet with all four corners visible, avoid glare, and scan again. Review the result before saving.');
bullet('If a report is not listed, refresh Print & Reports and confirm the assessment, TOS, section, answer key, and saved scans are connected.');
bullet('If you still need help, tell your Project KIT administrator which page you were on and what button you pressed. A screenshot of the message is helpful. Do not send your password or deletion code.');

heading('Important accuracy note');
para('The camera helps read answer sheets, but lighting, paper position, print quality, and pencil marks can affect the reading. No camera scanner can promise perfect results in every condition. Always review uncertain scans and compare the final results with the original papers when something looks unusual.');

heading('School administrator checklist');
bullet('Confirm the school name and sections are correct.');
bullet('Make sure staff members use their own approved sign-in accounts.');
bullet('Check that every exam has the right TOS, section, question count, and saved answer key.');
bullet('Test one printed answer sheet and one scan before scanning a whole class.');
bullet('Keep downloaded reports in the school’s approved storage location and share them only with authorized staff.');

para('Project KIT support handoff • Prepared October 26, 2026', { alignment: AlignmentType.CENTER, spacing: { before: 500, after: 0 } });

const doc = new Document({
  numbering: { config: [{ reference: 'steps', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: '26354D' }, paragraph: { spacing: { line: 300 } } } },
    title: { run: { font: 'Arial', size: 34, bold: true, color: '16233C' }, paragraph: { spacing: { after: 180 } } },
    heading1: { run: { font: 'Arial', size: 28, bold: true, color: '1747D1' }, paragraph: { spacing: { before: 280, after: 100 } } },
  },
  sections: [{
    properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
    headers: {},
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Project KIT • Client Guide  |  Page '), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
    children: body,
  }],
});

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, await Packer.toBuffer(doc));
console.log(`Created ${output}`);
