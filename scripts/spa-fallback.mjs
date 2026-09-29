/**
 * GitHub Pages serves unknown paths as 404.html with status 404.
 * The bounce stores the deep link and loads /shell.html, which answers 200.
 * shell.html then restores the path before the app boots.
 * Known routes keep their own index.html and never see this bounce.
 */

export function pages404Html(shell, base = '/') {
  const normalized = base.endsWith('/') ? base : `${base}/`
  const target = `${normalized}shell.html`
  if (shell.includes('data-ba-spa-fallback')) return shell
  const bounce = `<script data-ba-spa-fallback="">
(function () {
  try {
    var path = location.pathname
    if (path === '/404.html' || path.slice(-9) === '/404.html') return
    sessionStorage.setItem('ba-spa-redirect', location.href)
  } catch (e) {
    return
  }
  location.replace(${JSON.stringify(target)})
})()
</script>`
  if (!shell.includes('<head>')) return shell
  return shell.replace('<head>', `<head>${bounce}`)
}
