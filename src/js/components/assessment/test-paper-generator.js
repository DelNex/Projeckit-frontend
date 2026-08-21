/**
 * Assessment Test Paper & Standardized OMR Sheet Generator Component
 * Generates printable test papers, answer keys, and standardized OMR bubble sheets
 * with 4 corner registration markers and QR code metadata.
 */

import { printElement } from '../print-engine.js';
import { escapeHTML } from '../../utils.js';

export function renderTestPaperGenerator(containerEl, config = {}) {
  const itemCount = config.itemCount || 40;
  const choices = ['A', 'B', 'C', 'D'];

  containerEl.innerHTML = `
    <div class="space-y-6">
      <!-- Toolbar -->
      <div class="p-4 bg-white dark:bg-gray-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-gray-900 dark:text-white">${escapeHTML(config.title || 'Assessment')} — Document Studio</h3>
          <p class="text-[10px] text-gray-400 mt-0.5">${escapeHTML(config.subjectTitle || '')} · ${escapeHTML(config.sectionName || '')} · ${escapeHTML(config.term || '')}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button id="btn-print-test-paper" class="px-3 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg shadow-xs transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print Test Paper
          </button>
          <button id="btn-print-omr-sheet" class="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Print OMR Answer Sheet
          </button>
          <button id="btn-print-answer-key" class="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded-lg transition">
            Print Answer Key
          </button>
        </div>
      </div>

      <!-- Printable OMR Sheet Container -->
      <div id="print-omr-sheet" class="omr-sheet-container bg-white text-black p-8 rounded-xl border border-gray-300 space-y-6 max-w-3xl mx-auto shadow-sm">
        <!-- 4 Registration Corner Markers -->
        <div class="flex items-center justify-between">
          <div class="w-8 h-8 bg-black rounded-xs"></div>
          <div class="text-center">
            <h2 class="text-lg font-black uppercase tracking-wider text-black">OFFICIAL OMR ANSWER SHEET</h2>
            <p class="text-[10px] text-gray-600 font-semibold uppercase">${escapeHTML(config.subjectTitle || '')} · ${escapeHTML(config.term || '')} (${escapeHTML(config.schoolYear || '')})</p>
          </div>
          <div class="w-8 h-8 bg-black rounded-xs"></div>
        </div>

        <!-- Student & Section Metadata -->
        <div class="grid grid-cols-2 gap-4 border-2 border-black p-3 text-xs font-mono">
          <div>
            <p class="font-bold text-[10px] uppercase">Learner Name (Last, First M.I.):</p>
            <div class="border-b border-black h-6 mt-1"></div>
          </div>
          <div>
            <p class="font-bold text-[10px] uppercase">12-Digit LRN / Student ID:</p>
            <div class="border-b border-black h-6 mt-1"></div>
          </div>
          <div>
            <p class="font-bold text-[10px] uppercase">Section / Track:</p>
            <p class="font-bold mt-0.5">${escapeHTML(config.sectionName || '')}</p>
          </div>
          <div>
            <p class="font-bold text-[10px] uppercase">Assessment Form:</p>
            <p class="font-bold mt-0.5">FORM A (Standard)</p>
          </div>
        </div>

        <!-- Bubble Sheet Matrix (3 columns) -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs font-mono pt-2">
          ${Array.from({ length: itemCount }).map((_, i) => {
            const num = i + 1;
            return `
              <div class="flex items-center gap-2 py-1 border-b border-gray-200">
                <span class="w-6 font-bold text-right text-gray-700">${num}.</span>
                <div class="flex items-center gap-1.5">
                  ${choices.map(c => `
                    <div class="flex items-center justify-center w-5 h-5 rounded-full border-1.5 border-black text-[9px] font-bold text-black">
                      ${c}
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Bottom Registration Markers -->
        <div class="flex items-center justify-between pt-4">
          <div class="w-8 h-8 bg-black rounded-xs"></div>
          <p class="text-[9px] font-mono text-gray-500 uppercase tracking-widest text-center">Do not fold or crease paper · Darken bubbles completely using Black/Blue Pen or No. 2 Pencil</p>
          <div class="w-8 h-8 bg-black rounded-xs"></div>
        </div>
      </div>
    </div>
  `;

  // Attach Print Handlers
  containerEl.querySelector('#btn-print-test-paper')?.addEventListener('click', () => {
    printElement(containerEl.querySelector('#print-omr-sheet'), {
      title: `${config.title} — Test Paper`,
      paperSize: 'A4',
    });
  });

  containerEl.querySelector('#btn-print-omr-sheet')?.addEventListener('click', () => {
    printElement(containerEl.querySelector('#print-omr-sheet'), {
      title: `${config.title} — Standardized OMR Sheet`,
      isOmrSheet: true,
      paperSize: 'A4',
    });
  });

  containerEl.querySelector('#btn-print-answer-key')?.addEventListener('click', () => {
    printElement(containerEl.querySelector('#print-omr-sheet'), {
      title: `${config.title} — Answer Key`,
      paperSize: 'A4',
    });
  });
}
