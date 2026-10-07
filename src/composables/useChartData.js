import { computed } from 'vue'

/**
 * Composable for filtering and formatting projection data for charts
 */
export function useChartData(store) {
  /**
   * Computed property that returns filtered projections and corresponding labels
   */
  const filteredProjectionData = computed(() => {
    const currentDate = new Date()
    
    // Filter projections based on the criteria - only include weeks with actual data
    const filteredProjections = store.projections.filter(projection => {
      // Check if the projection has a valid actualGrowth value
      const hasActualGrowth =
        projection.hasOwnProperty('actualGrowth') &&
        projection.actualGrowth !== null &&
        projection.actualGrowth !== undefined
        
      // Determine if this is the current week
      const projectionDate = new Date(projection.date)
      const isCurrentWeek = 
        projectionDate.getFullYear() === currentDate.getFullYear() &&
        Math.floor((projectionDate - new Date(currentDate.getFullYear(), 0, 1)) / 604800000) ===
        Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 1)) / 604800000)
      
      // Include if it has actual growth data
      // Exclude current week with zero growth
      return hasActualGrowth && !(isCurrentWeek && projection.actualGrowth === 0)
    })
    
    // Generate labels for the filtered projections
    const labels = filteredProjections.map((p, index) => {
      try {
        const dateObj = new Date(p.date)
        return dateObj instanceof Date && !isNaN(dateObj) 
          ? dateObj.toLocaleDateString() 
          : `Week ${index + 1}`
      } catch {
        return `Week ${index + 1}`
      }
    })
    
    return {
      projections: filteredProjections,
      labels
    }
  })

  // Helper functions
  const getFilteredProjections = () => filteredProjectionData.value.projections
  const getLabels = () => filteredProjectionData.value.labels

  /**
   * Calculate rolling average with specified window size
   * @param {Array} data - Array of numerical values
   * @param {Number} windowSize - Number of values to include in rolling window
   * @returns {Array} - Array of rolling averages
   */
  const calculateRollingAverage = (data, windowSize = 3) => {
    if (!data || data.length === 0) return []
    
    return data.map((value, index) => {
      // For each point, look back (windowSize-1) points or fewer if not enough history
      const startIdx = Math.max(0, index - (windowSize - 1))
      const window = data.slice(startIdx, index + 1)
      
      // Filter out null/undefined values
      const validValues = window.filter(v => v !== null && v !== undefined)
      
      // Calculate average of valid values in the window
      return validValues.length > 0 
        ? validValues.reduce((sum, val) => sum + val, 0) / validValues.length 
        : 0
    })
  }

  /**
   * Calculate average for an array of numbers (simple average, not rolling)
   */
  const calculateAverage = (data) => {
    const validValues = data.filter(v => v !== null && v !== undefined)
    return validValues.length > 0 
      ? validValues.reduce((sum, val) => sum + val, 0) / validValues.length 
      : 0
  }

  /**
   * Get common chart options
   */
  const getChartOptions = (title, yAxisLabel, isPercentage = false) => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: isPercentage,
          title: {
            display: true,
            text: yAxisLabel
          }
        },
        x: {
          title: {
            display: true,
            text: 'Week'
          },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 10,
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: function(tooltipItems) {
              // Get the projection data for this point to access the week number
              const dataIndex = tooltipItems[0].dataIndex;
              const projections = filteredProjectionData.value.projections;
              
              if (projections && projections[dataIndex]) {
                const weekNum = projections[dataIndex].week;
                const dateRange = store.weekRange(weekNum, true); // Get formatted date range
                
                // Format as "Week X (date range)"
                return `Week ${weekNum} (${dateRange})`;
              }
              
              return tooltipItems[0].label;
            },
            label: function(context) {
              const value = context.raw;
              if (value === null) return 'No data';
              return isPercentage
                ? `${context.dataset.label}: ${value.toFixed(2)}%`
                : `${context.dataset.label}: $${value.toFixed(2)}`;
            }
          }
        },
        legend: {
          position: 'top'
        },
        title: {
          display: true,
          text: title
        }
      }
    };
  };

  return {
    filteredProjectionData,
    getFilteredProjections,
    getLabels,
    calculateAverage,
    calculateRollingAverage,
    getChartOptions
  }
}
