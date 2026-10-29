const PATHS = {
  save: <path d="M3 2h8l2 2v10H3zM5 2v4h5V2M5 14v-4h6v4" />,
  download: <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />,
  desktop: (
    <>
      <rect x="2" y="3" width="14" height="9.5" rx="1.5" />
      <path d="M6.5 15.5h5M9 12.5v3" />
    </>
  ),
  tablet: (
    <>
      <rect x="3.5" y="2.5" width="11" height="13" rx="1.6" />
      <path d="M8 13.5h2" />
    </>
  ),
  pick: <path d="M4 3l9.5 4-4 1.5L8 12.5zM9.5 8.5l4.5 4.5" />,
  phone: (
    <>
      <rect x="5" y="2" width="8" height="14" rx="2" />
      <path d="M8 13.5h2" />
    </>
  ),
  custom: (
    <>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.5" strokeDasharray="2 2" />
      <path d="M6 9h6M9 6v6" />
    </>
  ),
  top: <path d="M3.5 3h11M9 15.5V6.5M5.5 10 9 6.5l3.5 3.5" />,
  pause: <path d="M6.5 4.5v9M11.5 4.5v9" />,
  play: <path d="M6 4.2v9.6l7.5-4.8z" />,
  restore: <path d="M4 9a5 5 0 1 0 1.6-3.7M4 3.5v3h3" />,
  plus: <path d="M9 4v10M4 9h10" />,
  copy: (
    <>
      <rect x="6" y="6" width="9" height="9" rx="1.5" />
      <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12" />
    </>
  ),
  trash: <path d="M3.5 5h11M7 5V3.5h4V5M5 5l.8 9.5h6.4L13 5" />,
  pencil: <path d="M11.5 3.5l3 3L7 14H4v-3z" />,
  link: <path d="M7.5 10.5l3-3M6 8.5 4.5 10a2.5 2.5 0 0 0 3.5 3.5L9.5 12M12 9.5 13.5 8A2.5 2.5 0 0 0 10 4.5L8.5 6" />,
  left: <path d="M3 3.5h12v11H3zM7 3.5v11" />,
  right: <path d="M3 3.5h12v11H3zM11 3.5v11" />,
  phoneLink: (
    <>
      <rect x="5" y="2" width="8" height="14" rx="2" />
      <path d="M8 13.5h2M7.5 6.5a2 2 0 0 1 3 0M6.5 5a3.6 3.6 0 0 1 5 0" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="tb-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
