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
  maxDataPoints: 600, // Show last 600 data points (1h if updates every second)
  tempChart: null,
  flowChart: null,
  tempData: [],
  flowData: [],
  labels: []
};

// Initialize charts
function initCharts() {
  // Temperature chart
  const tempCtx = document.getElementById('tempChart').getContext('2d');
  chartConfig.tempChart = new Chart(tempCtx, {
    type: 'line',
    data: {
      labels: chartConfig.labels,
      datasets: [{
        label: 'Temperatura (°C)',
        data: chartConfig.tempData,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.1)',
        tension: 0.1,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: config.temperature.min,
          max: config.temperature.max,
          ticks: {
            stepSize: 5
          }
        }
      },
      animation: {
        duration: 0 // disable animations for better performance
      }
    }
  });

  // Flow chart
  const flowCtx = document.getElementById('flowChart').getContext('2d');
  chartConfig.flowChart = new Chart(flowCtx, {
    type: 'line',
    data: {
      labels: chartConfig.labels,
      datasets: [{
        label: 'Caudal (L/min)',
        data: chartConfig.flowData,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        tension: 0.1,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: config.flow.min,
          max: config.flow.max,
          ticks: {
            stepSize: 5
          }
        }
      },
      animation: {
        duration: 0 // disable animations for better performance
      }
    }
  });
}

// Update charts with new data
function updateCharts(data) {
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
  
  // Update charts
  chartConfig.tempChart.data.labels = chartConfig.labels;
  chartConfig.tempChart.data.datasets[0].data = chartConfig.tempData;
  chartConfig.tempChart.update();
  
  chartConfig.flowChart.data.labels = chartConfig.labels;
  chartConfig.flowChart.data.datasets[0].data = chartConfig.flowData;
  chartConfig.flowChart.update();
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
    
    // Close the connection before attempting to reconnect
    eventSource.close();
    setTimeout(connectSSE, 3000);
  };

  eventSource.addEventListener('update', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateDashboard(data);
      updateCharts(data);
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

function exportToCSV(data, labels, filename) {
  let csvContent = "data:text/csv;charset=utf-8,";
  
  // Add headers
  csvContent += "Time,Value\n";
  
  // Add data rows
  for (let i = 0; i < data.length; i++) {
    csvContent += `${labels[i]},${data[i]}\n`;
  }
  
  // Create download link
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  
  // Trigger download
  link.click();
  document.body.removeChild(link);
}

function setupExportButtons() {
  document.getElementById('exportTempBtn').addEventListener('click', () => {
    exportToCSV(
      chartConfig.tempData,
      chartConfig.labels,
      `temperature_data_${new Date().toISOString().slice(0,10)}.csv`
    );
  });
  
  document.getElementById('exportFlowBtn').addEventListener('click', () => {
    exportToCSV(
      chartConfig.flowData,
      chartConfig.labels,
      `flow_data_${new Date().toISOString().slice(0,10)}.csv`
    );
  });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  connectSSE();
  setupExportButtons();
});