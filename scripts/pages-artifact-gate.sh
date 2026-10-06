test -f dist/.nojekyll
test -f dist/404.html
grep -q 'data-ba-spa-fallback' dist/404.html
grep -q 'location.replace' dist/404.html
grep -q 'ba-spa-redirect' dist/shell.html
if grep -q 'location.replace' dist/shell.html; then
  echo 'spa bounce leaked into the app shell'
  exit 1
fi
test -f dist/CNAME
grep -qx 'boardarabia.com' dist/CNAME
test -f dist/for-members/index.html
test -f dist/dashboard/index.html
test -f dist/dashboard/profile/index.html
test -f dist/dashboard/majlis/index.html
test -f dist/dashboard/due-diligence/index.html
test -f dist/dashboard/rooms/index.html
test -f dist/auth/confirm/index.html
test -f dist/auth/reset/index.html
test -f dist/robots.txt
grep -Eq '(src|href)="/assets/' dist/index.html
if grep -q '/board-arabia/' dist/index.html; then
  echo 'project subpath leaked into Pages index'
  exit 1
fi
grep -q 'noindex' dist/dashboard/index.html
grep -q 'Board Arabia' dist/for-members/index.html
if grep -R -E -i -q 'calendar\.app\.google' dist; then
  echo 'banned string in Pages artifact'
  exit 1
fi
node scripts/check-pages-artifact.mjs dist
