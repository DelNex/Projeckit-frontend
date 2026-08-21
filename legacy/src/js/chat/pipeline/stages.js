// Progressive stage tracker shown inside the pending AI bubble.
// These labels describe the real pipeline stages ran by the backend;
// the actual plan/tools/durations replace them when the response arrives.

export const PIPELINE_STAGES = [
  { label: 'Planning…', detail: 'Selecting the safest academic tools' },
  { label: 'Tool execution…', detail: 'Running the selected academic tool' },
  { label: 'Data retrieval…', detail: 'Querying the academic database' },
  { label: 'Reasoning…', detail: 'Preparing the result and answer' },
  { label: 'Completed', detail: 'Done' },
];

export function renderStageTracker() {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-pipeline-loading';

  const row = document.createElement('div');
  row.className = 'ai-pipeline-loading-row';

  const spinner = document.createElement('div');
  spinner.className = 'h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500';
  row.appendChild(spinner);

  const textBox = document.createElement('div');
  textBox.className = 'flex-1 min-w-0';

  const label = document.createElement('div');
  label.className = 'ai-pipeline-loading-label';
  label.textContent = PIPELINE_STAGES[0].label;

  const detail = document.createElement('div');
  detail.className = 'ai-pipeline-loading-detail';
  detail.textContent = PIPELINE_STAGES[0].detail;

  textBox.appendChild(label);
  textBox.appendChild(detail);
  row.appendChild(textBox);
  wrapper.appendChild(row);

  const nodes = [];
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const chip = document.createElement('span');
    chip.className = 'ai-stage-chip';
    chip.textContent = PIPELINE_STAGES[i].label.replace('…', '');
    nodes.push(chip);
    wrapper.appendChild(chip);
  }

  const start = Date.now();
  const FULL = 4200; // total animation window for the staged labels

  const setStage = (index) => {
    const clamped = Math.max(0, Math.min(PIPELINE_STAGES.length - 1, index));
    label.textContent = PIPELINE_STAGES[clamped].label;
    detail.textContent = PIPELINE_STAGES[clamped].detail;
    nodes.forEach((n, i) => {
      if (i < clamped) n.classList.add('is-done');
      else if (i === clamped) n.classList.add('is-active');
      else n.classList.remove('is-active', 'is-done');
    });
    return clamped;
  };

  const tick = () => {
    const elapsed = Date.now() - start;
    const index = Math.min(
      Math.floor((elapsed / FULL) * (PIPELINE_STAGES.length - 2)),
      PIPELINE_STAGES.length - 2,
    );
    setStage(index);
  };

  const interval = window.setInterval(tick, 350);
  const stop = (completed) => {
    window.clearInterval(interval);
    if (completed) {
      setStage(PIPELINE_STAGES.length - 1);
      spinner.classList.remove('animate-spin', 'border-t-brand-500');
      spinner.classList.add('ai-spinner-done');
    }
  };
  tick();

  return { node: wrapper, stop };
}

export default { PIPELINE_STAGES, renderStageTracker };