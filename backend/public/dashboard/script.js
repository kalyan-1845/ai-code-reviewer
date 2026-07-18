document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/roi');
        const data = await response.json();
        
        // Update hero metrics
        document.getElementById('total-prs').textContent = data.aggregated.totalPrsReviewed;
        document.getElementById('total-comments').textContent = data.aggregated.totalAiComments;
        document.getElementById('acceptance-rate').textContent = `${data.aggregated.acceptanceRate}%`;
        document.getElementById('time-saved').innerHTML = `${data.aggregated.timeSavedHours} <span class="unit">hours</span>`;

        // Render chart
        renderChart(data.metrics);
    } catch (error) {
        console.error('Failed to fetch ROI metrics:', error);
    }
});

function renderChart(metrics) {
    const ctx = document.getElementById('roiChart').getContext('2d');
    
    // Sort and limit to top 10 repos by time saved
    const sortedMetrics = metrics
        .sort((a, b) => b.timeSavedMinutes - a.timeSavedMinutes)
        .slice(0, 10);

    const labels = sortedMetrics.map(m => m.repoName.split('/').pop());
    const data = sortedMetrics.map(m => (m.timeSavedMinutes / 60).toFixed(1));

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Hours Saved by Repository',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#f8fafc'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}
