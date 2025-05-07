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

// Initialize chart
function initChart() {
  const ctx = document.getElementById('combinedChart').getContext('2d');
  chartConfig.combinedChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartConfig.labels,
      datasets: [
        {
          label: 'Temperatura (°C)',
          data: chartConfig.tempData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          tension: 0.1,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Caudal (L/min)',
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
  }
  
  if (data.flow !== undefined) {
    elements.flow.textContent = data.flow.toFixed(2);
  }
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
  const statusText = connected ? window.location.hostname : 'Disconnected';
  
  wifiIcon.className = connected ? 'fas fa-wifi' : 'fas fa-wifi-slash';
  wifiIcon.style.color = connected ? '#4bb543' : '#ec0b43';
  elements.ipAddress.textContent = statusText;
}

function exportToCSV() {
  let csvContent = "data:text/csv;charset=utf-8,";
  
  // Add headers
  csvContent += "Time,Temperature (°C),Flow (L/min)\n";
  
  // Add data rows
  for (let i = 0; i < chartConfig.tempData.length; i++) {
    csvContent += `${chartConfig.labels[i]},${chartConfig.tempData[i]},${chartConfig.flowData[i]}\n`;
  }
  
  // Create download link
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `sensor_data_${new Date().toISOString().slice(0,10)}.csv`);
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
});