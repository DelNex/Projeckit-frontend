/**
 * Mobile OMR Camera Scanner Engine
 * Real-time camera preview with alignment guidance overlay, corner detection feedback,
 * and responsive fallbacks for mobile scanning.
 */

import { preprocessOmrImage } from './omr-preprocessor.js';

export class OmrCameraScanner {
  constructor(options = {}) {
    this.containerEl = options.containerEl;
    this.onCapture = options.onCapture;
    this.onError = options.onError;
    this.stream = null;
    this.videoEl = null;
    this.overlayEl = null;
    this.animFrameId = null;
    this.isScanning = false;
  }

  async start() {
    try {
      this.isScanning = true;
      this.containerEl.innerHTML = `
        <div class="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl flex flex-col items-center justify-center min-h-[360px]">
          <video id="omr-camera-video" autoplay playsinline muted class="w-full h-full object-cover"></video>
          
          <!-- Alignment Overlay Frame -->
          <div id="omr-camera-overlay" class="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between border-4 border-dashed border-white/30 rounded-2xl transition-colors duration-300">
            <!-- Corner Registration Alignment Indicators -->
            <div class="flex justify-between">
              <div class="w-10 h-10 border-t-4 border-l-4 border-brand-500 rounded-tl-lg"></div>
              <div class="w-10 h-10 border-t-4 border-r-4 border-brand-500 rounded-tr-lg"></div>
            </div>
            
            <!-- Real-time Status Badge -->
            <div class="self-center bg-black/75 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-white text-xs font-bold shadow-lg flex items-center gap-2">
              <span id="omr-status-indicator" class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span id="omr-status-text">Aligning OMR Sheet…</span>
            </div>

            <div class="flex justify-between">
              <div class="w-10 h-10 border-b-4 border-l-4 border-brand-500 rounded-bl-lg"></div>
              <div class="w-10 h-10 border-b-4 border-r-4 border-brand-500 rounded-br-lg"></div>
            </div>
          </div>

          <!-- Controls Bar -->
          <div class="absolute bottom-4 left-0 right-0 px-6 flex items-center justify-between gap-4 pointer-events-auto">
            <label class="px-3.5 py-2 text-xs font-semibold text-white bg-white/10 backdrop-blur-md rounded-xl hover:bg-white/20 transition cursor-pointer flex items-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              Upload Photo
              <input type="file" id="omr-camera-fallback-input" accept="image/*" class="hidden" />
            </label>

            <button id="btn-omr-capture" class="w-14 h-14 rounded-full bg-brand-500 text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition">
              <div class="w-10 h-10 rounded-full border-2 border-white"></div>
            </button>

            <button id="btn-omr-stop" class="px-3.5 py-2 text-xs font-semibold text-white bg-red-500/80 backdrop-blur-md rounded-xl hover:bg-red-600 transition">
              Close
            </button>
          </div>
        </div>
      `;

      this.videoEl = this.containerEl.querySelector('#omr-camera-video');
      this.overlayEl = this.containerEl.querySelector('#omr-camera-overlay');

      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.videoEl) {
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();
      }

      this.attachEvents();
      this.startRealtimeAnalysisLoop();
    } catch (err) {
      console.error('[OMR Camera] Camera access error', err);
      if (this.onError) this.onError(err);
      this.renderFallbackView();
    }
  }

  attachEvents() {
    const captureBtn = this.containerEl.querySelector('#btn-omr-capture');
    const stopBtn = this.containerEl.querySelector('#btn-omr-stop');
    const fallbackInput = this.containerEl.querySelector('#omr-camera-fallback-input');

    captureBtn?.addEventListener('click', () => this.captureNow());
    stopBtn?.addEventListener('click', () => this.stop());

    fallbackInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const img = new Image();
        img.onload = () => {
          const processed = preprocessOmrImage(img);
          if (this.onCapture) this.onCapture(processed);
          this.stop();
        };
        img.src = URL.createObjectURL(file);
      }
    });
  }

  startRealtimeAnalysisLoop() {
    const analyze = () => {
      if (!this.isScanning || !this.videoEl || this.videoEl.readyState < 2) {
        this.animFrameId = requestAnimationFrame(analyze);
        return;
      }

      const processed = preprocessOmrImage(this.videoEl);
      const statusTextEl = this.containerEl.querySelector('#omr-status-text');
      const statusDotEl = this.containerEl.querySelector('#omr-status-indicator');

      if (processed.markersDetected && processed.isLightingAcceptable) {
        if (statusTextEl) statusTextEl.textContent = '✓ Alignment Good — Ready to Capture';
        if (statusDotEl) statusDotEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
        if (this.overlayEl) this.overlayEl.className = this.overlayEl.className.replace('border-white/30', 'border-emerald-400');
      } else if (!processed.isLightingAcceptable) {
        if (statusTextEl) statusTextEl.textContent = '⚠ Low Lighting — Adjust Room Light';
        if (statusDotEl) statusDotEl.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
      } else {
        if (statusTextEl) statusTextEl.textContent = `Align 4 Corners (${processed.cornerCount}/4 detected)`;
        if (statusDotEl) statusDotEl.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
      }

      this.animFrameId = requestAnimationFrame(analyze);
    };

    this.animFrameId = requestAnimationFrame(analyze);
  }

  captureNow() {
    if (!this.videoEl) return;
    const processed = preprocessOmrImage(this.videoEl);
    if (this.onCapture) this.onCapture(processed);
    this.stop();
  }

  stop() {
    this.isScanning = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.containerEl.innerHTML = '';
  }

  renderFallbackView() {
    this.containerEl.innerHTML = `
      <div class="p-6 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-center space-y-3">
        <svg class="w-10 h-10 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        <p class="text-xs font-semibold text-gray-700 dark:text-gray-300">Camera Unavailable</p>
        <p class="text-[11px] text-gray-400">Unable to access live camera stream. Please choose an OMR sheet image file instead.</p>
        <label class="px-4 py-2 text-xs font-semibold text-white bg-brand-500 rounded-xl hover:bg-brand-600 shadow-sm inline-block cursor-pointer transition">
          Select Image File
          <input type="file" id="fallback-file-picker" accept="image/*" class="hidden" />
        </label>
      </div>
    `;

    const fileInput = this.containerEl.querySelector('#fallback-file-picker');
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const img = new Image();
        img.onload = () => {
          const processed = preprocessOmrImage(img);
          if (this.onCapture) this.onCapture(processed);
        };
        img.src = URL.createObjectURL(file);
      }
    });
  }
}
