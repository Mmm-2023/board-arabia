export function DestinationIcon({ id, className = 'h-5 w-5 shrink-0' }: { id: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
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
    case 'review':
      return (
        <>
          <rect x="6" y="3.5" width="12" height="17" rx="1.5" />
          <path d="M9 3.5h6V6H9z" />
          <path d="M9 12.2 11 14l4-4" />
        </>
      )
    case 'real-estate':
      return (
        <>
          <path d="M3 20h18" />
          <path d="M5 20V10l7-5 7 5v10" />
          <path d="M10 20v-4h4v4" />
          <path d="M9 12h2M13 12h2M9 15h2M13 15h2" />
        </>
      )
    case 'deals':
      return (
        <>
          <path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8z" />
          <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M4 12h16" />
        </>
      )
    case 'majlis':
      return (
        <>
          <path d="M6 10h12" />
          <path d="M7 10v7" />
          <path d="M17 10v7" />
          <path d="M5 17h14" />
          <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
        </>
      )
    case 'ai':
      return (
        <>
          <path d="M12 3.5 13.1 7 16.5 8 13.1 9 12 12.5 10.9 9 7.5 8 10.9 7 12 3.5z" />
          <path d="M17.5 14.5 18.1 16.2 19.8 16.8 18.1 17.4 17.5 19.1 16.9 17.4 15.2 16.8 16.9 16.2 17.5 14.5z" />
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
