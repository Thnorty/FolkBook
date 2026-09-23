import type { SVGProps } from 'react'

/* Line icons from the design (screens 1e, 1f), drawn on a 16px grid. */

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export function TodayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <line x1="2" y1="6.6" x2="14" y2="6.6" />
    </Icon>
  )
}

export function PeopleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="11.4" cy="7" r="2" />
      <path d="M1.8 13.2c0-2.2 1.9-3.5 4.2-3.5s4.2 1.3 4.2 3.5" />
    </Icon>
  )
}

export function GraphIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="3.6" r="1.8" />
      <circle cx="3.4" cy="12" r="1.8" />
      <circle cx="12.6" cy="12" r="1.8" />
      <line x1="7" y1="5.2" x2="4.3" y2="10.3" />
      <line x1="9" y1="5.2" x2="11.7" y2="10.3" />
    </Icon>
  )
}
