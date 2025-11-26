document.getElementById('interface-name').textContent = 'ether1';

const ctx = document.getElementById('bandwidthChart').getContext('2d');
const MAX_DATA_POINTS = 30;
let isPaused = false;

const formatBits = (bits) => {
    const K = 1000;
    if (bits >= K * K) {
        return (bits / (K * K)).toFixed(2) + 'Mbps';
    } else if (bits >= K) {
        return (bits / K).toFixed(2) + 'Kbps';
    }
    return bits + 'bps';
};

const chartConfig = {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Download (Rx)',
                data: [],
                borderColor: 'gray',
                backgroundColor: 'gray',
                borderWidth: 2,
                tension: 0.1,
                pointRadius: 0
            },
            {
                label: 'Upload (Tx)',
                data: [],
                borderColor: 'black',
                backgroundColor: 'black',
                borderWidth: 2,
                tension: 0.1,
                pointRadius: 0
            }
        ]
    },
    options: {
        animation: false,
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Mbps'
                },
                ticks: {
                    callback: function (value, index, ticks) {
                        return formatBits(value);
                    }
                }
            },
            x: {
                ticks: {
                    display: false,
                },
                title: {
                    display: true,
                    text: 'Tempo'
                }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y != null) {
                            label += formatBits(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        }
    }
};

const bandwidthChart = new Chart(ctx, chartConfig);

const socket = io();

const toggleButton = document.getElementById('toggle-monitor');
toggleButton.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
        toggleButton.textContent = 'Retomar Monitoramento';
        toggleButton.style.backgroundColor = 'green';
        console.log('Monitoramento Pausado');
    } else {
        toggleButton.textContent = 'Pausar Monitoramento';
        toggleButton.style.backgroundColor = '';
        console.log('Monitoramento Retomado');
    }
});

socket.on('bandwidth_update', (data) => {

    if (isPaused) {
        return; 
    }

    document.getElementById('current-rx').textContent = formatBits(data.rx);
    document.getElementById('current-tx').textContent = formatBits(data.tx);

    const now = new Date();
    const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    document.getElementById('last-update-time').textContent = timeLabel;

    bandwidthChart.data.labels.push(timeLabel);
    bandwidthChart.data.datasets[0].data.push(data.rx);
    bandwidthChart.data.datasets[1].data.push(data.tx);

    if (bandwidthChart.data.labels.length > MAX_DATA_POINTS) {
        bandwidthChart.data.labels.shift();
        bandwidthChart.data.datasets[0].data.shift();
        bandwidthChart.data.datasets[1].data.shift();
    }

    bandwidthChart.update();
});