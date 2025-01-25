import * as bootstrap from 'bootstrap'

export const initializeBootstrap = () => {
  console.log('Initializing Bootstrap components...')
  
  // Initialize dropdowns
  const dropdowns = document.querySelectorAll('.dropdown-toggle')
  dropdowns.forEach(el => {
    const dropdownMenu = el.parentElement.querySelector('.dropdown-menu')
    const dropdown = new bootstrap.Dropdown(el)
    
    el.addEventListener('show.bs.dropdown', (event) => {
      // Force visibility
      dropdownMenu.style.cssText = `
        display: block !important;
        position: absolute !important;
        z-index: 1060 !important;
        margin: 0 !important;
        top: ${el.offsetHeight}px !important;
      `
      
      // Add required classes
      dropdownMenu.classList.add('show')
      dropdownMenu.classList.add('d-block')
    })
  })
  
  // Initialize tooltips
  const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]')
  tooltips.forEach(el => {
    new bootstrap.Tooltip(el)
  })
  
  return { bootstrap }
}