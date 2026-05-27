const KEY = 'seedview_theme'

export function initTheme() {
  const btn   = document.getElementById('theme-toggle')
  const saved = localStorage.getItem(KEY) ?? 'dark'
  setTheme(saved)

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme')
    setTheme(current === 'dark' ? 'light' : 'dark')
  })
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙'
  localStorage.setItem(KEY, theme)
}
