export function buildUtmLink(input: {
  path: string
  source: string
  medium: string
  campaign: string
  content: string
}) {
  const path = input.path.trim().startsWith('/') ? input.path.trim() : '/apply'
  const url = new URL(path, 'https://boardarabia.com')
  const source = slug(input.source)
  const medium = slug(input.medium)
  const campaign = slug(input.campaign)
  if (source) url.searchParams.set('utm_source', source)
  if (medium) url.searchParams.set('utm_medium', medium)
  if (campaign) url.searchParams.set('utm_campaign', campaign)
  const content = slug(input.content)
  if (content) url.searchParams.set('utm_content', content)
  return url.toString()
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
