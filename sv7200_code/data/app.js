// Configuration
const config = {
  temperature: {
    min: 0,
    max: 100,
    warningThreshold: 85,
    dangerThreshold: 90
  },
  flow: {
    min: 0,
    max: 100
  }
};

// Chart configuration
const chartConfig = {
  maxDataPoints: 600,
  combinedChart: null,
  tempData: [],
  flowData: [],
  labels: []
};

// Language configuration
const i18n = {
  en: {
    title: "SV7200 Interface",
    connecting: "Connecting...",
    temperature: "Temperature",
    flow: "Flow",
    flow_unit: "L/min",
    mean: "Mean",
    chart_title: "Temperature & Flow",
    export_data: "Export Data",
    connected: "Connected",
    disconnected: "Disconnected"
  },
  pt: {
    title: "Interface SV7200",
    connecting: "A conectar...",
    temperature: "Temperatura",
    flow: "Caudal",
    flow_unit: "L/min",
    mean: "Média",
    chart_title: "Temperatura e Caudal",
    export_data: "Exportar Dados",
    connected: "Conectado",
    disconnected: "Desconectado"
  }
};

let currentLanguage = 'en';

function updateContentLanguage() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (i18n[currentLanguage][key]) {
      element.textContent = i18n[currentLanguage][key];
    }
  });

  // Update chart axes labels if chart exists
  if (chartConfig.combinedChart) {
    chartConfig.combinedChart.options.scales.y.title.text = currentLanguage === 'en' ? 'Temperature (°C)' : 'Temperatura (°C)';
    chartConfig.combinedChart.options.scales.y1.title.text = currentLanguage === 'en' ? 'Flow (L/min)' : 'Caudal (L/min)';
    chartConfig.combinedChart.update();
  }
}

function setupLanguageSwitcher() {
	currentLanguage = localStorage.getItem('language') || 'en';
  document.getElementById('lang-en').addEventListener('click', () => {
    currentLanguage = 'en';
    document.getElementById('lang-en').classList.add('active');
    document.getElementById('lang-pt').classList.remove('active');
	localStorage.setItem('language', currentLanguage);
    updateContentLanguage();
  });

  document.getElementById('lang-pt').addEventListener('click', () => {
    currentLanguage = 'pt';
    document.getElementById('lang-pt').classList.add('active');
    document.getElementById('lang-en').classList.remove('active');
	localStorage.setItem('language', currentLanguage);
    updateContentLanguage();
  });
}

// Initialize chart
function initChart() {
  const ctx = document.getElementById('combinedChart').getContext('2d');
  chartConfig.combinedChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartConfig.labels,
      datasets: [
        {
          label: currentLanguage === 'en' ? 'Temperature (°C)' : 'Temperatura (°C)',
          data: chartConfig.tempData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          tension: 0.1,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: currentLanguage === 'en' ? 'Flow (L/min)' : 'Caudal (L/min)',
          data: chartConfig.flowData,
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          tension: 0.1,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Temperatura (°C)'
          },
          min: config.temperature.min,
          max: config.temperature.max,
          ticks: {
            stepSize: 5
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Caudal (L/min)'
          },
          min: config.flow.min,
          max: config.flow.max,
          ticks: {
            stepSize: 5
          },
          // This ensures the grid lines don't appear for the right axis
          grid: {
            drawOnChartArea: false,
          }
        }
      },
      animation: {
        duration: 0
      }
    }
  });
}

// Update chart with new data
function updateChart(data) {
  const now = new Date();
  const timeLabel = now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
  
  // Add new data
  chartConfig.tempData.push(data.temperature);
  chartConfig.flowData.push(data.flow);
  chartConfig.labels.push(timeLabel);
  
  // Remove old data if we exceed max data points
  if (chartConfig.tempData.length > chartConfig.maxDataPoints) {
    chartConfig.tempData.shift();
    chartConfig.flowData.shift();
    chartConfig.labels.shift();
  }
  
  // Update chart
  chartConfig.combinedChart.data.labels = chartConfig.labels;
  chartConfig.combinedChart.data.datasets[0].data = chartConfig.tempData;
  chartConfig.combinedChart.data.datasets[1].data = chartConfig.flowData;
  chartConfig.combinedChart.update();
}

// DOM Elements
const elements = {
  temperature: document.getElementById('temperature'),
  flow: document.getElementById('flow'),
  wifiStatus: document.getElementById('wifiStatus'),
  ipAddress: document.getElementById('ipAddress')
};

let eventSource;
let isConnected = false;

function connectSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource('/events');
  
  eventSource.onopen = () => {
    console.log('SSE connection opened');
    isConnected = true;
    updateConnectionStatus(true);
  };

  eventSource.onerror = (e) => {
    console.log('SSE error:', e);
    isConnected = false;
    updateConnectionStatus(false);
    
    eventSource.close();
    setTimeout(connectSSE, 3000);
  };

  eventSource.addEventListener('update', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateDashboard(data);
      updateChart(data);
    } catch (err) {
      console.error('Error parsing SSE data:', err);
    }
  });
}

function updateDashboard(data) {
  if (data.temperature !== undefined) {
    elements.temperature.textContent = data.temperature.toFixed(2);
    updateTemperatureColor(data.temperature);
    updateTemperatureStats(data.temperature);
  }
  
  if (data.flow !== undefined) {
    elements.flow.textContent = data.flow.toFixed(2);
    updateFlowStats(data.flow);
  }
}

function updateTemperatureStats(currentTemp) {
  // Calculate mean
  chartConfig.tempData.push(currentTemp);
  const sum = chartConfig.tempData.reduce((a, b) => a + b, 0);
  const mean = sum / chartConfig.tempData.length;
  document.getElementById('tempMean').textContent = mean.toFixed(2);
  
  // Calculate difference (current - mean)
  const diff = currentTemp - mean;
  const diffElement = document.getElementById('tempDiff');
  diffElement.textContent = Math.abs(diff).toFixed(2);
  
  // Color code the difference
  diffElement.style.color = diff >= 0 ? 'var(--danger)' : 'var(--success)';
}

function updateFlowStats(currentFlow) {
  // Calculate mean
  chartConfig.flowData.push(currentFlow);
  const sum = chartConfig.flowData.reduce((a, b) => a + b, 0);
  const mean = sum / chartConfig.flowData.length;
  document.getElementById('flowMean').textContent = mean.toFixed(2);
  
  // Calculate difference (current - mean)
  const diff = currentFlow - mean;
  const diffElement = document.getElementById('flowDiff');
  diffElement.textContent = Math.abs(diff).toFixed(2);
  
  // Color code the difference
  diffElement.style.color = diff >= 0 ? 'var(--danger)' : 'var(--success)';
}

function updateTemperatureColor(temp) {
  if (temp >= config.temperature.dangerThreshold) {
    elements.temperature.style.color = 'var(--danger)';
  } else if (temp >= config.temperature.warningThreshold) {
    elements.temperature.style.color = 'var(--warning)';
  } else {
    elements.temperature.style.color = 'var(--secondary)';
  }
}

function updateConnectionStatus(connected) {
  const wifiIcon = elements.wifiStatus.querySelector('i');
  const statusText = connected ? window.location.hostname : i18n[currentLanguage]['disconnected'];
  
  wifiIcon.className = connected ? 'fas fa-wifi' : 'fas fa-wifi-slash';
  wifiIcon.style.color = connected ? '#4bb543' : '#ec0b43';
  elements.ipAddress.textContent = statusText;
  elements.ipAddress.setAttribute('data-i18n', connected ? 'connected' : 'disconnected');
}

function exportToCSV() {
  let csvContent = "data:text/csv;charset=utf-8,";
  
  // Add headers
  csvContent += "Time,Temperature (°C),Temp Mean,Temp Difference,Flow (L/min),Flow Mean,Flow Difference\n";
  
  // Calculate means for each data point
  const tempMeans = [];
  const tempDiffs = [];
  const flowMeans = [];
  const flowDiffs = [];
  
  for (let i = 0; i < chartConfig.tempData.length; i++) {
    const tempMean = chartConfig.tempData.slice(0, i+1).reduce((a, b) => a + b, 0) / (i+1);
    const tempDiff = chartConfig.tempData[i] - tempMean;
    tempMeans.push(tempMean);
    tempDiffs.push(tempDiff);
    
    const flowMean = chartConfig.flowData.slice(0, i+1).reduce((a, b) => a + b, 0) / (i+1);
    const flowDiff = chartConfig.flowData[i] - flowMean;
    flowMeans.push(flowMean);
    flowDiffs.push(flowDiff);
  }
  
  // Add data rows
  for (let i = 0; i < chartConfig.tempData.length; i++) {
    csvContent += `${chartConfig.labels[i]},${chartConfig.tempData[i]},${tempMeans[i].toFixed(2)},${tempDiffs[i].toFixed(2)},${chartConfig.flowData[i]},${flowMeans[i].toFixed(2)},${flowDiffs[i].toFixed(2)}\n`;
  }
  
  // Create download link
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `sensor_stats_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  
  // Trigger download
  link.click();
  document.body.removeChild(link);
}

function setupExportButton() {
  document.getElementById('exportDataBtn').addEventListener('click', exportToCSV);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  connectSSE();
  setupExportButton();
  setupLanguageSwitcher(); // Add this line
  updateContentLanguage();
});