// The app's views, in sidebar order, with their titles and icons.
import type { ComponentType } from 'react';
import { Activity, CalendarRange, Cpu, LifeBuoy, ListChecks, Package } from 'lucide-react';

export type View = 'launches' | 'timeline' | 'supply' | 'software' | 'recovery' | 'activity';

export const VIEWS: Record<View, { title: string; icon: ComponentType<{ size?: number }> }> = {
  launches: { title: 'Launches', icon: ListChecks },
  timeline: { title: 'Timeline', icon: CalendarRange },
  recovery: { title: 'Recovery', icon: LifeBuoy },
  supply: { title: 'Supply', icon: Package },
  software: { title: 'Software', icon: Cpu },
  activity: { title: 'Activity', icon: Activity },
};
