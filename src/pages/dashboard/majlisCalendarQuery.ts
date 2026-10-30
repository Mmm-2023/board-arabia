export function majlisCalendarOn(params: URLSearchParams) {
  return params.get('calendar') === '1'
}

export function majlisCalendarParams(params: URLSearchParams, on: boolean) {
  const next = new URLSearchParams(params)
  if (on) next.set('calendar', '1')
  else next.delete('calendar')
  return next
}
