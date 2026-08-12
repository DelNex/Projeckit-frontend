// Setup Answer Key Component — Multi-Modal (Digital OMR, Image Upload, Letter List)

import { escapeHTML } from '../../utils.js';
import * as AssessmentApi from '../../api/assessment-api.js';
import { AssessmentStore } from '../../stores/assessment-store.js';

let activeMode = 'omr'; // 'omr' | 'image' | 'letters'
let currentAnswers = []; // string[] array of letters
let activeAssessmentId = null;

export function renderSetupAnswerKey(answerKey, versions, containerEl, assessment) {
  if (!containerEl) return;
  if (assessment) activeAssessmentId = assessment.id;

  const targetItems = assessment?.targetItems || 50;

  // Initialize current answers array to match targetItems count
  let parsedAnswers = [];
  if (answerKey?.answers) {
    try {
      const p = typeof answerKey.answers === 'string' ? JSON.parse(answerKey.answers) : answerKey.answers;
      if (Array.isArray(p)) parsedAnswers = p.map(a => String(a).toUpperCase().trim());
      else if (typeof p === 'object') {
        parsedAnswers = Array.from({ length: targetItems }, (_, i) => String(p[i + 1] || '').toUpperCase().trim());
      }
    } catch (e) {
      console.warn('[SetupAnswerKey] Answers parse error', e);
    }
  }

  // Guarantee array length equals targetItems
  currentAnswers = Array.from({ length: targetItems }, (_, i) => parsedAnswers[i] || '');

  const versionsList = Array.isArray(versions) ? versions : [];

  containerEl.innerHTML = `
    <div class="space-y-4">
      <!-- Mode Selection Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
        <div>
          <h3 class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>Authoritative Answer Key</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
              ${targetItems} Items
            </span>
          </h3>
          <p class="text-[11px] text-gray-400 mt-0.5">Select input mode: Digital OMR bubbles, Answer Key image, or direct letter list.</p>
        </div>
        <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg text-xs shrink-0">
          <button type="button" id="ak-mode-omr" class="ak-mode-btn px-3 py-1 rounded-md font-semibold transition ${activeMode === 'omr' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'}">
            ● Digital OMR
          </button>
          <button type="button" id="ak-mode-image" class="ak-mode-btn px-3 py-1 rounded-md font-semibold transition ${activeMode === 'image' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'}">
            🖼 Image
          </button>
          <button type="button" id="ak-mode-letters" class="ak-mode-btn px-3 py-1 rounded-md font-semibold transition ${activeMode === 'letters' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'}">
            📝 Letter List
          </button>
        </div>
      </div>

      <!-- Mode Content Container -->
      <div id="ak-mode-content">
        ${renderModeContent(targetItems)}
      </div>

      <!-- Footer Actions -->
      <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
        <div class="text-[11px] text-gray-400">
          Filled: <span id="ak-filled-count" class="font-bold text-gray-700 dark:text-gray-300">${currentAnswers.filter(Boolean).length}</span> / ${targetItems}
        </div>
        <button type="button" id="btn-save-answer-key" class="px-4 py-2 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg shadow-xs transition flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Save Answer Key
        </button>
      </div>

      <!-- Version History -->
      ${renderVersionHistory(versionsList)}
    </div>
  `;

  attachModeListeners(containerEl, targetItems);
}

function renderModeContent(targetItems) {
  if (activeMode === 'omr') {
    return renderDigitalOmrGrid(targetItems);
  } else if (activeMode === 'image') {
    return `
      <div class="p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-center space-y-3 bg-gray-50/50 dark:bg-gray-800/30">
        <div class="mx-auto w-12 h-12 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-500 flex items-center justify-center">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        </div>
        <div>
          <p class="text-xs font-bold text-gray-800 dark:text-gray-200">Upload Answer Key Sheet Image</p>
          <p class="text-[11px] text-gray-400">Upload a scanned image of the teacher's key sheet to preview and auto-extract answers.</p>
        </div>
        <input type="file" id="ak-image-file" accept="image/*" class="hidden" />
        <button type="button" onclick="document.getElementById('ak-image-file').click()" class="px-4 py-2 text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 rounded-lg hover:bg-brand-100 transition">
          Choose Image File
        </button>
        <div id="ak-image-preview" class="mt-3 hidden max-h-48 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"></div>
      </div>
    `;
  } else {
    // Letter List Mode
    const listText = currentAnswers.map((ans, i) => `${i + 1}. ${ans || ''}`).join('\n');
    return `
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300">Enter Item Letters (one per line):</label>
        <textarea id="ak-letters-textarea" rows="8" class="w-full font-mono text-xs p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500" placeholder="1. A&#10;2. C&#10;3. B&#10;4. D...">${escapeHTML(listText)}</textarea>
      </div>
    `;
  }
}

function renderDigitalOmrGrid(targetItems) {
  const choices = ['A', 'B', 'C', 'D'];
  const columns = Math.ceil(targetItems / 10);
  
  let gridHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(columns, 5)} gap-4 max-h-96 overflow-y-auto pr-1">`;
  
  for (let c = 0; c < Math.ceil(targetItems / 10); c++) {
    gridHtml += `<div class="space-y-1.5 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/60">`;
    const startIdx = c * 10;
    const endIdx = Math.min(targetItems, (c + 1) * 10);
    
    for (let i = startIdx; i < endIdx; i++) {
      const selected = currentAnswers[i];
      gridHtml += `
        <div class="flex items-center justify-between text-xs py-0.5">
          <span class="font-bold text-gray-500 dark:text-gray-400 w-6 text-right">${i + 1}.</span>
          <div class="flex items-center gap-1.5">
            ${choices.map(ch => `
              <button type="button" data-item-idx="${i}" data-choice="${ch}" class="ak-bubble-btn w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 font-bold text-[10px] flex items-center justify-center transition ${
                selected === ch
                  ? 'bg-brand-500 text-white border-brand-500 shadow-xs'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-brand-50 dark:hover:bg-brand-900/30'
              }">${ch}</button>
            `).join('')}
          </div>
        </div>
      `;
    }
    gridHtml += `</div>`;
  }
  gridHtml += `</div>`;
  return gridHtml;
}

function renderVersionHistory(versionsList) {
  if (!versionsList || !versionsList.length) return '';
  return `
    <details class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
      <summary class="text-[10px] font-semibold text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
        Answer Key History (${versionsList.length} revision${versionsList.length !== 1 ? 's' : ''})
      </summary>
      <div class="mt-2 space-y-1.5">
        ${versionsList.slice(0, 5).map(v => `
          <div class="flex items-center gap-2 text-[10px] text-gray-400 pl-3 border-l-2 border-brand-300 dark:border-brand-700">
            <span class="font-bold text-gray-700 dark:text-gray-300">v${v.version}</span>
            <span class="flex-1 text-gray-600 dark:text-gray-400">${escapeHTML(v.changeReason || 'Updated answer key')}</span>
            <span class="text-gray-400">${new Date(v.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function attachModeListeners(containerEl, targetItems) {
  // Mode switcher tabs
  const omrBtn = containerEl.querySelector('#ak-mode-omr');
  const imgBtn = containerEl.querySelector('#ak-mode-image');
  const letBtn = containerEl.querySelector('#ak-mode-letters');

  omrBtn?.addEventListener('click', () => { activeMode = 'omr'; refreshContent(containerEl, targetItems); });
  imgBtn?.addEventListener('click', () => { activeMode = 'image'; refreshContent(containerEl, targetItems); });
  letBtn?.addEventListener('click', () => { activeMode = 'letters'; refreshContent(containerEl, targetItems); });

  // Bubble click handler for Digital OMR
  containerEl.querySelectorAll('.ak-bubble-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.itemIdx, 10);
      const choice = btn.dataset.choice;
      currentAnswers[idx] = currentAnswers[idx] === choice ? '' : choice;
      refreshContent(containerEl, targetItems);
    });
  });

  // Textarea input handler for Letter List
  const textarea = containerEl.querySelector('#ak-letters-textarea');
  if (textarea) {
    textarea.addEventListener('input', (e) => {
      const lines = e.target.value.split('\n');
      lines.forEach((line, i) => {
        if (i < targetItems) {
          const match = line.match(/^[0-9.]*\s*([A-Da-d])/);
          currentAnswers[i] = match ? match[1].toUpperCase() : '';
        }
      });
      const countEl = containerEl.querySelector('#ak-filled-count');
      if (countEl) countEl.textContent = currentAnswers.filter(Boolean).length;
    });
  }

  // Image upload handler
  const imgInput = containerEl.querySelector('#ak-image-file');
  if (imgInput) {
    imgInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const preview = containerEl.querySelector('#ak-image-preview');
      if (preview) {
        const url = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${url}" class="w-full object-contain max-h-48" />`;
        preview.classList.remove('hidden');
      }
    });
  }

  // Save Answer Key
  const saveBtn = containerEl.querySelector('#btn-save-answer-key');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!activeAssessmentId) return;
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        await AssessmentApi.upsertAnswerKey(activeAssessmentId, currentAnswers, `Updated via ${activeMode.toUpperCase()} mode`);
        await AssessmentStore.load(activeAssessmentId);
      } catch (err) {
        console.error('[SetupAnswerKey] Save error', err);
        alert('Failed to save answer key. Please try again.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Answer Key';
      }
    });
  }
}

function refreshContent(containerEl, targetItems) {
  const contentEl = containerEl.querySelector('#ak-mode-content');
  if (contentEl) contentEl.innerHTML = renderModeContent(targetItems);

  // Update fill count
  const countEl = containerEl.querySelector('#ak-filled-count');
  if (countEl) countEl.textContent = currentAnswers.filter(Boolean).length;

  // Re-attach bubble/textarea listeners
  attachModeListeners(containerEl, targetItems);
}
