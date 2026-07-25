import { ChangeStatus } from './changeModel';

/** A user-facing change type; renames and copies share one category. */
export type StatusCategory = 'A' | 'M' | 'D' | 'RC';

export interface StatusOption {
  category: StatusCategory;
  label: string;
}

const OPTIONS: StatusOption[] = [
  { category: 'A', label: 'Added' },
  { category: 'M', label: 'Modified' },
  { category: 'D', label: 'Deleted' },
  { category: 'RC', label: 'Renamed / Copied' },
];

function categoryOf(status: ChangeStatus): StatusCategory {
  return status === 'R' || status === 'C' ? 'RC' : status;
}

/** Toggles tree entries on/off by change type; every type is shown by default. */
export class StatusFilter {
  private readonly enabled: Set<StatusCategory>;

  constructor(enabled?: Iterable<StatusCategory>) {
    this.enabled = new Set(enabled ?? OPTIONS.map((option) => option.category));
  }

  static get options(): readonly StatusOption[] {
    return OPTIONS;
  }

  get isActive(): boolean {
    return this.enabled.size < OPTIONS.length;
  }

  keep(status: ChangeStatus): boolean {
    return this.enabled.has(categoryOf(status));
  }

  has(category: StatusCategory): boolean {
    return this.enabled.has(category);
  }

  summary(): string {
    const shown = OPTIONS.filter((option) => this.enabled.has(option.category));
    return `status: ${shown.map((option) => option.label).join(', ') || 'none'}`;
  }
}
