export default function renderStudentList(payload) {
  const { title, subtitle, students = [] } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-student-list';

  if (title) {
    const h = document.createElement('div');
    h.className = 'ai-component-title';
    h.textContent = title;
    wrapper.appendChild(h);
  }

  if (subtitle) {
    const s = document.createElement('div');
    s.className = 'mb-3 text-sm text-gray-500 dark:text-gray-400';
    s.textContent = subtitle;
    wrapper.appendChild(s);
  }

  const list = document.createElement('div');
  list.className = 'space-y-2';
  students.forEach((student) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-3 rounded-xl border border-gray-200/70 bg-white/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/70';

    const left = document.createElement('div');
    left.className = 'min-w-0';
    const name = document.createElement('div');
    name.className = 'truncate text-sm font-semibold text-gray-900 dark:text-white/90';
    name.textContent = student.name || 'Student';
    left.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'truncate text-xs text-gray-500 dark:text-gray-400';
    meta.textContent = [student.section, student.strand, student.lrn].filter(Boolean).join(' • ');
    left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'text-right';
    const mps = document.createElement('div');
    mps.className = 'text-sm font-semibold text-brand-500';
    mps.textContent = student.mps != null ? `${student.mps}%` : '—';
    right.appendChild(mps);
    if (student.status) {
      const status = document.createElement('div');
      status.className = 'text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400';
      status.textContent = student.status;
      right.appendChild(status);
    }

    row.appendChild(left);
    row.appendChild(right);
    list.appendChild(row);
  });

  wrapper.appendChild(list);
  return wrapper;
}
