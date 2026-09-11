/**
 * GroupIcon - Icon for a memory-file category, tinted with the category color.
 *
 * Replaces the emoji that used to mark each group. Category colors are semantic
 * — they identify the file type — so they deliberately do NOT follow the
 * colorway, and stay recognisable across every theme.
 */

import { Brain, FileText, Link2, Lock, Shield, User } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

const GROUP_ICONS: Record<string, LucideIcon> = {
  Managed: Shield,
  User: User,
  Project: FileText,
  Local: Lock,
  AutoMem: Brain,
  Index: Link2,
};

interface GroupIconProps {
  type: string;
  color: string;
  className?: string;
}

export const GroupIcon = ({
  type,
  color,
  className = 'size-3.5 shrink-0',
}: GroupIconProps): React.JSX.Element => {
  const Icon = GROUP_ICONS[type] ?? FileText;
  return <Icon className={className} style={{ color }} strokeWidth={2} aria-hidden="true" />;
};
