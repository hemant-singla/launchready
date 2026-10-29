// The app's views, in sidebar order, with their titles and icons.
import type { ComponentType } from 'react';
import { Activity, Bug, CalendarRange, Cpu, Database, FlaskConical, LifeBuoy, ListChecks, Package } from 'lucide-react';

export type View = 'launches' | 'timeline' | 'supply' | 'software' | 'issues' | 'testlab' | 'recovery' | 'activity' | 'sources';

export const VIEWS: Record<View, { title: string; icon: ComponentType<{ size?: number }> }> = {
  launches: { title: 'Launches', icon: ListChecks },
  timeline: { title: 'Timeline', icon: CalendarRange },
  recovery: { title: 'Recovery', icon: LifeBuoy },
  supply: { title: 'Supply', icon: Package },
  software: { title: 'Software', icon: Cpu },
  issues: { title: 'Issues', icon: Bug },
  testlab: { title: 'Test lab', icon: FlaskConical },
  activity: { title: 'Activity', icon: Activity },
  sources: { title: 'Data sources', icon: Database },
};
