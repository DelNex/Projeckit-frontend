import ApexCharts from 'apexcharts';

export default function renderChart(payload) {
  const { title, chartType = 'bar', labels = [], series = [], options = {} } = payload || {};
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-component ai-chart overflow-hidden rounded-2xl border border-gray-200/70 bg-white/80 p-3 dark:border-gray-800 dark:bg-gray-900/70';

  if (title) {
    const h = document.createElement('div');
    h.className = 'ai-component-title';
    h.textContent = title;
    wrapper.appendChild(h);
  }

  const container = document.createElement('div');
  container.className = 'ai-chart-host h-72 w-full rounded-xl';
  wrapper.appendChild(container);

  window.setTimeout(() => {
    try {
      const normalizedSeries = Array.isArray(series) ? series : [];
      const chartOptions = {
        chart: { type: chartType, height: 280, toolbar: { show: false } },
        series: normalizedSeries,
        labels,
        xaxis: { categories: labels },
        legend: { position: 'bottom' },
        colors: ['#465fff', '#12b76a', '#f79009', '#7a5af8'],
        tooltip: { theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth' },
        ...options,
      };
      const chart = new ApexCharts(container, chartOptions);
      chart.render();
    } catch (error) {
      container.innerHTML = '<div class="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">Chart unavailable</div>';
      console.error('ApexCharts render failed', error);
    }
  }, 0);

  return wrapper;
}
