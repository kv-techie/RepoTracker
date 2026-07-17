export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export function getLanguageColor(language: string): string {
  const colors: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    Java: '#b07219',
    'C#': '#239120',
    Go: '#00ADD8',
    Rust: '#ce422b',
    'C++': '#f34b7d',
    HTML: '#e34c26',
    CSS: '#563d7c',
    default: '#858585',
  };
  return colors[language] || colors.default;
}

export function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter((c): c is string => typeof c === 'string').join(' ');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
