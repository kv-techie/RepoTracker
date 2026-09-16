/**
 * Line icons for the interface, drawn on a 24px grid and inheriting currentColor.
 * One stroke weight and one corner style everywhere, so the UI reads as one set.
 */

export type IconName =
  | 'grid'
  | 'activity'
  | 'clock'
  | 'arrow-up'
  | 'drive'
  | 'alert'
  | 'globe'
  | 'circle-slash'
  | 'more'
  | 'external'
  | 'check'
  | 'chevron-down'
  | 'refresh'
  | 'download'
  | 'folder'
  | 'sliders'
  | 'lock'
  | 'cpu'
  | 'flame'
  | 'trophy'
  | 'moon'
  | 'calendar'
  | 'sun'
  | 'search'
  | 'plus'
  | 'trash';

const PATHS: Record<IconName, JSX.Element> = {
  'grid': <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  'activity': <polyline points="3 12 8 12 11 5 14 19 16 12 21 12" />,
  'clock': <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>,
  'arrow-up': <><line x1="12" y1="20" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" /></>,
  'drive': <><rect x="3" y="5" width="18" height="14" rx="2" /><line x1="3" y1="13" x2="21" y2="13" /><line x1="7.5" y1="16.5" x2="9" y2="16.5" /></>,
  'alert': <><path d="M12 4.5 21 19.5H3z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="16.8" x2="12" y2="16.9" /></>,
  'globe': <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><line x1="3.2" y1="9.5" x2="20.8" y2="9.5" /><line x1="3.2" y1="14.5" x2="20.8" y2="14.5" /></>,
  'circle-slash': <><circle cx="12" cy="12" r="9" /><line x1="6" y1="18" x2="18" y2="6" /></>,
  'more': <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  'external': <><path d="M14 4h6v6" /><line x1="20" y1="4" x2="11" y2="13" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  'check': <polyline points="4 12.5 9.5 18 20 6" />,
  'chevron-down': <polyline points="6 9.5 12 15.5 18 9.5" />,
  'refresh': <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><polyline points="20 4 20 9 15 9" /></>,
  'download': <><line x1="12" y1="4" x2="12" y2="15" /><polyline points="7 10.5 12 15.5 17 10.5" /><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1" /></>,
  'folder': <path d="M3 7a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  'sliders': <><line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="9" cy="8" r="2.2" /><circle cx="16" cy="16" r="2.2" /></>,
  'lock': <><rect x="4.5" y="10.5" width="15" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  'cpu': <><rect x="7" y="7" width="10" height="10" rx="2" /><rect x="3.5" y="3.5" width="17" height="17" rx="3" /></>,
  'flame': <path d="M12 3.5c3.2 3 5 5.4 5 8.4a5 5 0 0 1-10 0c0-1.5.7-2.8 1.8-4 .2 1.3.9 2 1.8 2 .8 0 1.4-.7 1.4-2.1 0-1.4-.4-2.7-1-4.3z" />,
  'trophy': <><path d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0z" /><path d="M7.5 6H5a2.5 2.5 0 0 0 2.5 2.5" /><path d="M16.5 6H19a2.5 2.5 0 0 1-2.5 2.5" /><line x1="12" y1="14" x2="12" y2="17" /><line x1="8.5" y1="19.5" x2="15.5" y2="19.5" /></>,
  'moon': <path d="M20 13.5A8.2 8.2 0 0 1 10.5 4 8.5 8.5 0 1 0 20 13.5z" />,
  'calendar': <><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><line x1="3.5" y1="10" x2="20.5" y2="10" /><line x1="8" y1="3.5" x2="8" y2="7" /><line x1="16" y1="3.5" x2="16" y2="7" /></>,
  'sun': <><circle cx="12" cy="12" r="4" /><line x1="12" y1="2.5" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="21.5" /><line x1="2.5" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="21.5" y2="12" /><line x1="5.6" y1="5.6" x2="7.3" y2="7.3" /><line x1="16.7" y1="16.7" x2="18.4" y2="18.4" /><line x1="5.6" y1="18.4" x2="7.3" y2="16.7" /><line x1="16.7" y1="7.3" x2="18.4" y2="5.6" /></>,
  'search': <><circle cx="11" cy="11" r="6.5" /><line x1="15.8" y1="15.8" x2="20.5" y2="20.5" /></>,
  'plus': <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  'trash': <><polyline points="4.5 7 19.5 7" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6.5 7 7.5 19a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1L17.5 7" /></>,
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  /** Decorative by default; pass a label when the icon is the only content. */
  label?: string;
}

export default function Icon({ name, size = 16, className, label }: Props) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
