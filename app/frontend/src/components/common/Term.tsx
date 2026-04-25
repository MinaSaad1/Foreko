import type { ReactNode } from"react";
import { Popover } from"./Popover";
import { TermPopoverBody } from"./TermPopoverBody";
import { getTerm } from"@/data/termDictionary";

interface TermProps {
  k: string;
  children?: ReactNode;
  className?: string;
}

export function Term({ k, children, className ="" }: TermProps) {
  const term = getTerm(k);
  if (!term) {
    return <span className={className}>{children ?? k}</span>;
  }

  const label = children ?? term.label;
  return (
    <Popover
      ariaLabel={`Definition: ${term.label}`}
      openOnHover
      trigger={
        <button
          type="button"
          aria-describedby={`term-${term.key}-desc`}
          className={`cursor-help border-b border-dashed border-text-muted/60 font-medium text-text-primary decoration-dashed underline-offset-2 hover:border-accent hover:text-accent focus:border-accent focus:text-accent ${className}`}
        >
          {label}
        </button>
      }
    >
      <TermPopoverBody term={term} />
    </Popover>
  );
}
