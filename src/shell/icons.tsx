export function DestinationIcon({ id }: { id: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths(id)}
    </svg>
  )
}

function paths(id: string) {
  switch (id) {
    case 'directory':
    case 'people':
      return (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a3 3 0 0 1 0 5.75" />
        </>
      )
    case 'mandates':
    case 'applications':
      return (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </>
      )
    case 'network':
      return (
        <>
          <circle cx="6" cy="12" r="2.25" />
          <circle cx="18" cy="7" r="2.25" />
          <circle cx="18" cy="17" r="2.25" />
          <path d="M8.2 11.2 15.8 8.2" />
          <path d="M8.2 12.8 15.8 15.8" />
        </>
      )
    case 'profile':
      return (
        <>
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5 19.5a7 7 0 0 1 14 0" />
        </>
      )
    case 'capacity':
      return (
        <>
          <path d="M5 19V10" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
        </>
      )
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
        </>
      )
    default:
      return (
        <>
          <path d="M4 10.5 12 4l8 6.5" />
          <path d="M6.5 9.8V20h11V9.8" />
        </>
      )
  }
}
