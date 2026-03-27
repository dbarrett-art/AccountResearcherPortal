import { useEffect } from 'react';

export default function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — M4S Research` : 'M4S Research';
  }, [title]);
}
